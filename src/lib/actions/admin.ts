"use server";

import { getAdmin } from "@/lib/auth/admin";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { normalizeBrandToken } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";

/**
 * 어드민 쓰기 액션 (A-01~A-12).
 *
 * ## ⚠️ 알림 4종이 전부 여기서 발생한다 (D-087, FR-08-B-01~04)
 * 브랜드 요청 결과 · 신고 결과 · 제재 · 도감 병합. **넷 다 유저가 서비스에
 * 없을 때 일어나는 일**이고, 푸시가 없으므로(D-059) 인앱 알림이 **유일한 전달
 * 경로**다. 여기서 알림을 안 만들면 유저는 무슨 일이 있었는지 영영 모른다.
 *
 * 특히 **제재 통지가 전달되지 않으면 D-066("제재 시 로그인을 막지 않는다")의
 * 근거가 무너진다** — 로그인을 열어둔 이유가 "앱 안에서 사유를 알리려고"였다.
 *
 * ## ⚠️ 모든 액션이 어드민 인가를 다시 확인한다 (D-102)
 * 레이아웃 가드는 **화면**을 막을 뿐이다. Server Action 은 직접 호출될 수
 * 있으므로 **각 액션이 스스로 확인해야 한다.** 화면만 막고 액션을 열어두면
 * 가드가 없는 것과 같다.
 *
 * 조치자(`issuedBy`·`verifiedBy`·`handledBy`)에는 **`AdminUser.id`** 가 들어간다 —
 * `FR-07-A-05`(제재 이력 보존)가 요구하는 것이 이것이다. 제재는 이의 제기
 * 대상이라(D-067) "누가 조치했는지"가 없으면 답할 수 없다.
 *
 * ## 제재 사유는 enum 이다 (D-103)
 * 어드민은 ko 단일(D-030)이지만 **유저는 자기 언어로 읽어야 한다** — S-21 이
 * 제재를 알리는 유일한 경로다(D-066). 라벨은 3개 언어 i18n 리소스에 있다.
 */

/**
 * 제재 사유 (D-103). **신고 사유와 같은 축**이라 A-08 → A-10 이동 시 매핑된다.
 */
export type SanctionReason =
  | "FAKE" | "STOLEN" | "WEAPON" | "DRUG" | "ALCOHOL" | "NON_PHYSICAL"
  | "PHISHING" | "INAPPROPRIATE" | "WRONG_INFO" | "REPEATED" | "OTHER";

const SANCTION_REASONS: SanctionReason[] = [
  "FAKE", "STOLEN", "WEAPON", "DRUG", "ALCOHOL", "NON_PHYSICAL",
  "PHISHING", "INAPPROPRIATE", "WRONG_INFO", "REPEATED", "OTHER",
];

/** 인가 확인 + 조치자 id. **모든 액션의 첫 줄이다** */
async function actor(): Promise<string | null> {
  return (await getAdmin())?.id ?? null;
}

/* ────────────────────────────────────────────
   A-01 카테고리 — 비활성화만. 생성·삭제 없음 (D-007, D-036)
   ──────────────────────────────────────────── */

