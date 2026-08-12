"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { fail, type ActionResult } from "@/lib/actions/shared";
import { normalizeBrandToken } from "@/lib/brand-search";
import { REPORT_REASONS, type ReportTarget } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * 신고 · 차단 · 브랜드 요청 (S-15 · S-17 · S-19).
 */

const TARGET_TYPE: Record<
  ReportTarget,
  "ITEM" | "DIARY" | "ROOM" | "CODEX" | "EXTERNAL_LINK" | "COMMENT"
> = {
  item: "ITEM",
  diary: "DIARY",
  room: "ROOM",
  codex: "CODEX",
  link: "EXTERNAL_LINK",
  // 착용샷 댓글 (D-179, OI-89 해소)
  comment: "COMMENT",
};

/**
 * 신고 (S-15, market F-05).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 대상 **6종** · 사유는 **목록에서 선택** | D-029·D-035·D-052, FR-05-A-01·02, **D-179** |
 * | 어드민 처리 큐에 적재 | FR-05-A-03 |
 * | **접수해도 콘텐츠를 자동으로 숨기지 않는다** | FR-05-A-04 |
 * | 처리 결과는 **인앱**으로 알린다 (푸시 아님) | D-059, FR-05-A-08 |
 *
 * ⚠️ **자동 판정하지 않는다** (FR-06-A-04). 신고 기반 사후 조치다 — 신고 몇
 * 건으로 자동 비공개하면 경쟁 판매자가 서로를 내리는 수단이 된다.
 *
 * ## ⚠️ 사유 9종을 대상별로 좁히지 않았다 (D-179)
 * 댓글에 "가품"·"도난품" 같은 물건용 사유가 그대로 뜬다. 사유 축은 **제재 사유와
 * 같아야 하고**(D-035·D-052) 대상별 필터는 그 축을 건드리는 새 정책이다.
 * UI 에서만 걸러도 서버 검증(전체 목록)과 어긋난다 → OI-90.
 */
export async function submitReport(input: {
  target: ReportTarget;
  targetId: string;
  reason: string;
  detail?: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  if (!TARGET_TYPE[input.target]) return fail({ target: "신고 대상이 올바르지 않습니다" });
  // 사유는 목록에서만 (FR-05-A-02). 자유 입력을 사유로 받지 않는다
  if (!REPORT_REASONS.includes(input.reason as (typeof REPORT_REASONS)[number])) {
    return fail({ reason: "신고 사유를 선택해주세요" });
  }
  if (!input.targetId.trim()) return fail({ target: "신고 대상이 없습니다" });

  await prisma.report.create({
    data: {
      reporterId: viewer.userId,
      targetType: TARGET_TYPE[input.target],
      targetId: input.targetId,
      reason: input.reason,
      detail: input.detail?.trim() || null,
      // 대상 콘텐츠는 그대로 노출된다 (FR-05-A-04)
      status: "PENDING",
    },
  });

  // ⚠️ 같은 대상을 여러 번 신고하는 것을 막지 않는다. 누적 건수가
  // 어드민 큐의 우선순위 신호이기 때문이다 (FR-05-A-07)
  revalidatePath("/admin/reports", "page");
  return { ok: true };
}

/**
 * 차단 (S-19, D-051).
 *
 * ⚠️ **단방향 1건이 양쪽 가시성을 끊는다** (M-11). 그래서 상대 쪽에 행을 만들
 * 필요가 없다 — 조회 계층이 `blockerId`·`blockedId` 를 **둘 다** 본다.
 *
 * ⚠️ **상대에게 알리지 않는다** (FR-05-B-04). 알림을 만들지 않는 것이 구현이다.
 */
export async function blockUserByRoom(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { userId: true },
  });
  if (!room) return fail({}, "방을 찾을 수 없습니다");
  if (room.userId === viewer.userId) return fail({}, "자기 자신은 차단할 수 없습니다");

  // 이미 차단했으면 조용히 성공시킨다 — 재시도를 에러로 만들 이유가 없다
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: viewer.userId, blockedId: room.userId } },
    create: { blockerId: viewer.userId, blockedId: room.userId },
    update: {},
  });

  revalidateVisibility();
  return { ok: true };
}

