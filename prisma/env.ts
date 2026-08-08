/**
 * 스크립트용 환경 변수 로더.
 *
 * ## ⚠️ `dotenv/config` 만으로는 `.env.local` 을 못 읽는다
 * Next.js 는 `.env.local` → `.env` 순으로 읽고 앞의 것이 이긴다. 그런데
 * `dotenv/config` 는 `.env` 하나만 읽는다. 그래서 **앱과 Prisma CLI 가 서로
 * 다른 DB 를 보는** 상태가 만들어진다 — 실제로 그 상태였다.
 *
 * 로딩 순서를 Next.js 와 맞춘다. `dotenv` 는 **이미 설정된 값을 덮어쓰지
 * 않으므로** 먼저 읽은 쪽이 이긴다.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