export async function setCategoryActive(
  key: string,
  active: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  // ⚠️ **비활성화는 신규 등록만 막는다.** 기존 아이템은 그대로 조회된다
  // (D-036, M-09) — 그래서 아이템을 건드리지 않는다
  await prisma.category.update({ where: { key }, data: { active } });
  revalidate("/admin/categories");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-02 카테고리별 속성 조합 — **출시 필수 단계** (D-097)
   ──────────────────────────────────────────── */

/**
 * 카테고리에 속성을 붙이거나 설정을 바꾼다.
 *
 * ⚠️ **여기가 비어 있으면 유저가 아이템을 한 건도 등록할 수 없다** (D-097).
 * 출시 순서 3단계다.
 */
export async function setCategoryAttribute(input: {
  categoryKey: string;
  attributeKey: string;
  required?: boolean;
  active?: boolean;
  displayOrder?: number;
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const [category, def] = await Promise.all([
    prisma.category.findUnique({ where: { key: input.categoryKey }, select: { id: true } }),
    prisma.attributeDefinition.findUnique({
      where: { key: input.attributeKey },
      select: { id: true },
    }),
  ]);
  if (!category || !def) return fail({}, "카테고리 또는 속성을 찾을 수 없습니다");

  await prisma.categoryAttribute.upsert({
    where: {
      categoryId_attributeDefinitionId: {
        categoryId: category.id,
        attributeDefinitionId: def.id,
      },
    },
    create: {
      categoryId: category.id,
      attributeDefinitionId: def.id,
      required: input.required ?? false,
      active: input.active ?? true,
      displayOrder: input.displayOrder ?? 0,
    },
    // ⚠️ **삭제하지 않는다.** 값이 보존되어야 하므로 비활성화만 한다 (D-036)
    update: {
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
    },
  });

  revalidate("/admin/attributes");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-03 매칭 키 — 변경 이력을 남긴다 (FR-01-B-04)
   ──────────────────────────────────────────── */

/**
 * ⚠️ **매칭 키를 바꾸면 이후 등록의 도감 연결 기준이 달라진다.** 이미 만들어진
 * 도감의 `normalizedKey` 는 그대로라서 **옛 기준 도감과 새 기준 도감이 공존**
 * 한다. 그래서 이력을 남긴다 — 나중에 병합할 때 왜 갈라졌는지 알아야 한다.
 *
 * 매칭 키로 쓸 수 있는 타입은 `text`/`number`/`select`/`date` 4종뿐이다
 * (D-041, FR-01-A-06). `multiselect`·`boolean`·`textarea`·`url` 은 정규화가
 * 성립하지 않는다.
 */
const MATCHING_KEY_TYPES = new Set(["text", "number", "select", "date"]);

export async function setMatchingKey(input: {
  categoryKey: string;
  attributeKeys: string[];
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const category = await prisma.category.findUnique({
    where: { key: input.categoryKey },
    select: { id: true, matchingKey: { select: { id: true, attributeKeys: true } } },
  });
  if (!category) return fail({}, "카테고리를 찾을 수 없습니다");
  // 최소 1개 (FR-01-A-03)
  if (input.attributeKeys.length === 0) {
    return fail({ attributeKeys: "매칭 키는 최소 1개 필요합니다" });
  }

  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: input.attributeKeys } },
    select: { key: true, type: true },
  });
  const invalid = defs.filter((d) => !MATCHING_KEY_TYPES.has(d.type));
  if (invalid.length > 0) {
    return fail({
      attributeKeys: `매칭 키로 쓸 수 없는 타입입니다: ${invalid.map((d) => `${d.key}(${d.type})`).join(", ")}`,
    });
  }
  if (defs.length !== input.attributeKeys.length) {
    return fail({ attributeKeys: "존재하지 않는 속성이 있습니다" });
  }

  const before = category.matchingKey?.attributeKeys ?? [];
  await prisma.$transaction(async (tx) => {
    const mk = await tx.matchingKeyDefinition.upsert({
      where: { categoryId: category.id },
      create: { categoryId: category.id, attributeKeys: input.attributeKeys },
      update: { attributeKeys: input.attributeKeys },
      select: { id: true },
    });
    // 변경 이력 (FR-01-B-04). 최초 지정도 기록한다 — before 가 빈 배열이다
    await tx.matchingKeyChangeLog.create({
      data: {
        matchingKeyDefinitionId: mk.id,
        before,
        after: input.attributeKeys,
        changedBy: ADMIN_ACTOR,
      },
    });
  });

  revalidate("/admin/matching-keys");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-04·A-05 도감 검증 (FR-04-B)
   ──────────────────────────────────────────── */

export async function setCodexVerification(
  codexId: string,
  verified: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  await prisma.codexItem.update({
    where: { id: codexId },
    data: {
      verification: verified ? "VERIFIED" : "UNVERIFIED",
      // 검증 일시와 검증한 어드민을 기록한다 (FR-04-B-03).
      // 되돌릴 때는 지운다 — 남겨두면 "검증됐던 적 있음"이 현재 상태처럼 읽힌다
      verifiedBy: verified ? ADMIN_ACTOR : null,
      verifiedAt: verified ? new Date() : null,
    },
  });
  revalidate("/admin/codex", "/admin/codex/verification", "/[locale]/codex/[codexId]");
  return { ok: true };
}

/**
 * 검증된 도감의 3개 언어 설명 (D-010·D-012, FR-07-A-05).
 *
 * ⚠️ **미검증 도감에는 쓰지 않는다.** 미검증본은 유저가 쓴 원문 1개를 그대로
 * 보여줘야 한다 — 번역하면 운영자가 검수하지 않은 내용을 서비스가 보증하는
 * 것처럼 보인다 (`policies/i18n` Case 1).
 */
export async function setCodexDescriptions(
  codexId: string,
  descriptions: { ko?: string; ja?: string; en?: string },
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const codex = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: { verification: true },
  });
  if (!codex) return fail({}, "도감을 찾을 수 없습니다");
  if (codex.verification !== "VERIFIED") {
    return fail({}, "검증된 도감에만 다국어 설명을 넣을 수 있습니다");
  }

  await prisma.codexItem.update({
    where: { id: codexId },
    data: {
      descriptions: Object.fromEntries(
        Object.entries(descriptions).filter(([, v]) => v?.trim()),
      ),
    },
  });
  revalidate("/[locale]/codex/[codexId]");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-07 도감 alias (D-009)
   ──────────────────────────────────────────── */

