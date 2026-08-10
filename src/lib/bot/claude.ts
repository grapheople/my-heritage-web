/**
 * 봇 글 생성 — Claude (D-146).
 *
 * ## ⚠️ SDK 를 쓰지 않고 `fetch` 로 부른다
 * 요청이 두 종류뿐이고 스트리밍도 쓰지 않는다. 의존성을 늘리면 배포 크기와
 * 취약점 표면이 같이 늘어난다.
 *
 * ## ⚠️ 서버 전용이다
 * `ANTHROPIC_API_KEY` 가 클라이언트에 닿으면 **누구나 우리 계정으로 호출한다.**
 * `NEXT_PUBLIC_` 접두어를 붙이지 않는 것이 유일한 방어선이므로, 이 모듈을
 * 클라이언트에서 import 하면 런타임에 터지게 둔다 (`lib/storage.ts` 와 같은 구조).
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/bot/claude.ts 는 서버 전용입니다. API 키가 클라이언트로 나가면 안 됩니다 (D-146).",
  );
}

/**
 * 모델 — 짧은 한국어 문장 생성이라 Sonnet 으로 충분하다.
 *
 * ⚠️ Opus 를 기본으로 두지 않는 이유: 콘텐츠 시딩은 **수십~수백 번** 부르는
 * 작업이다. 문장 품질 차이보다 비용 차이가 먼저 드러난다.
 */
const MODEL = process.env.BOT_CLAUDE_MODEL || "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

type Msg = { role: "user"; content: string };

async function ask(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }] satisfies Msg[],
    }),
  });

  if (!res.ok) {
    // 본문에 키가 실리지 않는다 — 상태 코드와 메시지만 남긴다
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Claude 호출 실패 ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude 응답이 비어 있습니다");
  return text;
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
    600,
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
    100,
  );
  return unwrap(text).split("\n")[0].slice(0, 30);
}
