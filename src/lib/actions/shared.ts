import { revalidatePath } from "next/cache";
import type { Viewer } from "@/lib/auth/viewer";
import { userLocalDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Server Action 공통 조각.
 */

/**
 * 캐시 무효화 — **요청 스코프 밖에서는 조용히 넘어간다.**
 *
 * ## ⚠️ 왜 삼키는가
 * `revalidatePath` 는 요청 스코프를 요구해서 스크립트·크론에서 부르면 던진다.
 * 그런데 이 시점에는 **DB 쓰기가 이미 끝나 있다.** 여기서 던지면 호출부는
 * 실패로 보는데 데이터는 바뀐 상태가 된다 — **부분 기록**이다.
 *
 * 실제로 그 사고를 한 번 냈다: `createItem` 이 아이템을 저장한 뒤
 * `revalidatePath` 에서 던져 중복 행이 남았다. 그래서 등록·수정은 **진입점과
 * 저장 로직을 분리**했고(§6-2), 분리가 과한 곳은 이 헬퍼를 쓴다.
 *
 * **무효화는 캐시 최적화이지 정합성의 일부가 아니다.** 실패해도 다음 요청에
 * 최신 데이터가 나온다 — 조금 늦을 뿐이다. 반대로 여기서 실패를 전파하면
 * "저장은 됐는데 실패했다고 나오는" 상태가 된다.
 */
export function revalidate(...paths: string[]): void {
  for (const path of paths) {
    try {
      revalidatePath(path, "page");
    } catch (error) {
      // 요청 스코프 밖 — 스크립트에서 부른 경우다. 개발 중에만 알린다
      if (process.env.NODE_ENV === "development") {
        console.warn(`[revalidate] 건너뜀: ${path}`, (error as Error).message);
      }
    }
  }
}

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
export async function userTimezone(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return u?.timezone ?? "UTC";
}

export async function grantExperience(
  viewer: Viewer,
  reason: "LOGIN" | "ITEM_CREATE" | "DIARY_CREATE",
  amount: number,
): Promise<boolean> {
  // ⚠️ DB 에서 읽는다 (D-121). 세션에 담으면 설정 변경이 재로그인 전까지
  // 반영되지 않고, 무엇보다 **진짜 세션에는 애초에 담기지 않고 있었다**
  const localDate = userLocalDate(await userTimezone(viewer.userId));
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
): Promise<{
  id: string;
  categoryId: string;
  /** D-207 — 하위 제품군. 수정에서는 **바꾸지 않고 그대로 쓴다** (FR-05-B-02 와 같은 이유) */
  subtypeId: string | null;
  saleStatus: string;
  visibility: string;
  /** 이 카테고리를 마켓에 올릴 수 있는가 (D-173) */
  sellable: boolean;
} | null> {
  if (!viewer.roomId) return null;
  const item = await prisma.item.findFirst({
    where: { id: itemId, roomId: viewer.roomId },
    select: {
      id: true,
      categoryId: true,
      subtypeId: true,
      saleStatus: true,
      visibility: true,
      category: { select: { sellable: true } },
    },
  });
  if (!item) return null;
  const { category, ...rest } = item;
  return { ...rest, sellable: category.sellable };
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
