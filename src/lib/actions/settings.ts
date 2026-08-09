"use server";

import { getViewer } from "@/lib/auth/viewer";
import { fail, type ActionResult, revalidate } from "@/lib/actions/shared";
import { prisma } from "@/lib/prisma";
import { ROOM_NAME_MAX } from "@/lib/profile";

/**
 * 설정 · 알림 (S-11 · S-12 · S-22).
 */

/**
 * 프로필 저장 (S-11).
 *
 * ⚠️ **방 이름은 유일값이 아니다** (FR-05-A-06). 컬렉터의 방은 계정 핸들이
 * 아니라 **공간 이름**이다 — 중복을 막으면 "시계방"을 아무도 못 쓴다.
 * 방 이름·소개는 유저가 쓴 것이라 **번역하지 않는다** (FR-01-C-02).
 */
export async function updateProfile(input: {
  roomName: string;
  bio?: string;
  /** 방 대표 이미지 (S-24·S-16). `null` 이면 지운다 */
  imageUrl?: string | null;
  /**
   * 선호 카테고리 key 목록 (D-124). `undefined` 면 건드리지 않는다 —
   * 설정 화면이 이 항목을 안 보내는 경우와 "전부 해제"를 구분해야 한다
   */
  preferredCategories?: string[];
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  const name = input.roomName.trim();
  if (!name) return fail({ roomName: "방 이름을 입력해주세요" });
  if ([...name].length > ROOM_NAME_MAX) {
    return fail({ roomName: `방 이름은 ${ROOM_NAME_MAX}자까지예요` });
  }

  // ⚠️ **세션의 `roomId` 를 `where` 에 쓰지 않는다** (D-132). 그 값은 로그인
  // 시점 JWT 에 박혀 있어 낡을 수 있다 — 방이 지워졌거나 세션이 다른 DB 에서
  // 발급됐으면 "레코드를 찾을 수 없다"로 터진다. `Room.userId` 가 유일값이므로
  // 유저를 기준으로 찾는 것이 항상 맞다
  await prisma.room.update({
    where: { userId: viewer.userId },
    data: {
      name,
      bio: input.bio?.trim() || null,
      // `undefined` 는 Prisma 가 무시한다 — 안 보낸 것과 지운 것이 갈린다
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    },
  });

  if (input.preferredCategories) {
    await prisma.user.update({
      where: { id: viewer.userId },
      data: {
        // `set` 이라 빈 배열이면 전부 해제된다 — 그게 의도다 (FR-09-B-04)
        preferredCategories: {
          set: input.preferredCategories.map((key) => ({ key })),
        },
      },
    });
  }

  revalidate("/[locale]/me");
  revalidate("/[locale]/me/settings");
  // 선호 카테고리가 피드 기본 필터를 바꾼다 (FR-09-B-05)
  revalidate("/[locale]");
  return { ok: true };
}

/**
 * 타임존을 **조용히 1회** 기록한다 (D-122, FR-09-C).
 *
 * ## ⚠️ 이미 있으면 덮지 않는다
 * 설정에서 직접 고른 값을, 다른 기기에서 접속했다는 이유로 되돌리면 안 된다.
 * `timezone: null` 인 경우에만 쓴다 — 그래서 컬럼을 nullable 로 바꿨다.
 * `@default("UTC")` 였을 때는 "수집 안 됨"과 "UTC 를 골랐음"이 같은 값이었다.
 *
 * ## ⚠️ 실패해도 조용히 넘어간다
 * 유저가 요청한 적 없는 동작이다. 여기서 오류를 띄우면 **가입 첫 화면에서
 * 영문 모를 실패 메시지**를 보게 된다. 타임존이 없으면 `UTC` 로 동작한다
 */
export async function recordTimezone(timezone: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  // IANA 이름인지 확인한다. 아무 문자열이나 넣으면 `userLocalDate` 가 던진다
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return;
  }

  try {
    await prisma.user.updateMany({
      // ⚠️ `where` 에 `timezone: null` 을 건다. 읽고 나서 쓰면 경합에 뚫린다
      where: { id: viewer.userId, timezone: null },
      data: { timezone },
    });
  } catch {
    // 조용히 넘어간다 — 위 주석 참조
  }
}

