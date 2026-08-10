import { describeDatabase, migrationDatabaseUrl } from "@/lib/db-url";

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

/** 화면에 띄울 대상 DB — 비밀번호는 들어가지 않는다 (`describeDatabase`) */
export function botTargetDb(): string {
  return describeDatabase(migrationDatabaseUrl());
}

/** Claude 자격증명이 있는가 — 없으면 글 생성만 막고 나머지는 동작한다 */
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
