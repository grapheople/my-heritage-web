import { prisma } from "@/lib/prisma";

/**
 * 어드민 조회 (A-01~A-13).
 *
 * ⚠️ **어드민은 ko 단일이다** (D-030) — 여기서 로케일 분기를 하지 않는다.
 * 다국어 입력 필드(속성 라벨·선택지)는 3개 언어를 **입력받되** 화면 자체는
 * 한국어다.
 *
 * ⚠️ 유저 화면과 달리 **차단·비공개 필터를 적용하지 않는다.** 운영은 전체를
 * 봐야 조치할 수 있다. 그래서 이 모듈은 `(admin)` 라우트에서만 쓴다.
 */

/** A-13 운영 대시보드 — **처리 대기 큐만** (D-072) */
export async function getAdminQueues() {
  const now = new Date();
  const [mergeCandidates, unverifiedCodex, pendingReports, pendingBrandRequests, activeSanctions] =
    await Promise.all([
      // 병합 후보 자동 제안은 아직 없다 — 이미 병합된 건수를 센다 (OI-58)
      prisma.codexItem.count({ where: { mergedIntoId: { not: null } } }),
      prisma.codexItem.count({ where: { verification: "UNVERIFIED", mergedIntoId: null } }),
      prisma.report.count({ where: { status: "PENDING" } }),
      prisma.brandRequest.count({ where: { status: "PENDING" } }),
      prisma.sanction.count({
        where: {
          liftedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);
  return { mergeCandidates, unverifiedCodex, pendingReports, pendingBrandRequests, activeSanctions };
}

/** A-01 카테고리 — 6개 고정. 생성·삭제 없음 (D-007), 비활성화만 (D-036) */
export async function getAdminCategories() {
  const rows = await prisma.category.findMany({
    orderBy: { displayOrder: "asc" },
    select: {
      key: true,
      displayOrder: true,
      active: true,
      _count: { select: { items: true } },
    },
  });
  return rows.map((c) => ({
    slug: c.key,
    labelKey: `category.${c.key}`,
    order: c.displayOrder + 1,
    active: c.active,
    itemCount: c._count.items,
  }));
}

/** A-11 브랜드 마스터 (D-043 · D-047) */
export async function getAdminBrands() {
  const rows = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, aliases: true, active: true },
    take: 300,
  });
  return rows.map((b) => {
    const a = (b.aliases ?? {}) as Record<string, unknown>;
    const list = (k: string) =>
      Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
    return {
      id: b.id,
      name: b.name,
      active: b.active,
      // ⚠️ alias 가 비면 유저에게 "브랜드가 없다"로 보인다 (D-047)
      aliases: [...list("ko"), ...list("ja"), ...list("en")],
      aliasesByLang: { ko: list("ko"), ja: list("ja"), en: list("en") },
    };
  });
}

/**
 * A-12 브랜드 요청 큐 — **같은 요청은 합쳐서 건수로** 보여준다 (FR-09-A-06).
 * 요청 건수 순 (FR-09-B-01).
 */
export async function getAdminBrandRequests() {
  const rows = await prisma.brandRequest.findMany({
    where: { status: "PENDING" },
    select: { id: true, requestedName: true, categoryKey: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const grouped = new Map<
    string,
    { id: string; name: string; category: string; count: number; requestedAt: string }
  >();
  for (const r of rows) {
    const key = `${r.requestedName.toLowerCase()}:${r.categoryKey}`;
    const cur = grouped.get(key);
    if (cur) cur.count += 1;
    else
      grouped.set(key, {
        id: r.id,
        name: r.requestedName,
        category: r.categoryKey,
        count: 1,
        requestedAt: r.createdAt.toISOString().slice(0, 10),
      });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

/**
 * A-03 매칭 키 (D-013).
 *
 * ⚠️ `verified` 는 **DB 에 없다** — D-034 조사 완료 여부는 기획 결정이지
 * 데이터가 아니다. 조사가 끝난 3개만 코드에 둔다. 조사가 끝나면 이 집합을
 * 넓히는 것이 아니라 **결정을 먼저 기록한다** (D-034).
 */
const MATCHING_KEY_VERIFIED = new Set(["watch", "shoes", "camping"]);

export async function getAdminMatchingKeys() {
  const cats = await prisma.category.findMany({
    orderBy: { displayOrder: "asc" },
    select: { key: true, matchingKey: { select: { attributeKeys: true } } },
  });
  return cats.map((c) => ({
    category: c.key,
    keys: c.matchingKey?.attributeKeys ?? [],
    verified: MATCHING_KEY_VERIFIED.has(c.key),
  }));
}

/** A-02 카테고리별 속성 조합 — **여기가 비면 아이템 등록이 막힌다** (D-097) */
export async function getAdminCategoryAttributes() {
  const cats = await prisma.category.findMany({
    orderBy: { displayOrder: "asc" },
    select: {
      key: true,
      matchingKey: { select: { attributeKeys: true } },
      attributes: {
        orderBy: { displayOrder: "asc" },
        select: {
          required: true,
          active: true,
          attributeDefinition: { select: { key: true, type: true, labelKo: true } },
        },
      },
    },
  });
  return cats.map((c) => {
    const mk = new Set(c.matchingKey?.attributeKeys ?? []);
    return {
      slug: c.key,
      attrs: c.attributes.map((a) => ({
        key: a.attributeDefinition.key,
        label: a.attributeDefinition.labelKo,
        type: a.attributeDefinition.type,
        required: a.required,
        active: a.active,
        matchingKey: mk.has(a.attributeDefinition.key),
      })),
    };
  });
}

/** A-04·A-05·A-07 도감 목록. 보유자 수는 **전체 기준**이다 (운영은 차단을 안 본다) */
export async function getAdminCodex(opts: { unverifiedOnly?: boolean } = {}) {
  const rows = await prisma.codexItem.findMany({
    where: {
      mergedIntoId: null,
      ...(opts.unverifiedOnly ? { verification: "UNVERIFIED" as const } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayName: true,
      uniqueId: true,
      verification: true,
      aliases: true,
      category: { select: { key: true } },
      _count: { select: { items: true } },
    },
    take: 200,
  });
  return rows.map((c) => {
    const a = (c.aliases ?? {}) as Record<string, unknown>;
    const list = (k: string) =>
      Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
    return {
      id: c.id,
      displayName: c.displayName,
      uniqueId: c.uniqueId ?? "",
      categoryKey: `category.${c.category.key}`,
      verified: c.verification === "VERIFIED",
      ownerCount: c._count.items,
      aliases: [...list("ko"), ...list("ja"), ...list("en")],
    };
  });
}

/**
 * A-06 병합 후보.
 *
 * ⚠️ **자동 후보 제안은 아직 없다** (D-016 은 "어드민 수동 + 시스템 자동 제안"을
 * 요구한다). 유사도 계산 로직이 없어 **이미 병합된 이력만** 보여준다 — OI-58.
 * 추측으로 유사도를 만들어 넣지 않는다.
 */
export async function getAdminMergeHistory() {
  const rows = await prisma.codexItem.findMany({
    where: { mergedIntoId: { not: null } },
    select: {
      id: true,
      displayName: true,
      _count: { select: { items: true } },
      mergedInto: {
        select: { id: true, displayName: true, _count: { select: { items: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.flatMap((r) =>
    r.mergedInto
      ? [
          {
            id: r.id,
            survivor: r.mergedInto.displayName,
            survivorOwners: r.mergedInto._count.items,
            absorbed: r.displayName,
            absorbedOwners: r._count.items,
          },
        ]
      : [],
  );
}

/** A-08 신고 큐 — 누적 신고가 많으면 상단 (FR-05-A-07) */
export async function getAdminReports() {
  const rows = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      status: true,
      createdAt: true,
    },
    take: 200,
  });

  // 같은 대상에 대한 신고를 합쳐 건수로 본다 (FR-05-A-07)
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(`${r.targetType}:${r.targetId}`, (counts.get(`${r.targetType}:${r.targetId}`) ?? 0) + 1);

  return rows.map((r) => ({
    id: r.id,
    target: r.targetType.toLowerCase(),
    targetId: r.targetId,
    // ⚠️ 대상 이름은 종류가 5가지라 FK 가 없다. 운영 화면에서 id 로 이동한다
    targetName: r.targetId,
    reason: r.reason,
    count: counts.get(`${r.targetType}:${r.targetId}`) ?? 1,
    status: r.status,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }));
}

/** A-10 제재 — **제재 이전 공개 상태를 보존한다** (D-065, FR-07-B-03) */
export async function getAdminSanctions() {
  const rows = await prisma.sanction.findMany({
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      level: true,
      reasonCode: true,
      detail: true,
      expiresAt: true,
      previousRoomVisibility: true,
      issuedAt: true,
      liftedAt: true,
      user: { select: { room: { select: { id: true, name: true } } } },
    },
    take: 200,
  });
  return rows.map((s) => ({
    id: s.id,
    roomId: s.user.room?.id ?? "",
    roomName: s.user.room?.name ?? "(방 없음)",
    level: s.level,
    reasonCode: s.reasonCode,
    detail: s.detail ?? undefined,
    until: s.expiresAt?.toISOString().slice(0, 10) ?? null,
    previousRoomVisibility: s.previousRoomVisibility ?? "PUBLIC",
    issuedAt: s.issuedAt.toISOString().slice(0, 10),
    lifted: s.liftedAt !== null,
  }));
}

/** A-09 레벨 테이블 */
export async function getAdminLevels() {
  const rows = await prisma.levelDefinition.findMany({ orderBy: { level: "asc" } });
  return rows.map((l) => ({ level: l.level, required: l.requiredExp }));
}
