"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { fail, grantExperience, ownDiary, type ActionResult } from "@/lib/actions/shared";
import { DIARY_MAX_LENGTH, MAX_PHOTOS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * 일기 작성 · 수정 · 삭제 (S-06, diary F-01·F-02).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 본문 **1000자**. 언어 무관 유니코드 문자 수 | D-053, FR-01-A-01·02 |
 * | 상한 초과 시 **잘라내지 않고 차단** | FR-01-A-04 |
 * | 사진 최대 10장, **필수 아님** | D-037, FR-01-A-05·06 |
 * | 본문·사진이 **둘 다 비면 저장 차단** | FR-01-A-07 |
 * | 그날 **첫 일기만** 경험치 20 | D-026, FR-01-C-01 |
 * | **수정으로는 경험치 없음** | D-026, FR-01-C-03 |
 * | 소유자만 수정·삭제 | D-019, FR-01-C-04 |
 * | 삭제해도 **경험치를 회수하지 않는다** | D-058, FR-01-C-05 |
 * | 본인 소유 아이템만 연결. **비공개도 포함** | D-054, FR-02-A-04·05 |
 *
 * ⚠️ **본문은 플레인 텍스트다** (D-055). 마크다운·HTML 을 해석하지 않고 URL 도
 * 자동 링크화하지 않는다. 그래서 **저장할 때 가공하지 않는다** — 개행까지
 * 그대로 둔다 (FR-01-B-04). 렌더 쪽에서 `white-space` 로 살린다.
 */
export type DiaryInput = {
  body: string;
  visibility: "PUBLIC" | "PRIVATE";
  /** 업로드된 사진 URL. **순서가 표시 순서**다. 필수가 아니다 (FR-01-A-06) */
  photoUrls: string[];
  /** 연결할 아이템 id. 필수가 아니다 (FR-02-A-03) */
  itemIds: string[];
};

/** 일기 경험치 (D-026) */
const EXP_DIARY = 20;

function validate(input: DiaryInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const body = input.body;

  // ⚠️ 유니코드 **문자 수**다. `body.length` 는 UTF-16 코드 유닛이라
  // 이모지·일부 한자가 2로 세진다 — 언어에 따라 상한이 달라지면 D-053 위반
  const chars = [...body].length;
  if (chars > DIARY_MAX_LENGTH) {
    errors.body = `${DIARY_MAX_LENGTH}자를 넘을 수 없어요`;
  }
  if (input.photoUrls.length > MAX_PHOTOS) {
    errors.__photos = `사진은 최대 ${MAX_PHOTOS}장입니다`;
  }
  // 본문과 사진이 둘 다 비면 남길 것이 없다 (FR-01-A-07)
  if (body.trim() === "" && input.photoUrls.length === 0) {
    errors.body = "내용이나 사진 중 하나는 있어야 해요";
  }
  return errors;
}

/** 본인 소유 아이템만 남긴다 — 남의 아이템 id 를 보내도 통과하지 않는다 */
async function ownedItemIds(viewer: Viewer, ids: string[]): Promise<string[]> {
  if (ids.length === 0 || !viewer.roomId) return [];
  const rows = await prisma.item.findMany({
    where: { id: { in: ids }, roomId: viewer.roomId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function createDiary(
  input: DiaryInput,
): Promise<ActionResult<{ diaryId: string; expGranted: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const result = await createDiaryAs(viewer, input);
  if (result.ok) revalidateDiary();
  return result;
}

export async function createDiaryAs(
  viewer: Viewer,
  input: DiaryInput,
): Promise<ActionResult<{ diaryId: string; expGranted: boolean }>> {
  if (!viewer.roomId) return fail({}, "방이 없습니다");

  const errors = validate(input);
  if (Object.keys(errors).length > 0) return fail(errors);

  const itemIds = await ownedItemIds(viewer, input.itemIds);

  const diary = await prisma.diary.create({
    data: {
      roomId: viewer.roomId,
      // 가공하지 않는다 — 개행 보존 (D-055, FR-01-B-04)
      body: input.body,
      visibility: input.visibility,
      photos: {
        // 순서가 곧 표시 순서다
        create: input.photoUrls.map((url, i) => ({ url, displayOrder: i })),
      },
      items: { create: itemIds.map((itemId) => ({ itemId })) },
    },
    select: { id: true },
  });

  const expGranted = await grantExperience(viewer, "DIARY_CREATE", EXP_DIARY);
  return { ok: true, diaryId: diary.id, expGranted };
}

/**
 * 일기 수정 (FR-01-C-03·04).
 *
 * ⚠️ **경험치를 주지 않는다.** 주면 하루에 한 번 쓰고 계속 고치는 것으로
 * 상한을 우회할 수 있다 — 애초에 `@@unique` 가 막지만, 의도도 그렇다.
 */
export async function updateDiary(
  diaryId: string,
  input: DiaryInput,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  // 없는 것과 남의 것을 구분하지 않는다
  const owned = await ownDiary(viewer, diaryId);
  if (!owned) return fail({}, "기록을 찾을 수 없습니다");

  const errors = validate(input);
  if (Object.keys(errors).length > 0) return fail(errors);

  const itemIds = await ownedItemIds(viewer, input.itemIds);

  await prisma.$transaction(async (tx) => {
    await tx.diary.update({
      where: { id: diaryId },
      data: { body: input.body, visibility: input.visibility },
    });
    // 연결은 통째로 다시 만든다 — 차집합을 계산하는 것보다 단순하고,
    // join row 에는 보존할 값이 없다 (M-03)
    await tx.diaryItem.deleteMany({ where: { diaryId } });
    if (itemIds.length > 0) {
      await tx.diaryItem.createMany({
        data: itemIds.map((itemId) => ({ diaryId, itemId })),
      });
    }
    // 사진은 통째로 다시 만든다 — 순서 변경까지 한 번에 반영된다.
    // ⚠️ 스토리지에서 실제 파일을 지우지는 않는다. 지우면 되돌릴 수 없고,
    // 정리는 나중에 미참조 blob 을 훑는 배치의 몫이다 (OI-66)
    await tx.diaryPhoto.deleteMany({ where: { diaryId } });
    if (input.photoUrls.length > 0) {
      await tx.diaryPhoto.createMany({
        data: input.photoUrls.map((url, i) => ({ diaryId, url, displayOrder: i })),
      });
    }
  });

  revalidateDiary();
  revalidatePath("/[locale]/diaries/[diaryId]", "page");
  return { ok: true };
}

/**
 * 일기 삭제 (FR-01-C-04·05).
 *
 * ⚠️ **이미 준 경험치를 회수하지 않는다** (D-058). 레벨은 단조 증가다 —
 * 회수하면 레벨이 내려가고, 그러면 "레벨이 떨어질까 봐 못 지운다"가 된다.
 * 지우는 것을 벌하지 않는 것이 원칙 1 과 맞는다.
 */
export async function deleteDiary(diaryId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const owned = await ownDiary(viewer, diaryId);
  if (!owned) return fail({}, "기록을 찾을 수 없습니다");

  // 사진·연결은 Cascade 로 지워진다. **아이템은 지워지지 않는다** (M-03)
  await prisma.diary.delete({ where: { id: diaryId } });
  revalidateDiary();
  return { ok: true };
}

function revalidateDiary() {
  revalidatePath("/[locale]/me/records", "page");
  revalidatePath("/[locale]/me", "page");
}
