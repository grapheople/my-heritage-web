import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  codexJsonSkeleton,
  codexKeyList,
  fieldsTable,
  jsonSkeleton,
  sanitize,
  sanitizeCodexCandidates,
  type BotField,
  type CodexCandidate,
  type Sanitized,
} from "@/lib/bot/fields";
import { loadPrompt } from "@/lib/bot/prompts";

/**
 * 봇 글 생성 — **로컬 Claude Code CLI** (D-149).
 *
 * ## ⚠️ API 키를 쓰지 않는다
 * 초판은 Anthropic API 를 `fetch` 로 불렀다. 그러려면 `ANTHROPIC_API_KEY` 를
 * 저장소 환경에 두고 관리해야 하는데, **봇은 로컬 어드민 전용**이라(D-146)
 * 개발자 기기에 이미 있는 `claude` CLI 를 쓰는 편이 맞다 — 키를 하나 덜 다룬다.
 *
 * ## ⚠️ 원격에서는 동작하지 않는다 — 의도된 것이다
 * Vercel 런타임에는 `claude` 바이너리가 없다. 봇 자체가 `NODE_ENV=development`
 * 로 막혀 있으므로(D-146) 프로덕션에서 이 경로에 닿을 일이 없다.
 *
 * ## ⚠️ 서버 전용이다
 * 자식 프로세스를 띄운다. 클라이언트에서 import 하면 런타임에 터지게 둔다
 * (`lib/storage.ts` 와 같은 구조).
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/bot/claude.ts 는 서버 전용입니다. 자식 프로세스를 띄웁니다 (D-149).",
  );
}

const execFileAsync = promisify(execFile);

/** CLI 경로 — PATH 에 없으면 환경 변수로 지정한다 */
const BIN = process.env.CLAUDE_CLI_PATH || "claude";
/** 한 번 호출 상한. 넘으면 죽인다 — 어드민이 무한정 기다리지 않게 */
const TIMEOUT_MS = 120_000;
/** 자료 수집은 항목이 10개가 넘어 더 오래 걸린다 (D-153) */
const RESEARCH_TIMEOUT_MS = 240_000;

async function ask(prompt: string, timeoutMs = TIMEOUT_MS): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      BIN,
      // ⚠️ `-p`(print) 가 비대화 모드다. 없으면 세션이 열려 응답이 오지 않는다.
      // 프롬프트는 **인자로** 넘긴다 — 셸을 경유하지 않으므로 따옴표·개행이
      // 섞여도 주입되지 않는다 (`execFile` 은 셸을 쓰지 않는다)
      ["-p", prompt],
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        // ⚠️ 웹 프로세스의 CWD 가 저장소 루트다. CLI 가 그 컨텍스트를 읽지
        // 않도록 홈으로 옮긴다 — 프로젝트 파일을 프롬프트에 끌어올 이유가 없다
        cwd: process.env.HOME || undefined,
      },
    );
    const text = stdout.trim();
    if (!text) throw new Error("빈 응답");
    return text;
  } catch (e) {
    const err = e as { code?: string | number; message?: string };
    if (err.code === "ENOENT") {
      throw new Error(
        `\`${BIN}\` 를 찾을 수 없습니다. Claude Code CLI 를 설치하거나 CLAUDE_CLI_PATH 를 지정하세요`,
      );
    }
    throw new Error(`claude CLI 실패 — ${err.message ?? String(e)}`);
  }
}