/** 차단 해제 (FR-05-B-05) */
export async function unblockUserByRoom(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { userId: true },
  });
  if (!room) return fail({}, "방을 찾을 수 없습니다");

  // ⚠️ **내가 건 차단만 푼다.** 상대가 나를 차단한 것은 내가 풀 수 없다 —
  // 풀 수 있으면 차단이 무의미해진다
  await prisma.block.deleteMany({
    where: { blockerId: viewer.userId, blockedId: room.userId },
  });

  revalidateVisibility();
  return { ok: true };
}

/**
 * 브랜드 추가 요청 (S-17, item-catalog F-09).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 브랜드명 + 카테고리를 받는다 | FR-09-A-02 |
 * | **마스터에 즉시 등재하지 않는다** | FR-09-A-03, D-046 |
 * | 이미 마스터에 있으면(원문·alias) **차단하고 그 브랜드를 보여준다** | FR-09-A-07, D-047 |
 * | 같은 요청이 대기 중이면 **중복 생성하지 않는다** | FR-09-A-06 |
 * | 보너스 경험치 없음 | D-033, FR-09-A-05 |
 * | 요청자·일시를 기록한다 | FR-09-A-08 |
 *
 * ⚠️ 요청 후에도 **도감 미연결로 등록을 계속할 수 있다** (D-032, FR-09-A-04).
 * 승인을 기다리게 하면 등록이 거기서 끊긴다.
 */
export async function submitBrandRequest(input: {
  name: string;
  categoryKey: string;
}): Promise<ActionResult<{ merged: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const name = input.name.trim();
  if (!name) return fail({ name: "브랜드명을 입력해주세요" });
  if (!input.categoryKey.trim()) return fail({ category: "카테고리를 선택해주세요" });

  const nq = normalizeBrandToken(name);

  // 이미 마스터에 있는가 — 원문 또는 alias (FR-09-A-07, D-047)
  const brands = await prisma.brand.findMany({
    where: { active: true },
    select: { name: true, aliases: true },
  });
  const existing = brands.find((b) => {
    if (normalizeBrandToken(b.name) === nq) return true;
    const a = (b.aliases ?? {}) as Record<string, unknown>;
    return (["ko", "ja", "en"] as const).some((k) =>
      Array.isArray(a[k])
        ? (a[k] as unknown[]).some(
            (v) => typeof v === "string" && normalizeBrandToken(v) === nq,
          )
        : false,
    );
  });
  if (existing) {
    return fail({ name: `이미 있는 브랜드예요 — "${existing.name}"을 선택해주세요` });
  }

  // 같은 요청이 대기 중이면 새로 만들지 않는다 (FR-09-A-06).
  // ⚠️ 정규화해서 비교한다 — `Snow Peak` 과 `snowpeak` 이 따로 쌓이면
  // 어드민 큐에 같은 요청이 두 줄로 보인다
  const pending = await prisma.brandRequest.findMany({
    where: { status: "PENDING", categoryKey: input.categoryKey },
    select: { id: true, requestedName: true },
  });
  const dup = pending.find((r) => normalizeBrandToken(r.requestedName) === nq);
  if (dup) {
    // 이미 대기 중 — 유저에게는 성공이다. 요청이 접수된 것은 맞다
    return { ok: true, merged: true };
  }

  await prisma.brandRequest.create({
    data: {
      requesterId: viewer.userId,
      requestedName: name,
      categoryKey: input.categoryKey,
      status: "PENDING",
    },
  });

  // 경험치 없음 (D-033, FR-09-A-05)
  revalidatePath("/admin/brands/requests", "page");
  return { ok: true, merged: false };
}

/** 차단은 피드·검색·마켓·도감 전부에 영향을 준다 (FR-05-B-03) */
function revalidateVisibility() {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/market", "page");
  revalidatePath("/[locale]/me/settings/blocks", "page");
}