export async function setCodexAliases(
  codexId: string,
  aliases: { ko?: string[]; ja?: string[]; en?: string[] },
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const clean = (list?: string[]) =>
    [...new Set((list ?? []).map((a) => a.trim()).filter(Boolean))];

  await prisma.codexItem.update({
    where: { id: codexId },
    data: {
      aliases: { ko: clean(aliases.ko), ja: clean(aliases.ja), en: clean(aliases.en) },
    },
  });
  revalidate("/admin/codex/aliases");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-06 도감 병합 (D-016, FR-05-B)
   ──────────────────────────────────────────── */

function mergeAliases(a: unknown, b: unknown) {
  const get = (src: unknown, k: string) => {
    const o = (src ?? {}) as Record<string, unknown>;
    return Array.isArray(o[k]) ? (o[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
  };
  return Object.fromEntries(
    (["ko", "ja", "en"] as const).map((k) => [
      k,
      // 합집합 후 중복 제거 (FR-05-B-03, E-06-04)
      [...new Set([...get(a, k), ...get(b, k)])],
    ]),
  );
}

/**
 * 도감 병합 (FR-05-B-01~08).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 흡수되는 도감의 **아이템을 survivor 로 이관** | FR-05-B-02 |
 * | alias 는 **합집합** | FR-05-B-03, D-009 |
 * | 흡수된 도감을 **삭제하지 않고** survivor 를 가리키게 | FR-05-B-04 |
 * | 아이템의 **유저 입력 속성값은 건드리지 않는다** | FR-05-B-07 |
 * | 소유자에게 알림 | D-087, FR-08-B-04 |
 *
 * ⚠️ **되돌릴 수 있어야 한다.** 잘못 병합하면 남의 아이템이 엉뚱한 제품에
 * 붙는다. `mergedIntoId` 만 끊으면 도감은 살아나지만 **이관된 아이템은 자동으로
 * 돌아오지 않는다** — 그래서 되돌리기가 어떤 아이템을 옮겼는지 알아야 한다.
 * 지금은 그 기록이 없다 (OI-62).
 */
export async function mergeCodex(input: {
  survivorId: string;
  absorbedIds: string[];
}): Promise<ActionResult<{ movedItems: number; notified: number }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const { survivorId, absorbedIds } = input;
  if (absorbedIds.includes(survivorId)) {
    return fail({}, "자기 자신에 병합할 수 없습니다");
  }
  if (absorbedIds.length === 0) return fail({}, "병합할 도감을 선택해주세요");

  const survivor = await prisma.codexItem.findUnique({
    where: { id: survivorId },
    select: { id: true, categoryId: true, aliases: true, mergedIntoId: true },
  });
  if (!survivor) return fail({}, "도감을 찾을 수 없습니다");
  // 이미 흡수된 도감을 survivor 로 쓰면 연쇄가 생긴다
  if (survivor.mergedIntoId) return fail({}, "이미 병합된 도감은 survivor 가 될 수 없습니다");

  const absorbed = await prisma.codexItem.findMany({
    where: { id: { in: absorbedIds } },
    select: { id: true, categoryId: true, aliases: true },
  });
  // 카테고리가 다르면 매칭 키 체계가 다르다 — 병합하면 안 된다
  if (absorbed.some((a) => a.categoryId !== survivor.categoryId)) {
    return fail({}, "다른 카테고리의 도감은 병합할 수 없습니다");
  }

  // 알림 대상 — **이관 전에** 모은다. 옮기고 나면 누구 것이었는지 알 수 없다
  const owners = await prisma.item.findMany({
    where: { codexItemId: { in: absorbedIds } },
    select: { room: { select: { userId: true } } },
  });
  const ownerIds = [...new Set(owners.map((o) => o.room.userId))];

  const merged = mergeAliases(
    survivor.aliases,
    absorbed.reduce<unknown>((acc, a) => mergeAliases(acc, a.aliases), {}),
  );

  const result = await prisma.$transaction(async (tx) => {
    // 아이템 이관 — **속성값은 건드리지 않는다** (FR-05-B-07)
    const moved = await tx.item.updateMany({
      where: { codexItemId: { in: absorbedIds } },
      data: { codexItemId: survivorId },
    });
    await tx.codexItem.update({
      where: { id: survivorId },
      data: { aliases: merged },
    });
    // 삭제하지 않고 survivor 를 가리키게 둔다 (FR-05-B-04).
    // 상세로 접근하면 survivor 로 보낸다 (FR-05-B-05)
    await tx.codexItem.updateMany({
      where: { id: { in: absorbedIds } },
      data: { mergedIntoId: survivorId },
    });
    // 소유자에게 알린다 — **아이템 명칭이 바뀌기 때문이다** (D-073 파생값)
    if (ownerIds.length > 0) {
      await tx.notification.createMany({
        data: ownerIds.map((userId) => ({
          userId,
          type: "CODEX_MERGED" as const,
          targetId: survivorId,
          params: {},
        })),
      });
    }
    return moved.count;
  });

  revalidate("/admin/codex/merge", "/[locale]/codex/[codexId]");
  return { ok: true, movedItems: result, notified: ownerIds.length };
}

/**
 * 병합 되돌리기.
 *
 * ⚠️ **도감은 살아나지만 아이템은 자동으로 돌아오지 않는다** (OI-62).
 * 어떤 아이템이 어디서 왔는지 기록하지 않기 때문이다. 지금은 연결만 끊는다 —
 * **불완전한 복구임을 호출부가 알려야 한다.**
 */
export async function undoMergeCodex(absorbedId: string): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const codex = await prisma.codexItem.findUnique({
    where: { id: absorbedId },
    select: { mergedIntoId: true },
  });
  if (!codex?.mergedIntoId) return fail({}, "병합된 도감이 아닙니다");

  await prisma.codexItem.update({
    where: { id: absorbedId },
    data: { mergedIntoId: null },
  });
  revalidate("/admin/codex/merge");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-08 신고 처리 (market F-05)
   ──────────────────────────────────────────── */

/**
 * 신고 처리 (FR-05-A-05·06·08).
 *
 * | 조치 | 동작 |
 * |---|---|
 * | `hide` | 대상 아이템·일기를 **비공개 처리** (삭제 아님) |
 * | `reject` | 반려 |
 *
 * ⚠️ **비공개 처리는 삭제가 아니다.** 유저의 기록을 운영이 지우면 원칙 1이
 * 무너진다. 숨기고, 사유를 남기고, 유저에게 알린다.
 *
 * ⚠️ 신고자에게 **인앱으로** 결과를 알린다 (FR-05-A-08, D-059 — 푸시 없음).
 */
export async function resolveReport(input: {
  reportId: string;
  action: "hide" | "reject";
  resolution: string;
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const report = await prisma.report.findUnique({
    where: { id: input.reportId },
    select: { id: true, reporterId: true, targetType: true, targetId: true, status: true },
  });
  if (!report) return fail({}, "신고를 찾을 수 없습니다");
  if (report.status !== "PENDING") return fail({}, "이미 처리된 신고입니다");
  if (!input.resolution.trim()) return fail({ resolution: "조치 내용을 입력해주세요" });

  await prisma.$transaction(async (tx) => {
    if (input.action === "hide") {
      // 대상 종류가 5가지라 FK 가 없다 — 종류별로 분기한다
      if (report.targetType === "ITEM") {
        await tx.item.updateMany({
          where: { id: report.targetId },
          data: { visibility: "PRIVATE" },
        });
      } else if (report.targetType === "DIARY") {
        await tx.diary.updateMany({
          where: { id: report.targetId },
          data: { visibility: "PRIVATE" },
        });
      }
      // ROOM·CODEX·EXTERNAL_LINK 은 비공개 처리 대상이 아니다 —
      // 방은 제재(A-10)로, 도감은 편집(A-04)으로 다룬다
    }

    await tx.report.update({
      where: { id: report.id },
      data: {
        status: input.action === "hide" ? "RESOLVED" : "REJECTED",
        // 조치자·일시·사유를 보존한다 (FR-05-A-06)
        handledBy: ADMIN_ACTOR,
        handledAt: new Date(),
        resolution: input.resolution.trim(),
      },
    });

    // 신고자에게 결과 알림 (FR-05-A-08, FR-08-B-02)
    await tx.notification.create({
      data: {
        userId: report.reporterId,
        type: "REPORT_RESULT",
        targetId: report.targetId,
        params: { result: input.action === "hide" ? "resolved" : "rejected" },
      },
    });
  });

  revalidate("/admin/reports");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-09 레벨 테이블
   ──────────────────────────────────────────── */

/**
 * ⚠️ **레벨은 단조 증가여야 한다** (D-058). 필요 경험치를 올리면 이미 그 레벨에
 * 도달한 유저의 레벨이 **내려간다** — 레벨은 저장값이 아니라 누적 경험치로부터
 * 매번 계산되기 때문이다. 그래서 낮추는 방향만 자유롭고, 올리는 것은 위험하다.
 * 지금은 막지 않고 **경고 대상으로 남긴다** (OI-63).
 */
export async function setLevelTable(
  rows: { level: number; requiredExp: number }[],
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const sorted = [...rows].sort((a, b) => a.level - b.level);
  // 단조 증가가 아니면 어떤 총량에서도 도달할 수 없는 레벨이 생긴다
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].requiredExp <= sorted[i - 1].requiredExp) {
      return fail({}, `Lv.${sorted[i].level} 의 필요 경험치가 이전 레벨보다 크지 않습니다`);
    }
  }

  await prisma.$transaction(
    sorted.map((r) =>
      prisma.levelDefinition.upsert({
        where: { level: r.level },
        create: { level: r.level, requiredExp: r.requiredExp },
        update: { requiredExp: r.requiredExp },
      }),
    ),
  );
  revalidate("/admin/levels");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-10 제재 (D-064 · D-065)
   ──────────────────────────────────────────── */

/**
 * 제재 부과 (FR-07-A·B).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 3단계 · 사유 필수 · 이력 보존 | D-064, FR-07-A-01·04·05 |
 * | **경고 누적으로 자동 승격하지 않는다** | FR-07-A-06 |
 * | 경고는 **기능을 제한하지 않는다** | FR-07-A-07 |
 * | 정지 시 방을 **비공개로 강제 전환** | D-065, FR-07-B-01 |
 * | 아이템·일기·매물을 **삭제하지 않는다** | FR-07-B-02 |
 * | **제재 이전 공개 상태를 저장** | D-065, FR-07-B-03 |
 *
 * ## ⚠️ `previousRoomVisibility` 가 이 기능의 핵심이다
 * 방을 비공개로 바꾸기 **전에** 원래 값을 저장한다. 저장하지 않으면 해제할 때
 * 무조건 공개로 돌리게 되는데, **원래 비공개였던 유저의 방이 제재 해제로
 * 공개된다.** 제재가 프라이버시를 뒤집는 셈이다 (M-12).
 */
export async function issueSanction(input: {
  userId: string;
  level: "WARNING" | "SUSPENDED" | "BANNED";
  /** 목록에서 고른다 (D-103) — 3개 언어 라벨이 따라온다 */
  reasonCode: SanctionReason;
  /** 보조 설명. **`OTHER` 는 필수** — 아니면 유저에게 아무 정보도 안 간다 */
  detail?: string;
  expiresAt?: string;
  /**
   * 신고에서 넘어온 경우 그 콘텐츠도 비공개 처리한다 (D-111, FR-05-A-05).
   *
   * ⚠️ **기본값이 아니다.** 자동으로 켜면 "제재 = 콘텐츠 삭제"가 되어
   * **경고인데 콘텐츠까지 내려가는** 과잉 조치가 생긴다. 어드민이 고른다.
   *
   * ⚠️ **비공개 처리는 삭제가 아니다.** 유저의 기록을 운영이 지우면 원칙 1이
   * 무너진다.
   */
  hideContent?: { targetType: string; targetId: string };
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  if (!SANCTION_REASONS.includes(input.reasonCode)) {
    return fail({ reasonCode: "사유를 선택해주세요" });
  }
  // OTHER 는 enum 이 정보를 주지 못한다. 상세가 없으면 유저는 이유를 모른다
  if (input.reasonCode === "OTHER" && !input.detail?.trim()) {
    return fail({ detail: "기타를 고르면 상세 사유가 필요합니다" });
  }
  // 일시 정지는 기간이 필수다 (FR-07-A-02)
  if (input.level === "SUSPENDED" && !input.expiresAt) {
    return fail({ expiresAt: "일시 정지는 기간을 지정해야 합니다" });
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, room: { select: { id: true, visibility: true } } },
  });
  if (!user) return fail({}, "유저를 찾을 수 없습니다");

  // 경고는 기능을 제한하지 않는다 — 방도 건드리지 않는다 (FR-07-A-07)
  const forcePrivate = input.level !== "WARNING";

  await prisma.$transaction(async (tx) => {
    await tx.sanction.create({
      data: {
        userId: user.id,
        level: input.level,
        reasonCode: input.reasonCode,
        detail: input.detail?.trim() || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        // ⚠️ **강제 전환 전의 값**을 저장한다. 이걸 빠뜨리면 해제 시
        // 원래 비공개였던 방이 공개로 열린다 (M-12)
        previousRoomVisibility: forcePrivate ? (user.room?.visibility ?? null) : null,
        issuedBy: ADMIN_ACTOR,
      },
    });

    // 신고 콘텐츠 조치 — 어드민이 체크했을 때만 (D-111)
    if (input.hideContent) {
      const { targetType, targetId } = input.hideContent;
      if (targetType === "ITEM") {
        await tx.item.updateMany({ where: { id: targetId }, data: { visibility: "PRIVATE" } });
      } else if (targetType === "DIARY") {
        await tx.diary.updateMany({ where: { id: targetId }, data: { visibility: "PRIVATE" } });
      }
      // ROOM 은 제재 자체가 방을 비공개로 만든다. CODEX·EXTERNAL_LINK 는
      // 특정 유저 콘텐츠가 아니라 여기서 다룰 대상이 아니다
    }

    if (forcePrivate && user.room) {
      // 방만 비공개로. **아이템·일기·매물은 삭제하지 않는다** (FR-07-B-02).
      // 마켓에서 내려가는 것은 조회 조건이 알아서 한다 (FR-07-B-05)
      await tx.room.update({
        where: { id: user.room.id },
        data: { visibility: "PRIVATE" },
      });
    }

    // 대상 유저에게 알린다 (D-066, FR-08-B-03).
    // ⚠️ 이게 없으면 "로그인을 막지 않는다"는 결정의 근거가 무너진다
    await tx.notification.create({
      data: { userId: user.id, type: "SANCTION", params: { level: input.level } },
    });
  });

  revalidate("/admin/sanctions", "/[locale]/market", "/[locale]");
  return { ok: true };
}

/**
 * 제재 해제 (FR-07-A-08, FR-07-B-04).
 *
 * ⚠️ **방 공개 상태를 제재 이전 값으로 복원한다.** 무조건 공개로 돌리면
 * 원래 비공개였던 유저의 방이 열린다.
 */
export async function liftSanction(sanctionId: string): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const s = await prisma.sanction.findUnique({
    where: { id: sanctionId },
    select: {
      id: true,
      userId: true,
      liftedAt: true,
      previousRoomVisibility: true,
      user: { select: { room: { select: { id: true } } } },
    },
  });
  if (!s) return fail({}, "제재를 찾을 수 없습니다");
  if (s.liftedAt) return fail({}, "이미 해제된 제재입니다");

  await prisma.$transaction(async (tx) => {
    await tx.sanction.update({
      where: { id: s.id },
      data: { liftedBy: ADMIN_ACTOR, liftedAt: new Date() },
    });
    // 저장해둔 값으로 복원한다. 없으면(경고였다면) 건드리지 않는다
    if (s.previousRoomVisibility && s.user.room) {
      await tx.room.update({
        where: { id: s.user.room.id },
        data: { visibility: s.previousRoomVisibility },
      });
    }
    await tx.notification.create({
      data: { userId: s.userId, type: "SANCTION", params: { level: "LIFTED" } },
    });
  });

  revalidate("/admin/sanctions", "/[locale]/market");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-11·A-12 브랜드 마스터 · 요청 승인 (D-043 · D-046 · D-047)
   ──────────────────────────────────────────── */

export async function setBrandAliases(
  brandId: string,
  aliases: { ko?: string[]; ja?: string[]; en?: string[] },
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const clean = (list?: string[]) =>
    [...new Set((list ?? []).map((a) => a.trim()).filter(Boolean))];

  await prisma.brand.update({
    where: { id: brandId },
    data: { aliases: { ko: clean(aliases.ko), ja: clean(aliases.ja), en: clean(aliases.en) } },
  });
  revalidate("/admin/brands");
  return { ok: true };
}

/** 브랜드 비활성화 — **삭제하지 않는다.** 이미 붙은 아이템이 있다 */
export async function setBrandActive(
  brandId: string,
  active: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  await prisma.brand.update({ where: { id: brandId }, data: { active } });
  revalidate("/admin/brands");
  return { ok: true };
}

/**
 * 브랜드 요청 승인·반려 (FR-09-B, D-046·D-047).
 *
 * ⚠️ **승인 시 alias 를 함께 넣도록 유도해야 한다** (D-047). alias 가 없으면
 * 한국 유저가 "롤렉스"로 검색해도 안 나와서 **브랜드가 없는 것으로 오인**하고
 * 또 요청을 보낸다. 어드민이 그걸 다시 처리하는 순환이 생긴다.
 *
 * ⚠️ 같은 이름의 **대기 중 요청을 전부 함께 처리한다** — 하나만 승인하면
 * 나머지가 큐에 남아 "이미 있는 브랜드" 요청으로 계속 보인다.
 */
export async function resolveBrandRequest(input: {
  requestId: string;
  approve: boolean;
  /** 승인 시 함께 등록할 alias (D-047) */
  aliases?: { ko?: string[]; ja?: string[]; en?: string[] };
  note?: string;
}): Promise<ActionResult<{ notified: number }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  const req = await prisma.brandRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, requestedName: true, categoryKey: true, status: true },
  });
  if (!req) return fail({}, "요청을 찾을 수 없습니다");
  if (req.status !== "PENDING") return fail({}, "이미 처리된 요청입니다");

  const nq = normalizeBrandToken(req.requestedName);

  // 같은 이름의 대기 요청을 모두 찾는다 (FR-09-A-06 의 사후 처리)
  const siblings = await prisma.brandRequest.findMany({
    where: { status: "PENDING", categoryKey: req.categoryKey },
    select: { id: true, requestedName: true, requesterId: true },
  });
  const group = siblings.filter((r) => normalizeBrandToken(r.requestedName) === nq);

  const clean = (list?: string[]) =>
    [...new Set((list ?? []).map((a) => a.trim()).filter(Boolean))];

  await prisma.$transaction(async (tx) => {
    if (input.approve) {
      const category = await tx.category.findUnique({
        where: { key: req.categoryKey },
        select: { id: true },
      });
      await tx.brand.upsert({
        where: { name: req.requestedName },
        create: {
          name: req.requestedName,
          aliases: {
            ko: clean(input.aliases?.ko),
            ja: clean(input.aliases?.ja),
            en: clean(input.aliases?.en),
          },
          ...(category ? { categories: { connect: { id: category.id } } } : {}),
        },
        // 이미 있으면 카테고리만 연결한다 — active 는 건드리지 않는다
        update: category ? { categories: { connect: { id: category.id } } } : {},
      });
    }

    await tx.brandRequest.updateMany({
      where: { id: { in: group.map((g) => g.id) } },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        reviewedBy: ADMIN_ACTOR,
        reviewedAt: new Date(),
        note: input.note?.trim() || null,
      },
    });

    // 요청자 전원에게 결과 알림 (FR-08-B-01, D-047)
    const requesters = [...new Set(group.map((g) => g.requesterId))];
    await tx.notification.createMany({
      data: requesters.map((userId) => ({
        userId,
        type: "BRAND_REQUEST_RESULT" as const,
        params: {
          brand: req.requestedName,
          result: input.approve ? "approved" : "rejected",
        },
      })),
    });
  });

  revalidate("/admin/brands/requests", "/admin/brands");
  return { ok: true, notified: [...new Set(group.map((g) => g.requesterId))].length };
}

