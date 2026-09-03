"use server";

import { getViewer, type Viewer } from "@/lib/auth/viewer";
import {
  fail,
  ownItem,
  revalidate,
  userTimezone,
  type ActionResult,
} from "@/lib/actions/shared";
import { userLocalDate } from "@/lib/format";
import { WEAR_NOTE_MAX as NOTE_MAX } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

/**
 * 하루기록 작성·수정·삭제 (D-148).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 사진 **1장 필수** | D-148 — 하루기록의 본질 |
 * | 노트는 선택, 짧게 | D-148 |
 * | **아이템당 하루 1장** | D-148 — `@@unique([itemId, wornOn])` |
 * | 날짜는 **유저 타임존** 기준 | D-056 |
 * | 소유자만 | D-019 |
 *
 * ## ⚠️ 경험치를 주지 않는다
 * 일기는 그날 첫 작성에 20 을 준다 (D-026). 하루기록에도 주면 **같은 날 일기와
 * 하루기록을 둘 다 써서 두 배로 받는다** — 경험치는 보상이 아니라 리듬이라는
 * 원칙 7 이 깨진다. 늘리려면 별도 결정이 필요하다 (OI-76).
 */
/**
 * 오늘 날짜 (유저 타임존).
 *
 * ⚠️ **서버 UTC 날짜를 쓰면 자정 근처에서 어긋난다** (D-056). 한국 유저가
 * 밤 10시에 남긴 하루기록이 "다음 날" 로 기록되면 하루 1장 제약이 이상하게 걸린다.
 */
async function today(userId: string): Promise<string> {
  return userLocalDate(await userTimezone(userId));
}

export async function createWearShot(input: {
  itemId: string;
  photoUrl: string;
  note?: string;
}): Promise<ActionResult<{ wearShotId: string; wornOn: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  return createWearShotAs(viewer, input);
}

/** 본체 — 뷰어를 주입받는다 (스크립트로 검증 가능하게) */
export async function createWearShotAs(
  viewer: Viewer,
  input: { itemId: string; photoUrl: string; note?: string },
): Promise<ActionResult<{ wearShotId: string; wornOn: string }>> {
  // 없는 것과 남의 것을 구분하지 않는다 (D-083)
  const owned = await ownItem(viewer, input.itemId);
  if (!owned) return fail({}, "아이템을 찾을 수 없습니다");

  if (!input.photoUrl) return fail({ photo: "사진을 1장 올려주세요" });
  const note = input.note?.trim() || null;
  if (note && [...note].length > NOTE_MAX) {
    return fail({ note: `${NOTE_MAX}자를 넘을 수 없어요` });
  }

  const wornOn = await today(viewer.userId);

  try {
    const shot = await prisma.wearShot.create({
      data: { itemId: input.itemId, photoUrl: input.photoUrl, note, wornOn },
      select: { id: true },
    });
    revalidate("/[locale]/items/[itemId]", "/[locale]/me", "/[locale]/me/wear");
    return { ok: true, wearShotId: shot.id, wornOn };
  } catch {
    // ⚠️ `@@unique([itemId, wornOn])` 위반 = 오늘 이미 남겼다. **정상 흐름**이다.
    // 미리 세는 방식은 동시 요청에 뚫린다 (D-026 경험치와 같은 구조)
    return fail(
      {},
      "오늘은 이미 하루기록을 남겼어요. 바꾸려면 기존 것을 수정해주세요",
    );
  }
}

/**
 * 하루기록 수정 — 사진·노트만. **날짜는 못 바꾼다.**
 *
 * ⚠️ 날짜를 바꿀 수 있게 하면 "오늘의" 기록이 아니게 되고, 하루 1장 제약을
 * 우회해 과거를 임의로 채울 수 있다.
 */
export async function updateWearShot(input: {
  wearShotId: string;
  photoUrl: string;
  note?: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  const shot = await prisma.wearShot.findFirst({
    // 소유 확인을 아이템의 방으로 한다 — 하루기록에 소유자 컬럼을 따로 두지 않는다
    where: { id: input.wearShotId, item: { roomId: viewer.roomId } },
    select: { id: true },
  });
  if (!shot) return fail({}, "하루기록을 찾을 수 없습니다");

  if (!input.photoUrl) return fail({ photo: "사진을 1장 올려주세요" });
  const note = input.note?.trim() || null;
  if (note && [...note].length > NOTE_MAX) {
    return fail({ note: `${NOTE_MAX}자를 넘을 수 없어요` });
  }

  await prisma.wearShot.update({
    where: { id: shot.id },
    data: { photoUrl: input.photoUrl, note },
  });
  revalidate("/[locale]/items/[itemId]", "/[locale]/me", "/[locale]/me/wear");
  return { ok: true };
}

export async function deleteWearShot(
  wearShotId: string,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  const shot = await prisma.wearShot.findFirst({
    where: { id: wearShotId, item: { roomId: viewer.roomId } },
    select: { id: true },
  });
  if (!shot) return fail({}, "하루기록을 찾을 수 없습니다");

  // ⚠️ 스토리지 파일은 지우지 않는다 — 되돌릴 수 없고, 정리는 미참조 blob
  // 배치의 몫이다 (OI-66)
  await prisma.wearShot.delete({ where: { id: shot.id } });
  revalidate("/[locale]/items/[itemId]", "/[locale]/me", "/[locale]/me/wear");
  return { ok: true };
}

/** 오늘 이미 남겼는가 — 버튼 문구를 가른다 */
export async function todaysWearShot(
  itemId: string,
): Promise<{ id: string; note?: string } | null> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return null;
  const wornOn = await today(viewer.userId);
  const shot = await prisma.wearShot.findFirst({
    where: { itemId, wornOn, item: { roomId: viewer.roomId } },
    select: { id: true, note: true },
  });
  return shot ? { id: shot.id, note: shot.note ?? undefined } : null;
}
