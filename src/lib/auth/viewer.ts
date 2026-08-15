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
  // ⚠️ 스코프 밖(스크립트)에서는 쿠키가 없다. 던지면 위 `getViewer` 의
  // try/catch 가 다시 여기로 들어와 무한이다 — 여기서 흡수한다
  try {
    const jar = await cookies();
    if (jar.get("dev-logged-out")?.value === "1") return null;
  } catch {
    // 쿠키가 없으면 "로그아웃 흉내"도 없다. 그대로 개발 유저로 간주한다
  }

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
  // ⚠️ `auth()` 는 **요청 스코프**를 요구해서 스크립트에서 부르면 던진다.
  // 여기서 던지면 Server Action 을 스크립트로 검증할 수 없고, **검증할 수
  // 없는 코드가 곧 미검증 위험**이다 — 개발 우회로가 D-078·D-096 을 가렸던
  // 일이 그렇게 생겼다. `getAdmin()` 이 같은 이유로 같은 처리를 한다.
  //
  // 프로덕션에서는 `devViewer()` 가 `NODE_ENV` 에서 막히므로 열리지 않는다.
  let session = null;
  try {
    session = await auth();
  } catch {
    return devViewer();
  }
  if (session?.user?.id) {
    /*
      ⚠️ **JWT 값을 그대로 믿지 않고 DB 로 확인한다** (D-204).

      ## 왜 — 세션은 살아 있는데 DB 에 유저가 없을 수 있다
      JWT 는 발급 시점 스냅샷이라 **DB 를 바꾸거나(로컬↔운영) 유저 행이
      사라지면** 세션만 남는다. 그 상태에서 각 화면의 가드는 서로에게 떠넘긴다:

          /me      viewer 는 있는데 방을 못 찾음  → /me/settings
          /settings 프로필도 못 찾음              → /login
          /login   "이미 로그인했으니 되돌린다"   → /        ← 홈으로 튕김

      세 판정이 각자는 맞는데 이어지면 **마이룸에 영영 못 들어간다.** 실제로
      그 고리가 관측됐다.

      ## roomId·needsRoomName 도 DB 값을 쓴다
      **D-132 가 이미 같은 판단을 했다** — `createItemAs` 는 "세션의 `roomId` 는
      로그인 시점에 박혀 있어 낡을 수 있고, 낡으면 외래키 위반으로 터진다"며
      직접 조회한다. 그 규칙을 **여기 한 곳으로 올린다** — 호출부마다 다시
      확인하게 두면 빠뜨리는 곳이 생긴다.

      부수 효과로 `needsOnboarding` 의 구멍도 닫힌다: 낡은 토큰이
      `needsRoomName: false` 라고 말하면 온보딩이 건너뛰어졌었다.

      ## 비용
      세션이 있는 요청마다 조회 1회. `(user)/layout.tsx` 가 이미 뷰어를 얻고
      `needsOnboarding` 이 조건부로 DB 를 보고 있어 새로 생기는 왕복은 사실상
      그것을 대체한다.
    */
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, deletedAt: true, room: { select: { id: true, name: true } } },
    });
    // ⚠️ **없거나 탈퇴한 유저는 비로그인으로 떨어뜨린다.** `/login` 으로 보내지
    // 않는다 — 세션 쿠키가 남아 있으면 `/login` 이 다시 홈으로 튕긴다
    if (!user || user.deletedAt) return null;
    return {
      userId: user.id,
      roomId: user.room?.id,
      needsRoomName: !user.room?.name,
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

/**
 * 가입 직후 프로필 설정(S-24)이 필요한가 (FR-09-A-02).
 *
 * ## ⚠️ 세션 값만 믿으면 온보딩을 무한 반복한다
 * `needsRoomName` 은 **로그인 시점에 발급된 JWT** 에 박혀 있다. 방 이름을
 * 저장해도 그 토큰은 재로그인 전까지 `true` 인 채로 남는다 — 가드가 그 값만
 * 보면 저장하자마자 다시 온보딩으로 돌아온다.
 *
 * 그래서 **토큰이 `true` 라고 말할 때만 DB 로 확인한다.** 토큰이 `false` 면
 * 조회하지 않는다 — 대부분의 요청이 그쪽이라 비용이 붙지 않는다.
 */
export async function needsOnboarding(viewer: Viewer): Promise<boolean> {
  if (!viewer.needsRoomName) return false;
  if (!viewer.roomId) return true;
  const room = await prisma.room.findUnique({
    where: { id: viewer.roomId },
    select: { name: true },
  });
  return !room?.name;
}
