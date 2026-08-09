import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "./config";

/** `prisma/seed-dev.ts` 와 일치해야 한다 */
const DEV_SUBJECT = "dev-local-subject";

/**
 * "지금 이 화면을 누가 보고 있는가".
 *
 * 화면 코드는 `auth()`를 직접 부르지 않고 이것만 쓴다 — 로그인 판정 로직이
 * 화면마다 흩어지면 D-078·D-083 같은 규칙이 한 곳에서 새기 시작한다.
 */
export type Viewer = {
  userId: string;
  roomId?: string;
  /**
   * ⚠️ **타임존은 여기 두지 않는다** (D-121).
   *
   * 예전에는 있었는데 **개발 우회로만 채우고 진짜 세션은 비워뒀다.** 그래서
   * `viewer.timezone ?? "UTC"` 가 실사용자에게는 **항상 UTC** 로 떨어졌고,
   * D-056(경험치 1일 경계 = 유저 타임존)이 조용히 깨져 있었다.
   *
   * 필요한 곳에서 **DB 에서 직접 읽는다** (`userTimezone`). 세션(JWT)에 담으면
   * 설정 화면에서 바꿔도 재로그인 전까지 옛 값이 남는다.
   */
  /** 신규 가입 — 방 이름 미설정 (FR-05-A-05) */
  needsRoomName: boolean;
};

/**
 * ⚠️ **개발용 우회로.**
 *
 * OAuth 자격증명(`AUTH_GOOGLE_ID` 등)이 없으면 로그인을 할 수 없어 로그인
 * 전용 화면을 전혀 확인할 수 없다. `.env`에 자격증명이 없고 **개발 모드일
 * 때만** 개발용 유저로 간주한다.
 *
 * 프로덕션에서는 절대 작동하지 않는다 — `NODE_ENV` 와 자격증명 부재를
 * 동시에 요구한다. 자격증명이 채워지면 이 우회로는 자동으로 꺼진다.
 *
 * **DB 의 실제 행을 가리킨다** — `prisma/seed-dev.ts` 가 만든 유저다.
 * 하드코딩된 가짜 id 를 쓰면 Server Action 이 외래 키 위반으로 실패한다.
 *
 * ## ⚠️ 이 우회로는 비로그인 경로를 가린다
 * 우회로가 켜져 있으면 `isLoggedIn()` 이 **항상 true** 라서 D-078·D-096
 * (비로그인에게 보유자 수·소유자 목록을 가린다)을 **확인할 수 없다.**
 * 그래서 `dev-logged-out=1` 쿠키로 비로그인을 흉내낼 수 있게 둔다.
 *
 *     curl -b 'dev-logged-out=1' http://localhost:3002/ko/search?q=sub&tab=codex
 *
 * 우회로가 꺼져 있으면(자격증명 존재 / 프로덕션) 이 쿠키도 아무 효과가 없다.
 */
async function devViewer(): Promise<Viewer | null> {
  const isDev = process.env.NODE_ENV === "development";
  const hasOAuth = Boolean(
    process.env.AUTH_GOOGLE_ID || process.env.AUTH_APPLE_ID,
  );
  if (!isDev || hasOAuth) return null;

  // 우회로가 켜져 있는 동안만 읽는다. `auth()` 도 쿠키를 읽으므로
  // 렌더 전략(정적/동적)에 새로 미치는 영향은 없다
  const jar = await cookies();
  if (jar.get("dev-logged-out")?.value === "1") return null;

  const user = await prisma.user.findUnique({
    where: { provider_subject: { provider: "GOOGLE", subject: DEV_SUBJECT } },
    select: { id: true, room: { select: { id: true, name: true } } },
  });
  if (!user) {
    console.warn(
      "[auth] 개발용 유저가 없습니다. `pnpm db:seed-dev` 를 실행하세요 (D-097).",
    );
    return null;
  }
  return {
    userId: user.id,
    roomId: user.room?.id,
    needsRoomName: !user.room?.name,
  };
}

/** 로그인한 뷰어. 비로그인이면 `null` */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      roomId: session.user.roomId,
      needsRoomName: session.user.needsRoomName,
    };
  }
  return await devViewer();
}

/**
 * 로그인 여부만 필요한 곳. **D-078 에서 도감 소유자 목록·보유자 수 노출을
 * 가르는 판정이 이것이다.**
 */
export async function isLoggedIn(): Promise<boolean> {
  return (await getViewer()) !== null;
}