/** 응답에서 코드펜스·따옴표를 벗긴다 — 모델이 자주 감싼다 */
function unwrap(s: string): string {
  return s
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

/**
 * 일기 본문 (diary D-053 — 1000자 상한, D-055 — 플레인 텍스트).
 *
 * ⚠️ **마크다운을 쓰지 말라고 명시한다.** 본문은 플레인 텍스트로 저장되고
 * 렌더에서 해석하지 않으므로(D-055), `**강조**` 가 그대로 보인다.
 */
export async function writeDiaryBody(input: {
  itemName: string;
  categoryLabel: string;
  locale: "ko" | "ja" | "en";
}): Promise<string> {
  const lang = { ko: "한국어", ja: "일본어", en: "영어" }[input.locale];
  const text = await ask(
    `수집품 기록 서비스에 올릴 짧은 일기를 ${lang}로 써줘.

물건: ${input.itemName} (${input.categoryLabel})

조건:
- 2~4문장, 300자 이내
- 실제 소유자가 쓴 것처럼 담담하게. 광고 문구·과장 금지
- 마크다운 문법을 쓰지 마. 순수 텍스트만 (별표·해시·링크 금지)
- 제목이나 머리말 없이 본문만
- 이모지 금지

본문만 출력해.`,
  );
  return unwrap(text).slice(0, 1000);
}


/**
 * 아이템 항목 **전체**를 자료 수집으로 채운다 (D-153).
 *
 * ## ⚠️ 프롬프트는 이 파일에 없다
 * `prompts/bot-item-research.md` 를 읽는다. 문구를 고칠 때 코드를 만지지 않게
 * 하려는 것이 목적이다 — 프롬프트는 정책 문서에 가깝다.
 *
 * ## ⚠️ 응답을 그대로 저장하지 않는다
 * `sanitize` 를 반드시 통과시킨다. `createItemAs` 는 옵션 키·날짜 형식을 보지
 * 않으므로(`lib/bot/fields.ts` 참조) 여기서 걸러야 한다.
 *
 * ## ⚠️ 등록하지 않고 **돌려준다**
 * 어드민이 화면에서 확인·수정한 뒤 등록한다. 곧바로 저장하면 잘못된 고유값이
 * 검토 없이 도감이 된다 (D-015) — 사람이 한 번 보는 단계를 남긴다.
 */
export async function researchItemContent(input: {
  fields: BotField[];
  categoryKey: string;
  categoryLabel: string;
  brand: string;
  hint: string;
  locale: "ko" | "ja" | "en";
  today: string;
}): Promise<Sanitized> {
  const lang = { ko: "한국어", ja: "일본어", en: "영어" }[input.locale];
  const prompt = await loadPrompt("bot-item-research", {
    categoryKey: input.categoryKey,
    categoryLabel: input.categoryLabel,
    brand: input.brand || "(지정되지 않음 — 힌트에서 판단)",
    hint: input.hint || "(없음 — 이 브랜드의 대표적인 제품 하나를 고르세요)",
    today: input.today,
    lang,
    fields: fieldsTable(input.fields),
    jsonSkeleton: jsonSkeleton(input.fields),
  });

  const text = await ask(prompt, RESEARCH_TIMEOUT_MS);
  return sanitize(input.fields, parseJson(text), input.today);
}

/**
 * 도감 후보를 **여러 건** 조사한다 (A-04, D-185).
 *
 * ## ⚠️ 왜 1건씩이 아닌가
 * 도감을 미리 채우는 것이 목적이다. 1건씩이면 브랜드마다 입력·대기·확인을
 * 반복해야 하고, CLI 호출이 건당 수십 초라 **수십 건을 넣는 데 쓸 수 없다.**
 * 한 번 물어서 N 건을 받는다.
 *
 * ## ⚠️ 요청 건수가 보장이 아니다 — 그것이 설계다
 * 확실하지 않은 후보는 프롬프트가 빼도록 지시하고, `sanitizeCodexCandidates` 가
 * 식별 값이 빈 행을 다시 버린다. **10건을 요청해서 4건이 오는 것이 정상**이다.
 * 건수를 맞추려고 추측을 통과시키면 실재하지 않는 도감이 생기고(D-015), 그
 * 도감은 그 물건을 가진 **모든 유저**에게 "같은 물건"으로 노출된다.
 *
 * ## ⚠️ 등록하지 않고 돌려준다
 * `researchItemContent` 와 같은 이유다 — 어드민이 표에서 보고 고친 뒤 등록한다.
 */
export async function researchCodexEntries(input: {
  fields: BotField[];
  categoryKey: string;
  categoryLabel: string;
  brand: string;
  hint: string;
  count: number;
}): Promise<{ candidates: CodexCandidate[]; dropped: string[] }> {
  const prompt = await loadPrompt("codex-research", {
    categoryKey: input.categoryKey,
    // ⚠️ 키가 아니라 이름을 넘긴다 (D-167) — `workout` 만 보고는 무엇을 고를지 모른다
    categoryLabel: input.categoryLabel,
    brand: input.brand || "(지정되지 않음 — 힌트에서 판단)",
    hint: input.hint || "(없음 — 이 카테고리의 대표적인 제품을 고르세요)",
    count: String(input.count),
    keyParts: codexKeyList(input.fields),
    jsonSkeleton: codexJsonSkeleton(input.fields),
  });

  const text = await ask(prompt, RESEARCH_TIMEOUT_MS);
  return sanitizeCodexCandidates(input.fields, parseJsonArray(text));
}

export type CodexClassification = {
  id: string;
  /** 종류 키 또는 `unknown` */
  subtype: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

/**
 * 기존 도감을 **종류로 나눈다** (D-257).
 *
 * ## ⚠️ 수집(`researchCodexEntries`)과 목적이 반대다
 * 저기는 없는 것을 만들어 오고, 여기는 **이미 있는 것을 나눈다.** 그래서 규칙도
 * 반대다 — 저기는 "모르면 후보를 내지 마라", 여기는 **"모르면 `unknown` 이라고
 * 말해라"**. 빠뜨리면 그 도감이 조용히 미분류로 남는다.
 *
 * ## ⚠️ `unknown` 은 실패가 아니라 검출 신호다
 * 어느 종류에도 안 맞는 것은 대개 **애초에 그 카테고리가 아니다** — 캠핑 도감에
 * 부츠·로프·헬멧이 섞여 있었다 (D-216). 억지로 고르게 만들면 그 신호가 사라진다.
 *
 * ## ⚠️ 결과를 DB 에 바로 넣지 않는다
 * 호출부가 제안 파일로 내고 사람이 훑는다 (D-185 와 같은 태도). 오분류는
 * **조용히** 망가진다 — 잘못된 종류로 들어가면 유저 아이템과 안 만나는데
 * 화면상으로는 정상으로 보인다.
 */
export async function classifyCodexItems(input: {
  categoryLabel: string;
  subtypes: { key: string; label: string }[];
  items: { id: string; displayName: string }[];
}): Promise<CodexClassification[]> {
  const prompt = await loadPrompt("codex-classify", {
    categoryLabel: input.categoryLabel,
    subtypeList: input.subtypes.map((s) => `- \`${s.key}\` — ${s.label}`).join("\n"),
    items: input.items.map((i) => `- ${i.id} · ${i.displayName}`).join("\n"),
  });

  const text = await ask(prompt, RESEARCH_TIMEOUT_MS);
  const rows = parseJsonArray(text);

  const valid = new Set(input.subtypes.map((s) => s.key));
  const asked = new Map(input.items.map((i) => [i.id, i.displayName]));

  return rows.flatMap((r): CodexClassification[] => {
    const row = r as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    // ⚠️ 모델이 지어낸 id 는 버린다 — 엉뚱한 도감을 옮기는 것보다 빠뜨리는 게 낫다
    if (!asked.has(id)) return [];
    const raw = typeof row.subtype === "string" ? row.subtype : "unknown";
    // 목록 밖의 종류도 unknown 으로 떨어뜨린다 (D-190 — 고르지 않는다)
    const subtype = valid.has(raw) ? raw : "unknown";
    const conf = row.confidence;
    return [
      {
        id,
        subtype,
        confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : "low",
        note: typeof row.note === "string" ? row.note : "",
      },
    ];
  });
}

/**
 * 운동 마스터 후보 하나 (D-227·D-232, `FR-11-B-01·05`).
 *
 * ⚠️ **분류 값은 `AttributeOption.key`** 다 — `chest`·`barbell` 처럼. 모델이 라벨
 * ("가슴")로 답하면 코드가 버린다 (`sanitizeExerciseFields`). 그래서 프롬프트에
 * **선택지 목록을 키로** 주입한다.
 */
/** 현지화된 표시명 1건 (D-279) */
export type CodexLocalization = { id: string; ko: string; ja: string };

/**
 * 기존 도감의 **표시명을 한국어·일본어로 채운다** (D-279).
 *
 * ## ⚠️ `researchCodexEntries` 와 **정반대 규칙**이다
 * 저기(D-278)는 *"번역·음차 금지, 비우는 것이 기본"* 이다. **새 도감을 만들 때는**
 * 그것이 맞다 — 확신 없는 표기를 붙이면 그 물건을 가진 모든 유저가 잘못된
 * 이름을 본다.
 *
 * 여기는 **이미 있는 도감 전체를 읽을 수 있게 만들라는 PM 지시**다. 목적이
 * "안 틀리기" 에서 "읽을 수 있게" 로 바뀌었으므로 규칙도 바뀐다.
 *
 * ⚠️ **두 프롬프트를 합치지 말 것** — 한쪽 규칙이 다른 쪽을 망친다.
 *
 * ## ⚠️ 고유번호는 원문 그대로 둔다
 * `126610LN` 을 `126610엘엔` 으로 옮기면 **유저가 자기 시계를 못 알아본다.**
 * 프롬프트가 금지하고, 호출부가 한 번 더 검산한다.
 *
 * ## ⚠️ 배치로 부른다
 * 1,000건을 한 건씩 물으면 CLI 호출이 건당 수십 초라 **수십 시간**이 든다.
 * `classifyCodexItems` 와 같은 형태로 묶는다.
 *
 * ⚠️ **모델이 지어낸 `id` 는 버린다** — 엉뚱한 도감의 이름을 바꾸는 것보다
 * 빠뜨리는 게 낫다 (`classifyCodexItems` 와 같은 태도).
 */
export async function localizeCodexNames(input: {
  categoryLabel: string;
  items: { id: string; displayName: string }[];
}): Promise<CodexLocalization[]> {
  const prompt = await loadPrompt("codex-localize", {
    categoryLabel: input.categoryLabel,
    items: input.items.map((i) => `- ${i.id} · ${i.displayName}`).join("\n"),
  });

  const text = await ask(prompt, RESEARCH_TIMEOUT_MS);
  const rows = parseJsonArray(text);
  const asked = new Set(input.items.map((i) => i.id));

  return rows.flatMap((r): CodexLocalization[] => {
    const row = r as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!asked.has(id)) return [];
    const one = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return [{ id, ko: one(row.ko), ja: one(row.ja) }];
  });
}

export type ExerciseCandidate = {
  displayName: string;
  targetMuscles: string[];
  equipmentType: string | null;
  mechanic: string | null;
  forceType: string | null;
};

/**
 * 운동 후보를 수집한다 (A-17, `FR-11-B-01·06·07`).
 *
 * ⚠️ **선택지 목록을 호출부가 넘긴다.** 이 함수가 DB 를 읽지 않는 것은 프롬프트
 * 조립과 데이터 조회를 섞지 않기 위해서다 — 조회를 여기 두면 테스트에서 이
 * 함수만 떼어낼 수 없다.
 *
 * ⚠️ **여기서 값을 검증하지 않는다.** 선택지 밖의 값은 저장 직전
 * `sanitizeExerciseFields` 가 버리고 **사유를 남긴다** (`FR-11-B-05`). 검증을 두
 * 곳에 두면 규칙이 갈린다 (D-190 의 교훈).
 */
export async function researchExercises(input: {
  hint: string;
  count: number;
  options: {
    muscles: string[];
    equipment: string[];
    mechanics: string[];
    forces: string[];
  };
}): Promise<{ candidates: ExerciseCandidate[]; dropped: string[] }> {
  const list = (keys: string[]) => keys.map((k) => `- \`${k}\``).join("\n");
  const prompt = await loadPrompt("exercise-research", {
    hint: input.hint || "(없음 — 대표적인 웨이트 트레이닝 종목)",
    count: String(input.count),
    muscles: list(input.options.muscles),
    equipment: list(input.options.equipment),
    mechanics: list(input.options.mechanics),
    forces: list(input.options.forces),
  });

  const text = await ask(prompt, RESEARCH_TIMEOUT_MS);
  const rows = parseJsonArray(text);

  const candidates: ExerciseCandidate[] = [];
  const dropped: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      dropped.push("객체가 아닌 항목");
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = typeof r.displayName === "string" ? r.displayName.trim() : "";
    // ⚠️ 이름 없는 후보는 **버린다.** 이름이 식별자다 (`FR-11-A-09`)
    if (!name) {
      dropped.push("운동명이 없는 항목");
      continue;
    }
    const muscles = Array.isArray(r.targetMuscles)
      ? r.targetMuscles.filter((m): m is string => typeof m === "string")
      : [];
    const one = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    candidates.push({
      displayName: name,
      targetMuscles: muscles,
      equipmentType: one(r.equipmentType),
      mechanic: one(r.mechanic),
      forceType: one(r.forceType),
    });
  }
  return { candidates, dropped };
}

