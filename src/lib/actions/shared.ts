import type { Viewer } from "@/lib/auth/viewer";
import { userLocalDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Server Action 공통 조각.
 *
 * ⚠️ **여기에 `revalidatePath` 를 두지 않는다.** 무효화는 **요청 스코프**를
 * 요구해서 스크립트에서 호출할 수 없고, 무엇보다 무효화 대상은 호출한 곳마다
 * 다르다. 진입점(`"use server"` 함수)이 각자 한다 — `actions/item.ts` §진입점
 * 주석 참조.
 */

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export function fail(
  fieldErrors: Record<string, string>,
  formError?: string,
): { ok: false; fieldErrors: Record<string, string>; formError?: string } {
  return { ok: false, fieldErrors, formError };
}

/**
 * 경험치 부여 — **그날 첫 행동만** (D-026, FR-01-A-04).
 *
 * ⚠️ `@@unique([userId, reason, localDate])` 가 1일 1회의 **유일한 보장**이다.
 * 애플리케이션에서 "오늘 받았나"를 세는 방식은 **동시 요청에 뚫린다.**
 * `create` 를 시도하고 유니크 위반을 **정상 흐름**으로 처리한다.
 *
 * ⚠️ `localDate` 는 **유저 타임존** 기준이다 (D-056). 운영 지표는 UTC
 * (`createdAt`)로 집계하므로 **두 기준이 공존한다 — 섞지 말 것** (FR-01-B-07).
 */
export async function grantExperience(
  viewer: Viewer,
  reason: "LOGIN" | "ITEM_CREATE" | "DIARY_CREATE",
  amount: number,
): Promise<boolean> {
  const localDate = userLocalDate(viewer.timezone ?? "UTC");
  try {
    await prisma.experienceLog.create({
      data: { userId: viewer.userId, reason, amount, localDate },
    });
    return true;
  } catch {
    // 유니크 위반 = 오늘 이미 받았다. 정상 흐름이다
    return false;
  }
}

/**
 * 소유 확인 — **소유자만 수정·삭제할 수 있다** (D-019).
 *
 * ⚠️ 없는 것과 남의 것을 **구분하지 않는다.** "권한이 없습니다"를 내면 그
 * id 가 존재한다는 사실이 드러난다. D-083 이 비공개 아이템의 **존재**를
 * 감추라고 한 것과 같은 이유다.
 */
export async function ownItem(
  viewer: Viewer,
  itemId: string,
): Promise<{ id: string; categoryId: string; saleStatus: string; visibility: string } | null> {
  if (!viewer.roomId) return null;
  return prisma.item.findFirst({
    where: { id: itemId, roomId: viewer.roomId },
    select: { id: true, categoryId: true, saleStatus: true, visibility: true },
  });
}

export async function ownDiary(
  viewer: Viewer,
  diaryId: string,
): Promise<{ id: string } | null> {
  if (!viewer.roomId) return null;
  return prisma.diary.findFirst({
    where: { id: diaryId, roomId: viewer.roomId },
    select: { id: true },
  });
}

/**
 * 외부 링크 검증 (FR-01-B-02·03, D-028).
 *
 * `http`/`https` 만 허용한다. **도메인 화이트리스트는 두지 않는다**
 * (FR-01-B-04) — 거래처가 나라마다 다르고, 막으면 판매 경로 자체가 막힌다.
 * 대신 이동 시 경고를 경유한다 (D-040).
 */
export function isValidExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
