import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

async function ask(prompt: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      BIN,
      // ⚠️ `-p`(print) 가 비대화 모드다. 없으면 세션이 열려 응답이 오지 않는다.
      // 프롬프트는 **인자로** 넘긴다 — 셸을 경유하지 않으므로 따옴표·개행이
      // 섞여도 주입되지 않는다 (`execFile` 은 셸을 쓰지 않는다)
      ["-p", prompt],
      {
        timeout: TIMEOUT_MS,
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
