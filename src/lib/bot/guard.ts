import { existsSync } from "node:fs";
import { join } from "node:path";
import { describeDatabase, runtimeDatabaseUrl } from "@/lib/db-url";

/**
 * 봇 기능 가드 (D-146).
 *
 * ## ⚠️ 로컬 전용이다 — 프로덕션에는 이 경로가 없어야 한다
 * 봇은 **실제 유저 콘텐츠를 만든다.** 프로덕션에서 실행 가능하면 누군가
 * 실수로 눌러 서비스가 가짜 컬렉션으로 채워진다. 되돌리려면 어느 아이템이
 * 봇 것인지 일일이 골라야 한다.
 *
 * ## ⚠️ 그러나 "로컬"이 "안전"을 뜻하지 않는다
 * 로컬 런타임은 **Supabase(프로덕션 DB)를 본다** (D-117). 즉 로컬에서 봇을
 * 돌리면 **실제 서비스에 콘텐츠가 들어간다.** 그래서 화면에 **대상 DB를
 * 항상 표시한다** — D-116 에서 "어디에 쓰는지 보이지 않는 쓰기"가 사고의
 * 본질이었다.
 */
export function botEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * 화면에 띄울 대상 DB — 비밀번호는 들어가지 않는다 (`describeDatabase`).
 *
 * ## ⚠️ **런타임 URL 을 본다 — 마이그레이션 URL 이 아니다**
 * 초판은 `migrationDatabaseUrl()`(= `DIRECT_URL` 우선)을 썼다. 그런데 봇·조사가
 * 실제로 쓰는 것은 `prisma` 이고 그것은 **`runtimeDatabaseUrl()`(= `DATABASE_URL`)**
 * 이다. 둘이 다른 환경에서는 **표시와 실제가 어긋난다** — 실측하니 화면은
 * `…supabase.com`(운영)인데 쓰기는 `localhost` 로 가고 있었다.
 *
 * 반대 방향이면 그대로 사고다: **화면은 `localhost` 인데 운영 DB 에 쓰는** 상태.
 * D-116 이 막으려던 "어디에 쓰는지 보이지 않는 쓰기"를 표시가 **거꾸로 안내**하고
 * 있었다. 안전 표시는 **쓰기가 실제로 지나가는 경로**를 가리켜야 한다.
 */
export function botTargetDb(): string {
  return describeDatabase(runtimeDatabaseUrl());
}

/**
 * 로컬 `claude` CLI 가 있는가 (D-149).
 *
 * ⚠️ **API 키를 보지 않는다.** 글 생성은 개발자 기기의 Claude Code CLI 를
 * 부른다 — 키를 하나 덜 다루고, 원격에서는 애초에 동작하지 않는 것이 의도다.
 *
 * 없으면 글 생성만 막히고 봇 생성·아이템 등록은 동작한다.
 */
export function claudeConfigured(): boolean {
  const bin = process.env.CLAUDE_CLI_PATH || "claude";
  // 절대 경로면 파일 존재로, 이름이면 PATH 탐색으로 판정한다
  try {
    if (bin.includes("/")) return existsSync(bin);
    const paths = (process.env.PATH || "").split(":");
    return paths.some((d) => d && existsSync(join(d, bin)));
  } catch {
    return false;
  }
}
