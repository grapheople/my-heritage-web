"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { fail, isValidExternalUrl, ownItem, type ActionResult } from "@/lib/actions/shared";
import { prisma } from "@/lib/prisma";

/**
 * 판매 전환 · 취소 · 판매완료 (S-18, market F-01).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 가격·통화·외부 링크 **3개 필수** | D-050, FR-01-A-02·03 |
 * | 비공개 아이템은 **공개 전환 확인**을 받아야 한다 | FR-01-A-05, FR-02-B-04 |
 * | 판매 전환으로 **경험치를 주지 않는다** | D-026, FR-01-A-07 |
 * | 판매 취소 시 가격·통화·링크를 **보존** | FR-01-C-02 |
 * | 판매완료는 **유저가 직접** 처리한다 | D-001, FR-01-C-03 |
 * | 판매완료는 도감 소유자 목록·보유자 수에서 제외 | D-023, FR-01-C-05 |
 * | 가격 변경 이력을 유저에게 노출하지 않는다 | D-063, FR-01-B-05 |
 *
 * ## ⚠️ `onSaleAt` 을 여기서 채운다
 * 마켓 기본 정렬이 **판매 전환 시각** 역순이다 (D-048, FR-02-A-03).
 * `createdAt` 은 등록 시각이라 오래 전 등록한 물건을 지금 올려도 뒤로 밀리고,
 * `updatedAt` 은 사진만 고쳐도 앞으로 온다. **여기서 안 채우면 정렬이 깨진다.**
 */
export type SellInput = {
  itemId: string;
  price: string;
  currency: string;
  url: string;
  /** 비공개 아이템의 공개 전환 동의 (FR-01-A-05) */
  agreePublic: boolean;
};

const CURRENCIES = new Set(["KRW", "JPY", "USD"]);

export async function convertToSale(input: SellInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const result = await convertToSaleAs(viewer, input);
  if (result.ok) revalidateSale();
  return result;
}

export async function convertToSaleAs(
  viewer: Viewer,
  input: SellInput,
): Promise<ActionResult> {
  // 없는 것과 남의 것을 구분하지 않는다 (D-019)
  const item = await ownItem(viewer, input.itemId);
  if (!item) return fail({}, "아이템을 찾을 수 없습니다");

  // 떠난 아이템은 다시 팔 수 없다 — 현재 보유자가 아니다 (D-023)
  if (item.saleStatus === "SOLD") {
    return fail({}, "판매완료된 아이템은 다시 판매할 수 없습니다");
  }

  /*
    ⚠️ **판매할 수 없는 카테고리** (D-173, OI-85). 운동처럼 소유물이 아닌
    카테고리가 생기면서 필요해졌다 (D-166).

    ⚠️ **이 검사가 진짜 관문이다.** 화면에서 버튼을 감추는 것만으로는 막히지
    않는다 — `/items/[id]/sell` 은 URL 로 열 수 있고 서버 액션은 직접 호출할 수
    있다 (D-133 계열에서 반복 확인한 것: 도달 가능성과 권한은 별개다).
  */
  if (!item.sellable) {
    return fail({}, "이 카테고리는 마켓에 올릴 수 없습니다");
  }

  /* ── 검증 (FR-01-A-03) ── */
  const errors: Record<string, string> = {};
  const price = Number(input.price);
  if (!input.price.trim() || !Number.isFinite(price) || price <= 0) {
    errors.price = "가격을 입력해주세요";
  }
  if (!CURRENCIES.has(input.currency)) errors.currency = "통화를 선택해주세요";
  if (!input.url.trim()) errors.url = "거래 링크를 입력해주세요";
  // http/https 만. 도메인 화이트리스트는 없다 (FR-01-B-03·04)
  else if (!isValidExternalUrl(input.url)) errors.url = "http 또는 https 링크만 됩니다";

  // 비공개면 공개 전환 확인을 받는다 — 확인 없이 몰래 공개하지 않는다
  const needsPublic = item.visibility === "PRIVATE";
  if (needsPublic && !input.agreePublic) {
    errors.agree = "판매하려면 아이템을 공개해야 합니다";
  }
  if (Object.keys(errors).length > 0) return fail(errors);

  const wasOnSale = item.saleStatus === "ON_SALE";
  await prisma.item.update({
    where: { id: item.id },
    data: {
      saleStatus: "ON_SALE",
      // 동의를 받았으므로 함께 공개로 돌린다 (FR-02-B-04)
      ...(needsPublic ? { visibility: "PUBLIC" as const } : {}),
      price,
      currency: input.currency as "KRW" | "JPY" | "USD",
      externalUrl: input.url.trim(),
      // ⚠️ **이미 판매중이면 갱신하지 않는다** (FR-01-B-01 — 가격 수정).
      // 가격만 고쳤는데 마켓 맨 위로 올라오면 정렬이 홍보 수단이 된다
      ...(wasOnSale ? {} : { onSaleAt: new Date() }),
    },
  });

  // 경험치 없음 (D-026, FR-01-A-07) — 판매는 기록 행위가 아니다
  return { ok: true };
}

/**
 * 판매 취소 (FR-01-C-01·02).
 *
 * ⚠️ **가격·통화·링크를 지우지 않는다.** 다시 팔 때 재입력을 요구하지 않기
 * 위해서다 (원칙 1). `onSaleAt` 도 남긴다 — 재전환 시 새로 채워진다.
 */
export async function cancelSale(itemId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const item = await ownItem(viewer, itemId);
  if (!item || item.saleStatus !== "ON_SALE") {
    return fail({}, "판매중인 아이템이 아닙니다");
  }
  await prisma.item.update({
    where: { id: item.id },
    data: { saleStatus: "DISPLAYED" },
  });
  revalidateSale();
  return { ok: true };
}

/**
 * 판매완료 처리 (FR-01-C-03·04·05).
 *
 * ⚠️ **서버는 실제 성사를 모른다** (D-001). 외부 거래라서 유저의 자기 신고에
 * 의존한다. 그래서 되돌리기도 열어둔다 (FR-01-C-06).
 */
export async function markSold(itemId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const item = await ownItem(viewer, itemId);
  if (!item || item.saleStatus !== "ON_SALE") {
    return fail({}, "판매중인 아이템이 아닙니다");
  }
  await prisma.item.update({
    where: { id: item.id },
    // 마켓에서 빠지고 방의 "떠난 아이템" 구역으로 간다 (D-023).
    // 도감 소유자 목록·보유자 수 제외는 조회 계층이 `saleStatus` 로 판정한다
    data: { saleStatus: "SOLD", soldAt: new Date() },
  });
  revalidateSale();
  return { ok: true };
}

/** 판매완료 되돌리기 — 오처리 복구 (FR-01-C-06) */
export async function undoSold(itemId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const item = await ownItem(viewer, itemId);
  if (!item || item.saleStatus !== "SOLD") {
    return fail({}, "판매완료 상태가 아닙니다");
  }
  await prisma.item.update({
    where: { id: item.id },
    data: { saleStatus: "DISPLAYED", soldAt: null },
  });
  revalidateSale();
  return { ok: true };
}

/** 판매 상태가 바뀌면 마켓·방·도감이 함께 바뀐다 */
function revalidateSale() {
  revalidatePath("/[locale]/market", "page");
  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]", "page");
}
