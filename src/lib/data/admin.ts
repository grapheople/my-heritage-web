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
      // 마켓 판매 허용 (D-173) — A-01 에서 토글한다
      sellable: true,
      _count: { select: { items: true } },
    },
  });
  return rows.map((c) => ({
    slug: c.key,
    labelKey: `category.${c.key}`,
    order: c.displayOrder + 1,
    active: c.active,
    sellable: c.sellable,
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
          labelKo: true, // 카테고리별 override (D-168)
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
        label: a.labelKo ?? a.attributeDefinition.labelKo,
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
      // 편집 폼은 언어별로 나눠 받아야 한다 (D-009)
      aliasesByLang: { ko: list("ko"), ja: list("ja"), en: list("en") },
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
    // ⚠️ enum 을 그대로 낸다. 소문자로 바꾸면 `EXTERNAL_LINK` → `external_link`
    // 가 되어 화면의 라벨 맵(`link`)과 어긋나 빈칸이 된다
    target: r.targetType,
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

/**
 * A-14 어드민 계정 목록 (D-104).
 *
 * `invitedBy`·`deactivatedBy` 는 `AdminUser.id` 라서 이름으로 풀어준다 —
 * id 를 그대로 보여주면 **누가 권한을 줬는지 화면에서 읽을 수 없다.**
 */
export async function getAdminUsers() {
  const rows = await prisma.adminUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, email: true, name: true, active: true,
      invitedBy: true, deactivatedBy: true, deactivatedAt: true, createdAt: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  const nameOf = (id: string | null) =>
    // 시드로 들어온 최초 어드민은 invitedBy 가 없다 (D-104 — 부트스트랩)
    id ? (byId.get(id) ?? id) : "—";

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    active: r.active,
    invitedBy: nameOf(r.invitedBy),
    deactivatedBy: nameOf(r.deactivatedBy),
    deactivatedAt: r.deactivatedAt?.toISOString().slice(0, 10) ?? null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }));
}

/**
 * A-10 제재 대상 검색.
 *
 * ⚠️ **어드민은 유저를 방 이름으로 찾는다.** 유저 화면에는 계정 식별자가
 * 없고(방 이름은 유일값도 아니다 — FR-05-A-06), 신고·문의는 방이나
 * 콘텐츠를 가리킨다. 그래서 방 이름 + 이메일 둘 다 매칭한다.
 *
 * ⚠️ 유저 화면과 달리 **비공개 방·차단·탈퇴를 거르지 않는다.** 운영은 전체를
 * 봐야 조치할 수 있다 — 비공개로 숨은 계정을 제재할 수 없으면 곤란하다.
 */
export async function searchSanctionTargets(query: string) {
  const q = query.trim();
  if (!q) return [];

  const rooms = await prisma.room.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      visibility: true,
      user: {
        select: {
          id: true,
          email: true,
          deletedAt: true,
          _count: { select: { sanctions: { where: { liftedAt: null } } } },
        },
      },
    },
    take: 20,
  });

  return rooms.map((r) => ({
    userId: r.user.id,
    roomId: r.id,
    roomName: r.name,
    email: r.user.email ?? "(비공개)",
    roomPublic: r.visibility === "PUBLIC",
    withdrawn: r.user.deletedAt !== null,
    /** 진행 중인 제재 수 — **경고 누적으로 자동 승격하지 않는다**(FR-07-A-06). 참고용이다 */
    activeSanctions: r.user._count.sanctions,
  }));
}

/**
 * 신고 대상 → 유저 (FR-05-A-09 — 신고 처리에서 제재로 이동).
 *
 * ⚠️ 대상 종류가 5가지라 FK 가 없다. 종류별로 풀어야 한다.
 * **외부 링크는 유저에 닿지 않는다** — 링크를 올린 아이템을 거쳐야 하는데
 * 신고가 링크 문자열만 들고 있어서다. 그 경우 `null` 을 낸다.
 */
