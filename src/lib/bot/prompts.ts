import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 프롬프트를 **파일에서** 읽는다 (D-153).
 *
 * ## ⚠️ 왜 코드에 박지 않는가
 * 초판은 프롬프트를 `lib/bot/claude.ts` 안 템플릿 리터럴로 들고 있었다
 * (D-149). 문구를 한 줄 고치려면 코드를 고쳐야 했고, PM 이 직접 튜닝할 수
 * 없었다. 프롬프트는 **정책 문서에 가까운 산출물**이므로 파일로 분리한다 —
 * `prompts/*.md` 를 고치면 다음 호출부터 반영된다.
 *
 * ## ⚠️ 로컬 전용 경로다
 * 봇은 `NODE_ENV=development` 에서만 동작한다 (D-146). 파일 시스템 읽기가
 * 서버리스 번들에 포함되는지 신경 쓸 필요가 없다 — 프로덕션에 이 경로가 없다.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/bot/prompts.ts 는 서버 전용입니다. 파일 시스템을 읽습니다 (D-153).",
  );
}

const DIR = join(process.cwd(), "prompts");

/** 편집자 메모와 프롬프트 본문의 경계 */
const SPLIT = /\n---\n/;

/**
 * 프롬프트를 읽어 자리표시자를 채운다.
 *
 * ⚠️ **채우지 못한 자리표시자를 그냥 두지 않는다.** 이름을 잘못 쓰면
 * `{{fields}}` 가 그대로 모델에게 가서 **항목 목록이 빈 채로** 그럴싸한 JSON 이
 * 돌아온다 — 조용히 잘못된 결과가 나오는 쪽이 터지는 쪽보다 나쁘다.
 */
export async function loadPrompt(
  name: string,
  vars: Record<string, string>,
): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(DIR, `${name}.md`), "utf8");
  } catch {
    throw new Error(`프롬프트 파일을 찾을 수 없습니다 — prompts/${name}.md`);
  }

  // 첫 `---` 앞은 편집자 메모다. 모델에게 보내지 않는다 (토큰 낭비 + 혼선)
  const parts = raw.split(SPLIT);
  const body = (parts.length > 1 ? parts.slice(1).join("\n---\n") : raw).trim();

  const filled = body.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in vars)) {
      throw new Error(
        `prompts/${name}.md 의 {{${key}}} 를 채울 값이 없습니다 (코드와 프롬프트가 어긋났습니다)`,
      );
    }
    return vars[key];
  });

  if (!filled) throw new Error(`prompts/${name}.md 본문이 비어 있습니다`);
  return filled;
}