/* ────────────────────────────────────────────
   A-14 어드민 계정 관리 (D-104)
   ──────────────────────────────────────────── */

/**
 * 어드민 초대 (D-104).
 *
 * ## ⚠️ 이 화면은 권한 상승 경로다
 * D-102 에서 화면을 만들지 않기로 했던 이유가 그것이다. 만들기로 뒤집었으므로
 * (D-104) **경로 자체의 이력**을 남긴다 — `invitedBy` 에 초대한 어드민 id.
 *
 * 로그인은 기존 소셜(D-021)을 쓰므로 **이메일만 등록하면 된다.** 비밀번호를
 * 만들지 않는 것이 이 설계의 이점이다 — 어드민 비밀번호 관리가 통째로 없다.
 */
export async function inviteAdmin(input: {
  email: string;
  name: string;
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !email.includes("@")) return fail({ email: "이메일을 입력해주세요" });
  if (!name) return fail({ name: "이름을 입력해주세요" });

  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, active: true },
  });
  if (existing?.active) return fail({ email: "이미 등록된 어드민입니다" });

  if (existing) {
    // 회수됐던 계정을 되살린다. 새로 만들면 과거 이력이 두 행으로 갈린다
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        name,
        active: true,
        invitedBy: ADMIN_ACTOR,
        deactivatedBy: null,
        deactivatedAt: null,
      },
    });
  } else {
    await prisma.adminUser.create({
      data: { email, name, invitedBy: ADMIN_ACTOR },
    });
  }

  revalidate("/admin/admins");
  return { ok: true };
}