/**
 * 방 공개 전환 (S-11, myroom F-02 A).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 비공개면 **개별 아이템 공개 설정을 무시**한다 | D-019, FR-02-A-04 |
 * | 비공개 전환 시 판매중이 마켓에서 내려감을 **사전 안내** | FR-02-A-05 |
 * | 공개 복귀 시 판매중을 **자동으로 다시 노출** | D-071, FR-02-A-06 |
 * | 공개 복귀 시 가격·통화·링크 **재입력 요구 금지** | D-071, FR-02-A-08 |
 *
 * ## ⚠️ 아이템의 `saleStatus` 를 건드리지 않는 것이 핵심이다
 * 비공개로 갈 때 판매중을 `DISPLAYED` 로 내려버리면 **공개로 돌아올 때 무엇을
 * 되돌려야 할지 알 수 없다.** 방 상태만 바꾸고 **노출 여부는 조회 계층이
 * 판정한다** — `publicRoomWhere()` 가 방 공개를 조건으로 걸고 있어서, 방이
 * 공개로 돌아오는 순간 판매중이 자동으로 마켓에 다시 뜬다 (FR-02-A-06).
 *
 * 이게 D-071 이 요구한 "재입력 요구 금지"의 실제 구현이다 — 값을 아예 안
 * 건드렸으니 되돌릴 것도 없다.
 */
export async function setRoomVisibility(
  visibility: "PUBLIC" | "PRIVATE",
): Promise<ActionResult<{ affectedListings: number }>> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  // 안내에 쓸 숫자 — 몇 건이 영향을 받는지 (FR-02-A-05·07)
  const affectedListings = await prisma.item.count({
    where: { roomId: viewer.roomId, saleStatus: "ON_SALE" },
  });

  await prisma.room.update({
    // 위와 같은 이유로 유저 기준이다 (D-132)
    where: { userId: viewer.userId },
    data: { visibility },
  });

  revalidate("/[locale]/me");
  revalidate("/[locale]/market");
  revalidate("/[locale]");
  return { ok: true, affectedListings };
}

/**
 * 언어·타임존 설정 (S-12).
 *
 * ⚠️ **언어는 NEW 피드 언어권 필터의 기준값이다** (D-027, FR-03-B-02) —
 * 표시 언어만 바뀌는 것이 아니라 **내 아이템이 누구에게 보이는지**가 바뀐다.
 *
 * ⚠️ **타임존은 경험치 1일 1회 판정 기준이다** (D-056). 바꾸면 "오늘"의
 * 경계가 움직인다. 이미 부여된 로그는 건드리지 않는다 (D-058 — 회수 없음).
 */
export async function updateLanguage(input: {
  language: "ko" | "ja" | "en";
  timezone?: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  await prisma.user.update({
    where: { id: viewer.userId },
    data: {
      language: input.language,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    },
  });

  revalidate("/[locale]");
  return { ok: true };
}

/**
 * 알림 읽음 처리 (FR-08-A-05).
 *
 * ⚠️ **이미 읽은 것은 시각을 갱신하지 않는다.** 갱신하면 "언제 처음 읽었나"가
 * 사라진다. `readAt: null` 인 것만 채운다.
 */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  await prisma.notification.updateMany({
    // 남의 알림을 읽음 처리할 수 없다 — where 에 userId 를 함께 건다
    where: { id, userId: viewer.userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidate("/[locale]/notifications");
  return { ok: true };
}

/** 전체 읽음 — 뱃지를 한 번에 끈다 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  await prisma.notification.updateMany({
    where: { userId: viewer.userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidate("/[locale]/notifications");
  return { ok: true };
}