/**
 * 첫 `[` 의 **짝이 맞는** `]` 까지 잘라낸다.
 *
 * ⚠️ **"첫 `[` ~ 마지막 `]`" 로는 안 된다.** 실제로 그렇게 만들었다가 자전거
 * 조사에서 터졌다 — 모델이 배열 뒤에 한 줄 설명을 붙였고 그 안에 `]` 가 있어서
 * 잘린 조각이 `[...]  설명 ]` 이 됐다. `parseJson` 이 객체에서 같은 방식으로
 * 버티는 것은 뒤에 붙는 글에 `}` 가 드물기 때문일 뿐이다.
 *
 * 문자열 안의 괄호는 세지 않는다 — 제품 명칭에 `[` 가 들어갈 수 있다.
 */
function sliceBalancedArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** 응답에서 JSON **배열**을 건져낸다 */
function parseJsonArray(text: string): unknown[] {
  const body = unwrap(text);
  const slice = sliceBalancedArray(body);
  if (!slice) {
    throw new Error(`JSON 배열을 찾을 수 없습니다 — 응답: ${body.slice(0, 120)}`);
  }
  try {
    const parsed = JSON.parse(slice);
    if (!Array.isArray(parsed)) throw new Error("배열이 아님");
    return parsed as unknown[];
  } catch (e) {
    throw new Error(`JSON 파싱 실패 — ${(e as Error).message}`);
  }
}

/**
 * 응답에서 JSON 을 건져낸다.
 *
 * ⚠️ **`JSON.parse(text)` 만 쓰면 자주 실패한다.** 모델이 코드펜스로 감싸거나
 * 앞뒤에 한 줄 설명을 붙인다. 첫 `{` 부터 마지막 `}` 까지를 잘라 쓴다.
 */
function parseJson(text: string): Record<string, unknown> {
  const body = unwrap(text);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`JSON 을 찾을 수 없습니다 — 응답: ${body.slice(0, 120)}`);
  }
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("객체가 아님");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    throw new Error(`JSON 파싱 실패 — ${(e as Error).message}`);
  }
}