export async function resolveReportTargetUser(
  targetType: string,
  targetId: string,
): Promise<{ userId: string; roomName: string } | null> {
  if (targetType === "ITEM") {
    const i = await prisma.item.findUnique({
      where: { id: targetId },
      select: { room: { select: { name: true, userId: true } } },
    });
    return i ? { userId: i.room.userId, roomName: i.room.name } : null;
  }
  if (targetType === "DIARY") {
    const d = await prisma.diary.findUnique({
      where: { id: targetId },
      select: { room: { select: { name: true, userId: true } } },
    });
    return d ? { userId: d.room.userId, roomName: d.room.name } : null;
  }
  if (targetType === "ROOM") {
    const r = await prisma.room.findUnique({
      where: { id: targetId },
      select: { name: true, userId: true },
    });
    return r ? { userId: r.userId, roomName: r.name } : null;
  }
  // CODEX·EXTERNAL_LINK 는 특정 유저의 콘텐츠가 아니다
  return null;
}

/**
 * A-03 매칭 키 후보 — **쓸 수 있는 타입만** (D-041, FR-01-A-06).
 *
 * `multiselect`·`boolean`·`textarea`·`url` 은 정규화가 성립하지 않는다.
 * 서버도 검증하지만 목록에서 애초에 빼는 것이 낫다.
 */
export async function getMatchingKeyCandidates() {
  const rows = await prisma.attributeDefinition.findMany({
    where: { type: { in: ["text", "number", "select", "date"] } },
    orderBy: { key: "asc" },
    select: { key: true, labelKo: true, type: true },
  });
  return rows.map((r) => ({ key: r.key, label: r.labelKo, type: r.type }));
}

/**
 * A-04 도감 직접 등록 폼이 필요한 것 — **카테고리별 매칭 키 입력칸**.
 *
 * ## ⚠️ 칸 하나로 받으면 복합 키 카테고리는 영원히 매칭되지 않는다
 * 유저 아이템은 `buildMatchingKey` 로 `brand␟model␟year` 형태의 키를 만든다.
 * 어드민이 "고유값" 한 칸에 `Trek Domane SL 6 2021` 을 넣으면 정규화 결과가
 * `trekdomanesl62021` 이라 **어떤 아이템과도 만나지 않는다.** 도감은 만들어지고
 * 보유자는 영원히 0명이다 — 조용히 실패하는 종류라 더 나쁘다.
 *
 * 그래서 매칭 키 구성만큼 칸을 만들어 **같은 함수로** 키를 만든다.
 */
export async function getCodexKeyForms() {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    select: { key: true, matchingKey: { select: { attributeKeys: true } } },
  });
  const defs = await prisma.attributeDefinition.findMany({
    select: { key: true, labelKo: true },
  });
  const labelByKey = new Map(defs.map((d) => [d.key, d.labelKo]));

  return categories.map((c) => {
    // 매칭 키가 없는 카테고리는 A-03 미구성이다. 단일 `uniqueId` 로 가정하지
    // 않고 **빈 배열**로 넘겨 화면이 "먼저 A-03 을 구성하세요"를 띄우게 한다
    const keys = c.matchingKey?.attributeKeys ?? [];
    return {
      categoryKey: c.key,
      parts: keys.map((k) => ({ key: k, label: labelByKey.get(k) ?? k })),
    };
  });
}

/** A-15 봇 목록 (D-146) */
export async function getBots() {
  const bots = await prisma.botAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      loginId: true,
      lastActedAt: true,
      user: {
        select: {
          id: true,
          language: true,
          room: {
            select: {
              name: true,
              _count: { select: { items: true, diaries: true } },
            },
          },
        },
      },
    },
  });
  return bots.map((b) => ({
    botId: b.user.id,
    loginId: b.loginId,
    roomName: b.user.room?.name ?? "",
    language: b.user.language,
    items: b.user.room?._count.items ?? 0,
    diaries: b.user.room?._count.diaries ?? 0,
    lastActedAt: b.lastActedAt?.toISOString().slice(0, 16).replace("T", " "),
  }));
}