/**
 * 어드민 권한 회수·복구 (D-104).
 *
 * ## ⚠️ 잠금 방지가 이 함수의 존재 이유다
 *
 * | 막는 것 | 왜 |
 * |---|---|
 * | **자기 자신 비활성화** | 실수로 자기를 끄면 즉시 잠긴다 |
 * | **마지막 활성 어드민 비활성화** | 전원이 꺼지면 **아무도 `/admin` 에 못 들어간다.** 프로덕션은 개발 우회로도 꺼져 있어 복구가 DB 직접 조작뿐이다 |
 *
 * **삭제는 제공하지 않는다** (D-102). 지우면 그 사람이 한 과거 조치의
 * `issuedBy`·`verifiedBy` 가 가리킬 곳이 사라진다.
 */
export async function setAdminActive(
  adminId: string,
  active: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");
  return setAdminActiveAs(ADMIN_ACTOR, adminId, active);
}

/**
 * 본체 — 조치자를 주입받는다.
 *
 * ⚠️ **분리한 이유가 검증이다.** 진입점은 세션을 요구해서 스크립트로 부를 수
 * 없고, 그러면 **잠금 방지 로직을 한 번도 실행해보지 못한다.** 검증할 수 없는
 * 안전장치는 없는 것과 같다 — 개발 우회로가 D-078·D-096 을 가렸던 일이 그렇게
 * 생겼다. §6-2 의 분리 패턴과 같은 이유다.
 */
