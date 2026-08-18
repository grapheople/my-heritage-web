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
 * 아이템 별칭 (D-112 — 같은 도감 아이템을 구분하는 유저 별칭).
 *
 * 명칭은 파생값이라 봇이 만들지 않는다 (D-073). 별칭만 짓는다.
 */
export async function writeItemNickname(input: {
  itemName: string;
  locale: "ko" | "ja" | "en";
}): Promise<string> {
  const lang = { ko: "한국어", ja: "일본어", en: "영어" }[input.locale];
  const text = await ask(
    `수집품에 붙일 짧은 별칭을 ${lang}로 하나만 지어줘.

물건: ${input.itemName}

조건:
- 12자 이내, 한 줄
- 소유자가 애정을 담아 부르는 이름 느낌
- 물건 이름을 그대로 반복하지 마
- 따옴표·설명·이모지 없이 별칭만 출력`,
  );
  return unwrap(text).split("\n")[0].slice(0, 30);
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

/**
 * 운동 마스터 후보 하나 (D-227·D-232, `FR-11-B-01·05`).
 *
 * ⚠️ **분류 값은 `AttributeOption.key`** 다 — `chest`·`barbell` 처럼. 모델이 라벨
 * ("가슴")로 답하면 코드가 버린다 (`sanitizeExerciseFields`). 그래서 프롬프트에
 * **선택지 목록을 키로** 주입한다.
 */
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
