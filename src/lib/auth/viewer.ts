import { auth } from "./config";

/**
 * "지금 이 화면을 누가 보고 있는가".
 *
 * 화면 코드는 `auth()`를 직접 부르지 않고 이것만 쓴다 — 로그인 판정 로직이
 * 화면마다 흩어지면 D-078·D-083 같은 규칙이 한 곳에서 새기 시작한다.
 */
export type Viewer = {
  userId: string;
  roomId?: string;
  /** 신규 가입 — 방 이름 미설정 (FR-05-A-05) */
  needsRoomName: boolean;
};

/**
 * ⚠️ **개발용 우회로.**
 *
 * OAuth 자격증명(`AUTH_GOOGLE_ID` 등)이 없으면 로그인을 할 수 없어 로그인
 * 전용 화면을 전혀 확인할 수 없다. `.env`에 자격증명이 없고 **개발 모드일
 * 때만** 픽스처 유저로 간주한다.
 *
 * 프로덕션에서는 절대 작동하지 않는다 — `NODE_ENV` 와 자격증명 부재를
 * 동시에 요구한다. 자격증명이 채워지면 이 우회로는 자동으로 꺼진다.
 */
function devViewer(): Viewer | null {
  const isDev = process.env.NODE_ENV === "development";
  const hasOAuth = Boolean(
    process.env.AUTH_GOOGLE_ID || process.env.AUTH_APPLE_ID,
  );
  if (!isDev || hasOAuth) return null;
  // lib/dev-fixture.ts 의 r-jun
  return { userId: "dev-user", roomId: "r-jun", needsRoomName: false };
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
  return devViewer();
}

/**
 * 로그인 여부만 필요한 곳. **D-078 에서 도감 소유자 목록·보유자 수 노출을
 * 가르는 판정이 이것이다.**
 */
export async function isLoggedIn(): Promise<boolean> {
  return (await getViewer()) !== null;
}