export async function setAdminActiveAs(
  actorId: string,
  adminId: string,
  active: boolean,
): Promise<ActionResult> {
  const ADMIN_ACTOR = actorId;

  const target = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, active: true },
  });
  if (!target) return fail({}, "어드민을 찾을 수 없습니다");

  if (!active) {
    if (target.id === ADMIN_ACTOR) {
      return fail({}, "자기 자신은 비활성화할 수 없습니다");
    }
    const remaining = await prisma.adminUser.count({
      where: { active: true, id: { not: adminId } },
    });
    if (remaining === 0) {
      return fail({}, "마지막 어드민은 비활성화할 수 없습니다 — 아무도 들어올 수 없게 됩니다");
    }
  }

  await prisma.adminUser.update({
    where: { id: adminId },
    data: active
      ? { active: true, invitedBy: ADMIN_ACTOR, deactivatedBy: null, deactivatedAt: null }
      : { active: false, deactivatedBy: ADMIN_ACTOR, deactivatedAt: new Date() },
  });

  revalidate("/admin/admins");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-04 도감 직접 등록 (codex FR-04-A)
   ──────────────────────────────────────────── */

/**
 * 어드민 도감 직접 등록 (FR-04-A-01~04).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 초기 검증 상태 = **검증됨** | D-015, FR-04-A-02 |
 * | `normalizedKey` 중복이면 **차단 + 기존 도감을 보여준다** | D-014, FR-04-A-03 |
 * | 매칭 키 구성 속성을 **필수 입력** | FR-04-A-04 |
 *
 * ## ⚠️ 유저 자동 생성과 초기 상태가 반대다
 * 유저 등록이 만드는 도감은 **미검증**(D-015, FR-03-B-01)이고, 어드민이 직접
 * 만든 것은 **검증됨**이다. 운영자가 확인해서 넣은 것이므로 다시 검증 큐에
 * 올릴 이유가 없다.
 */
