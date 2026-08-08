"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { fail, type ActionResult } from "@/lib/actions/shared";
import { prisma } from "@/lib/prisma";

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
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  const name = input.roomName.trim();
  if (!name) return fail({ roomName: "방 이름을 입력해주세요" });
  if ([...name].length > 30) return fail({ roomName: "방 이름은 30자까지예요" });

  await prisma.room.update({
    where: { id: viewer.roomId },
    data: { name, bio: input.bio?.trim() || null },
  });

  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]/me/settings", "page");
  return { ok: true };
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
    where: { id: viewer.roomId },
    data: { visibility },
  });

  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]/market", "page");
  revalidatePath("/[locale]", "page");
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

  revalidatePath("/[locale]", "page");
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

  revalidatePath("/[locale]/notifications", "page");
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

  revalidatePath("/[locale]/notifications", "page");
  return { ok: true };
}