export async function createCodexItem(input: {
  categoryKey: string;
  displayName: string;
  uniqueId: string;
  descriptions?: { ko?: string; ja?: string; en?: string };
}): Promise<ActionResult<{ codexId: string }>> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const displayName = input.displayName.trim();
  const uniqueId = input.uniqueId.trim();
  if (!displayName) return fail({ displayName: "명칭을 입력해주세요" });
  // 매칭 키 값이 없으면 어떤 아이템에도 연결되지 않는다 (FR-04-A-04)
  if (!uniqueId) return fail({ uniqueId: "고유값을 입력해주세요" });

  const category = await prisma.category.findUnique({
    where: { key: input.categoryKey },
    select: { id: true },
  });
  if (!category) return fail({}, "카테고리를 찾을 수 없습니다");

  const normalizedKey = normalizeBrandToken(uniqueId);
  const dup = await prisma.codexItem.findFirst({
    where: { categoryId: category.id, normalizedKey },
    select: { id: true, displayName: true },
  });
  // 차단하고 **기존 도감을 알려준다** — 그냥 막으면 어드민이 왜 막혔는지 모른다
  if (dup) {
    return fail({ uniqueId: `이미 있는 도감입니다 — "${dup.displayName}"` });
  }

  const made = await prisma.codexItem.create({
    data: {
      categoryId: category.id,
      displayName,
      uniqueId,
      normalizedKey,
      // 운영자가 확인해서 넣은 것이다 (FR-04-A-02)
      verification: "VERIFIED",
      verifiedBy: ADMIN_ACTOR,
      verifiedAt: new Date(),
      descriptions: input.descriptions
        ? Object.fromEntries(
            Object.entries(input.descriptions).filter(([, v]) => v?.trim()),
          )
        : undefined,
    },
    select: { id: true },
  });

  revalidate("/admin/codex", "/admin/codex/verification");
  return { ok: true, codexId: made.id };
}

/* ────────────────────────────────────────────
   A-02 속성 정의 추가 (item-catalog F-02)
   ──────────────────────────────────────────── */

/**
 * 커스텀 속성 정의 추가 (FR-02-A-xx, D-010·D-038).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 커스텀 속성은 **ko/ja/en 3개 필수** | D-010, `policies/i18n` Case 8 |
 * | `number` 단위도 **3개 언어** | D-038, FR-02-A-08 |
 * | `select`·`multiselect` 는 **선택지 최소 1개**, 선택지도 3개 언어 | E-02-07, `policies/i18n` §3 |
 * | key 가 공통 라이브러리와 충돌하면 차단 | E-02-09 |
 *
 * ## ⚠️ 3개 언어를 강제하는 이유
 * 여기서 ko 만 받으면 **일본어·영어 유저 화면에 한국어 라벨이 나온다.**
 * 어드민 UI 가 ko 단일인 것(D-030)과 **별개다** — 이 값들은 유저에게 보인다.
 * `policies/i18n` 이 "가장 흔한 누락 지점"으로 지목한 곳이다.
 */
const ATTR_TYPES = [
  "text", "textarea", "number", "select", "multiselect", "date", "boolean", "url",
] as const;

export async function createAttributeDefinition(input: {
  key: string;
  type: (typeof ATTR_TYPES)[number];
  label: { ko: string; ja: string; en: string };
  unit?: { ko?: string; ja?: string; en?: string };
  /** `select`·`multiselect` 전용. `key` 는 불변, 라벨만 3개 언어 (A-05 규칙) */
  options?: { key: string; ko: string; ja: string; en: string }[];
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const key = input.key.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
    return fail({ key: "key 는 영문으로 시작하는 영숫자여야 합니다" });
  }
  if (!ATTR_TYPES.includes(input.type)) return fail({ type: "타입을 선택해주세요" });

  // 3개 언어 전부 (D-010). 하나라도 비면 그 언어 유저가 다른 언어를 본다
  for (const l of ["ko", "ja", "en"] as const) {
    if (!input.label[l]?.trim()) {
      return fail({ [`label.${l}`]: `라벨(${l})을 입력해주세요` });
    }
  }

  const needsOptions = input.type === "select" || input.type === "multiselect";
  const options = (input.options ?? []).filter((o) => o.key.trim());
  if (needsOptions) {
    // 선택지가 0개면 유저가 아무것도 고를 수 없다 (E-02-07)
    if (options.length === 0) return fail({ options: "선택지를 최소 1개 넣어주세요" });
    for (const o of options) {
      for (const l of ["ko", "ja", "en"] as const) {
        if (!o[l]?.trim()) {
          return fail({ options: `선택지 "${o.key}" 의 ${l} 라벨이 비었습니다` });
        }
      }
    }
  }

  // key 충돌 — 공통 라이브러리든 커스텀이든 (E-02-09)
  const dup = await prisma.attributeDefinition.findUnique({
    where: { key },
    select: { key: true, isCommon: true },
  });
  if (dup) {
    return fail({
      key: dup.isCommon
        ? `공통 속성 "${key}" 가 이미 있습니다. 그것을 쓰세요`
        : `"${key}" 가 이미 있습니다`,
    });
  }

  await prisma.attributeDefinition.create({
    data: {
      key,
      type: input.type,
      labelKo: input.label.ko.trim(),
      labelJa: input.label.ja.trim(),
      labelEn: input.label.en.trim(),
      // `number` 가 아니면 단위를 저장하지 않는다 — 의미 없는 값이 남는다
      unitKo: input.type === "number" ? input.unit?.ko?.trim() || null : null,
      unitJa: input.type === "number" ? input.unit?.ja?.trim() || null : null,
      unitEn: input.type === "number" ? input.unit?.en?.trim() || null : null,
      // 어드민이 만든 것은 카테고리 전용 커스텀이다 (D-010)
      isCommon: false,
      ...(needsOptions
        ? {
            options: {
              create: options.map((o, i) => ({
                key: o.key.trim(),
                labelKo: o.ko.trim(),
                labelJa: o.ja.trim(),
                labelEn: o.en.trim(),
                displayOrder: i,
              })),
            },
          }
        : {}),
    },
  });

  revalidate("/admin/attributes");
  return { ok: true };
}

/* ────────────────────────────────────────────
   A-11 브랜드 추가 (item-catalog F-04)
   ──────────────────────────────────────────── */

/**
 * 브랜드 마스터 추가 (D-043 · D-047).
 *
 * ⚠️ **alias 를 함께 받는다.** alias 가 없으면 한국 유저가 "롤렉스"로 검색해도
 * 안 나와서 **브랜드가 없는 것으로 오인**하고 추가 요청을 보낸다. 어드민이
 * 그걸 또 처리하는 순환이 생긴다 (D-047).
 *
 * ⚠️ 중복 검사는 **정규화**로 한다 (D-014). `Snow Peak` 과 `snowpeak` 이 따로
 * 쌓이면 도감이 언어별로 쪼개진다 — D-043 이 막으려던 바로 그 상황이다.
 */
export async function createBrand(input: {
  name: string;
  categoryKeys: string[];
  aliases?: { ko?: string[]; ja?: string[]; en?: string[] };
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const name = input.name.trim();
  if (!name) return fail({ name: "브랜드명을 입력해주세요" });
  if (input.categoryKeys.length === 0) {
    return fail({ categories: "카테고리를 최소 1개 선택해주세요" });
  }

  const nq = normalizeBrandToken(name);
  const brands = await prisma.brand.findMany({ select: { name: true, aliases: true } });
  const dup = brands.find((b) => {
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
  if (dup) return fail({ name: `이미 있는 브랜드입니다 — "${dup.name}"` });

  const categories = await prisma.category.findMany({
    where: { key: { in: input.categoryKeys } },
    select: { id: true },
  });

  const clean = (list?: string[]) =>
    [...new Set((list ?? []).map((a) => a.trim()).filter(Boolean))];

  await prisma.brand.create({
    data: {
      name,
      aliases: {
        ko: clean(input.aliases?.ko),
        ja: clean(input.aliases?.ja),
        en: clean(input.aliases?.en),
      },
      categories: { connect: categories.map((c) => ({ id: c.id })) },
    },
  });

  revalidate("/admin/brands");
  return { ok: true };
}

/**
 * 도감 명칭·설명 편집 (A-04, FR-04-A).
 *
 * ⚠️ **`uniqueId`·`normalizedKey` 는 바꾸지 않는다.** 바꾸면 이미 연결된
 * 아이템들이 다른 제품의 도감에 붙은 채로 남는다. 고유값을 잘못 넣었으면
 * **새로 만들고 병합**(A-06)하는 것이 맞는 경로다 — 그래야 이력이 남는다.
 *
 * ⚠️ **검증된 도감은 유저가 수정할 수 없다** (FR-03-C-01). 그래서 오류
 * 신고(D-035)가 여기로 들어오고, 어드민이 이 폼으로 고친다.
 */
export async function updateCodexItem(input: {
  codexId: string;
  displayName: string;
  descriptions?: { ko?: string; ja?: string; en?: string };
}): Promise<ActionResult> {
  const ADMIN_ACTOR = await actor();
  if (!ADMIN_ACTOR) return fail({}, "권한이 없습니다");

  const displayName = input.displayName.trim();
  if (!displayName) return fail({ displayName: "명칭을 입력해주세요" });

  const codex = await prisma.codexItem.findUnique({
    where: { id: input.codexId },
    select: { verification: true },
  });
  if (!codex) return fail({}, "도감을 찾을 수 없습니다");

  await prisma.codexItem.update({
    where: { id: input.codexId },
    data: {
      displayName,
      // 미검증본에는 다국어 설명을 넣지 않는다 (FR-07-A-05) — 원문 1개가 맞다
      ...(codex.verification === "VERIFIED" && input.descriptions
        ? {
            descriptions: Object.fromEntries(
              Object.entries(input.descriptions).filter(([, v]) => v?.trim()),
            ),
          }
        : {}),
    },
  });

  revalidate("/admin/codex", "/[locale]/codex/[codexId]");
  return { ok: true };
}
