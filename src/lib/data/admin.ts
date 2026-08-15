import { categoryLabelKo } from "@/lib/category-label";
import { normalizeBrandToken } from "@/lib/brand-search";
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

/**
 * A-01·A-02·A-03 하위 제품군 (D-207).
 *
 * ⚠️ **비활성 제품군도 낸다.** 어드민은 전체를 봐야 조치할 수 있고, 이미 그
 * 제품군으로 등록된 아이템이 있으므로 목록에서 사라지면 안 된다 (D-036 태도).
 */
export async function getAdminSubtypes() {
  const rows = await prisma.categorySubtype.findMany({
    orderBy: [{ category: { displayOrder: "asc" } }, { displayOrder: "asc" }],
    select: {
      id: true,
      key: true,
      labelKo: true,
      labelJa: true,
      labelEn: true,
      active: true,
      category: { select: { key: true } },
      matchingKey: { select: { attributeKeys: true } },
      _count: { select: { items: true, attributes: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    categoryKey: r.category.key,
    labels: { ko: r.labelKo, ja: r.labelJa, en: r.labelEn },
    active: r.active,
    /** 제품군 전용 매칭 키. 없으면 카테고리 것으로 떨어진다 */
    matchingKeys: r.matchingKey?.attributeKeys ?? [],
    itemCount: r._count.items,
    attributeCount: r._count.attributes,
  }));
}

/**
 * A-02 제품군 전용 속성 (D-207).
 *
 * ⚠️ `getAdminCategoryAttributes` 는 `category.attributes` 를 읽는데,
 * 제품군 행은 `categoryId` 가 `null` 이라(카테고리 XOR 제품군) **거기 안 들어온다.**
 * 그래서 별도 조회가 필요하다.
 */
export async function getAdminSubtypeAttributes(subtypeId: string) {
  const rows = await prisma.categoryAttribute.findMany({
    where: { subtypeId },
    orderBy: { displayOrder: "asc" },
    select: {
      required: true,
      active: true,
      labelKo: true,
      attributeDefinition: { select: { key: true, type: true, labelKo: true } },
    },
  });
  return rows.map((a) => ({
    key: a.attributeDefinition.key,
    label: a.labelKo ?? a.attributeDefinition.labelKo,
    type: a.attributeDefinition.type,
    required: a.required,
    active: a.active,
  }));
}

/**
 * A-02 선택지 목록 (D-209, OI-100).
 *
 * ⚠️ **비활성·타 카테고리 스코프도 전부 낸다.** 어드민은 전체를 봐야 조치할
 * 수 있다 — 화면에서 안 보이면 왜 유저 폼에 안 나오는지 알 수 없다.
 */
export async function getAdminAttributeOptions() {
  const defs = await prisma.attributeDefinition.findMany({
    where: { type: { in: ["select", "multiselect"] } },
    orderBy: { key: "asc" },
    select: {
      key: true,
      labelKo: true,
      type: true,
      isCommon: true,
      options: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          key: true,
          labelKo: true,
          labelJa: true,
          labelEn: true,
          active: true,
          category: { select: { key: true } },
        },
      },
      /** 어느 카테고리·제품군에 붙어 있는 속성인가 — 어디에 영향이 가는지 */
      categoryAttributes: {
        select: { category: { select: { key: true } }, subtype: { select: { key: true } } },
      },
    },
  });
  return defs.map((d) => ({
    key: d.key,
    label: d.labelKo,
    type: d.type,
    isCommon: d.isCommon,
    usedBy: [
      ...new Set(
        d.categoryAttributes.map((c) => c.category?.key ?? `[${c.subtype?.key}]`),
      ),
    ],
    options: d.options.map((o) => ({
      id: o.id,
      key: o.key,
      labels: { ko: o.labelKo, ja: o.labelJa, en: o.labelEn },
      active: o.active,
      /** D-209 — `null` 이면 전 카테고리 공통 */
      scopedTo: o.category?.key ?? null,
    })),
  }));
}

/** A-11 브랜드 마스터 (D-043 · D-047) */
export async function getAdminBrands() {
  const rows = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      aliases: true,
      active: true,
      // ⚠️ **연결 카테고리를 실제로 낸다** (D-182). 화면이 전 브랜드에 "시계" 를
      // 하드코딩하고 있었다 — 브랜드 마스터는 카테고리별인데(D-044·D-045)
      // 어드민이 어느 카테고리에 붙었는지 확인할 수 없었다
      categories: { select: { key: true } },
    },
    take: ADMIN_LIST_LIMIT,
  });
  return rows.map((b) => {
    const a = (b.aliases ?? {}) as Record<string, unknown>;
    const list = (k: string) =>
      Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
    return {
      id: b.id,
      name: b.name,
      active: b.active,
      categoryKeys: b.categories.map((c) => c.key),
      // ⚠️ alias 가 비면 유저에게 "브랜드가 없다"로 보인다 (D-047)
      aliases: [...list("ko"), ...list("ja"), ...list("en")],
      aliasesByLang: { ko: list("ko"), ja: list("ja"), en: list("en") },
    };
  });
}

/**
 * A-11 브랜드 마스터 — **검색 · 카테고리 필터 · 페이징**.
 *
 * ⚠️ 검색은 **이름 + 3개 언어 alias** 를 같은 정규화로 훑는다 (D-190 과 같은
 * 규칙). `스노우피크` 로 찾으면 `Snow Peak` 가 나와야 한다 — 안 나오면
 * 어드민이 중복 브랜드를 만들고, 그러면 D-043 의 목적이 무너진다.
 *
 * ⚠️ 카테고리 필터는 **연결 카테고리**를 본다 (N:M). 연결되지 않은 브랜드는
 * 유저 선택 목록에 없으므로(D-044) 이 필터가 곧 "유저가 볼 수 있는 목록"이다.
 */
export async function getAdminBrandsPage(q: AdminListQuery = {}) {
  const all = await getAdminBrands();
  const filtered = all.filter((b) => {
    if (q.category && !b.categoryKeys.includes(q.category)) return false;
    if (!q.q) return true;
    return matchesQuery([b.name, ...b.aliases], q.q);
  });
  return {
    ...paginate(all, filtered, q),
    /*
      ⚠️ **경고는 전체 기준으로 센다.** 페이지·필터 기준으로 세면 검색 결과가
      0건일 때 "시드가 없습니다"가 뜨고(실제로는 290건 있는데), 2페이지에서는
      alias 누락 건수가 페이지 안 개수로 줄어든다. D-183 이 고친 것이 정확히
      **늘 켜져 있거나 자기모순인 경고**였다 — 페이징으로 되살리지 않는다
    */
    missingAliasTotal: all.filter((b) => b.aliases.length === 0).length,
  };
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

/**
 * 어드민 목록 조회 상한 (D-160 — 절단을 숨기지 않는다).
 *
 * ## ⚠️ 왜 DB 가 아니라 애플리케이션에서 거르는가
 * 검색이 **매칭·유저 검색과 같은 정규화**(D-014)를 써야 한다. `126610-LN` 로
 * 찾았는데 `126610ln` 도감이 안 나오면 어드민이 "없다"고 판단해 중복을 만든다.
 * 그 규칙을 SQL 로 옮기면 **정규화가 두 벌**이 되고, D-190 이 브랜드 게이트에서
 * 겪은 실패(자체 규칙을 들고 있어 `SnowPeak`·`스노우피크` 가 전부 거부됨)를
 * 반복한다. alias(Json)까지 같은 규칙으로 훑으려면 더욱 그렇다.
 *
 * `searchCodex` 도 같은 이유로 300건을 받아 앱에서 랭킹한다. 현재 규모(도감
 * 273 · 브랜드 290)에서 충분하고, **상한에 걸리면 화면이 알린다.**
 */
const ADMIN_LIST_LIMIT = 1000;

export type AdminListQuery = {
  q?: string;
  category?: string;
  page?: number;
  size?: number;
};

/** 정규화 부분일치 — 매칭·검색과 **같은 규칙**을 쓴다 (D-014) */
function matchesQuery(haystacks: (string | null | undefined)[], q: string): boolean {
  const nq = normalizeBrandToken(q);
  if (!nq) return true;
  return haystacks.some((h) => h && normalizeBrandToken(h).includes(nq));
}

/** 필터 뒤 페이지를 자른다. `total` 은 필터 **전**, `filtered` 는 필터 **후** */
function paginate<T>(all: T[], filteredRows: T[], opts: AdminListQuery) {
  const size = opts.size ?? 50;
  const lastPage = Math.max(1, Math.ceil(filteredRows.length / size));
  const page = Math.min(Math.max(1, opts.page ?? 1), lastPage);
  return {
    rows: filteredRows.slice((page - 1) * size, page * size),
    total: all.length,
    filtered: filteredRows.length,
    loadLimit: ADMIN_LIST_LIMIT,
  };
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
      /** 키 alias 편집 화면이 "편집 대상이 아닌 정식 값"으로 보여준다 (D-197) */
      normalizedKey: true,
      verification: true,
      aliases: true,
      category: { select: { key: true } },
      _count: { select: { items: true } },
      /*
        D-192 — **키 alias 는 명칭 alias 와 다른 축이다.** 언어별로 나뉘지 않고
        카테고리 안에서 유일하며 **등록 매칭에 쓰인다**(FR-02-B-05).
        PRIMARY 는 정식 값이라 편집 대상이 아니다 — `ALIAS` 만 가져온다.
      */
      matchKeys: {
        where: { kind: "ALIAS" as const },
        select: { id: true, value: true, source: true, approvedBy: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
    take: ADMIN_LIST_LIMIT,
  });
  const labels = new Map(
    await Promise.all(
      [...new Set(rows.map((r) => r.category.key))].map(
        async (k) => [k, await categoryLabelKo(k)] as const,
      ),
    ),
  );

  return rows.map((c) => {
    const a = (c.aliases ?? {}) as Record<string, unknown>;
    const list = (k: string) =>
      Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
    return {
      id: c.id,
      displayName: c.displayName,
      uniqueId: c.uniqueId ?? "",
      normalizedKey: c.normalizedKey,
      categoryKey: `category.${c.category.key}`,
      // 화면이 라벨 맵을 들고 있지 않게 한다 (위 `getCodexKeyForms` 주석 참조)
      categoryLabel: labels.get(c.category.key) ?? c.category.key,
      verified: c.verification === "VERIFIED",
      ownerCount: c._count.items,
      aliases: [...list("ko"), ...list("ja"), ...list("en")],
      // 편집 폼은 언어별로 나눠 받아야 한다 (D-009)
      aliasesByLang: { ko: list("ko"), ja: list("ja"), en: list("en") },
      /*
        키 alias (D-192). ⚠️ **승인 대기 중인 AI 제안이 섞여 있다** —
        `approvedBy` 가 없으면 매칭에 쓰이지 않으므로(FR-06-C-05) 화면이
        구분해서 보여줘야 한다. 안 그러면 어드민은 "넣었는데 왜 안 되나"가 된다
      */
      keyAliases: c.matchKeys.map((k) => ({
        id: k.id,
        value: k.value,
        source: k.source,
        /** `AI_APPROVED` 인데 승인 전이면 매칭에서 제외된다 */
        active: k.source !== "AI_APPROVED" || k.approvedBy !== null,
      })),
    };
  });
}

/**
 * A-04·A-07 도감 목록 — **검색 · 카테고리 필터 · 페이징**.
 *
 * ⚠️ 검색 대상은 **명칭 · 고유값 · 정식 값 · 명칭 alias · 키 alias** 전부다.
 * 어드민이 `1460` 으로 찾았는데 그것이 키 alias 인 도감이 안 나오면, 이미
 * 처리한 값을 또 처리하게 된다.
 */
export async function getAdminCodexPage(
  q: AdminListQuery & { unverifiedOnly?: boolean } = {},
) {
  const all = await getAdminCodex({ unverifiedOnly: q.unverifiedOnly });
  const filtered = all.filter((c) => {
    // ⚠️ `categoryKey` 는 `category.watch` 형태다 — 접두를 떼고 비교한다
    if (q.category && c.categoryKey !== `category.${q.category}`) return false;
    if (!q.q) return true;
    return matchesQuery(
      [c.displayName, c.uniqueId, c.normalizedKey, ...c.aliases, ...c.keyAliases.map((k) => k.value)],
      q.q,
    );
  });
  return paginate(all, filtered, q);
}

/**
 * 키 alias 후보 큐 (FR-06-C-09·10, D-198).
 *
 * ## ⚠️ 이 큐의 재료는 AI 가 아니라 **유저가 실제로 넣은 값**이다
 * 등록 매칭이 미스로 끝났는데(`CREATED`) **같은 값으로 검색하면 도감이 나온**
 * 경우다 — 검색은 부분일치이므로(FR-06-B-01) 이 조합은 "도감은 있는데 키가
 * 안 맞았다" = **단위 차이**를 뜻한다 (OI-97 유형).
 *
 * 지어낸 값이 아니므로 D-186 가드(슬러그·숫자 없음 차단)의 관심사가 원천
 * 차단되고, **검색이 이미 같은 제품으로 판단한 도감**이 짝으로 붙어 있다.
 * D-194 가 병합 축적(①)을 1순위로 둔 근거를 **병합을 기다리지 않고** 얻는다.
 *
 * ⚠️ **빈도 순으로 준다** (FR-06-C-10). 같은 값이 반복 등장할수록 실제 통용
 * 표기일 가능성이 높다. 1회짜리는 오타일 수 있다.
 *
 * ⚠️ **이미 키 alias 인 값은 뺀다** — 승인했는데 큐에 남아 있으면 어드민이
 * 같은 것을 다시 처리한다.
 */
export async function getCodexKeyAliasCandidates(limit = 50) {
  const rows = await prisma.codexMatchLog.groupBy({
    by: ["categoryId", "attempted", "topHitCodexId"],
    where: { outcome: "CREATED", searchHits: { gt: 0 }, topHitCodexId: { not: null } },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { attempted: "desc" } },
    take: limit,
  });
  if (rows.length === 0) return [];

  // 이미 매칭 인덱스에 있는 값은 후보가 아니다 (승인 완료 또는 정식 값)
  const taken = new Set(
    (
      await prisma.codexMatchKey.findMany({
        where: { OR: rows.map((r) => ({ categoryId: r.categoryId, value: r.attempted })) },
        select: { categoryId: true, value: true },
      })
    ).map((k) => `${k.categoryId}${k.value}`),
  );

  const fresh = rows.filter((r) => !taken.has(`${r.categoryId}${r.attempted}`));
  if (fresh.length === 0) return [];

  const targets = await prisma.codexItem.findMany({
    where: { id: { in: [...new Set(fresh.map((r) => r.topHitCodexId!))] } },
    select: { id: true, displayName: true, normalizedKey: true, mergedIntoId: true },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));

  return fresh
    .map((r) => {
      const t = byId.get(r.topHitCodexId!);
      // 그 사이 병합·삭제됐을 수 있다 — survivor 를 따라가지 않고 후보에서 뺀다
      // (어느 도감에 붙일지는 어드민 판단이고, 추측으로 옮기면 조용히 틀린다)
      if (!t || t.mergedIntoId) return null;
      return {
        categoryId: r.categoryId,
        /** 유저가 실제로 넣은 정규화 값 */
        attempted: r.attempted,
        count: r._count._all,
        lastSeenAt: r._max.createdAt,
        target: { id: t.id, displayName: t.displayName, normalizedKey: t.normalizedKey },
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
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

  /*
    ⚠️ **댓글만 본문을 함께 낸다** (D-179, OI-89 해소).

    다른 대상은 id 로 화면을 찾아갈 수 있다(`/items/{id}` 등). 그런데 **댓글은
    id 로 갈 URL 이 없다** — 착용샷 안에 있기 때문이다. 본문과 착용샷 경로를 주지
    않으면 어드민이 무엇을 신고당했는지 볼 수 없어 **검수 자체가 불가능**하다.

    나머지 4종의 `targetName` 이 여전히 id 인 것은 **이 변경 전부터** 그랬다 —
    함께 고치는 것은 이 작업의 범위가 아니다 (OI-91).
  */
  const commentIds = rows
    .filter((r) => r.targetType === "COMMENT")
    .map((r) => r.targetId);
  const comments =
    commentIds.length > 0
      ? await prisma.comment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, body: true, wearShotId: true },
        })
      : [];
  const byComment = new Map(comments.map((c) => [c.id, c]));

  return rows.map((r) => {
    const comment = r.targetType === "COMMENT" ? byComment.get(r.targetId) : undefined;
    return {
    id: r.id,
    // ⚠️ enum 을 그대로 낸다. 소문자로 바꾸면 `EXTERNAL_LINK` → `external_link`
    // 가 되어 화면의 라벨 맵(`link`)과 어긋나 빈칸이 된다
    target: r.targetType,
    targetId: r.targetId,
    // ⚠️ 대상 이름은 종류가 6가지라 FK 가 없다. 댓글만 본문을 낸다 (위 주석)
    targetName: comment ? comment.body : r.targetId,
    /** 눌러서 대상을 볼 수 있는 경로 — 지금은 댓글만 (D-179) */
    targetHref: comment ? `/ko/wear/${comment.wearShotId}` : undefined,
    reason: r.reason,
    count: counts.get(`${r.targetType}:${r.targetId}`) ?? 1,
    status: r.status,
    createdAt: r.createdAt.toISOString().slice(0, 10),
    };
  });
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
    select: {
      key: true,
      matchingKey: { select: { attributeKeys: true } },
      /*
        ⚠️ **카테고리별 라벨 override 를 같이 읽는다** (D-168). 전역
        `attributeDefinition.labelKo` 만 보면 운동의 `model` 이 "모델명"으로
        나오는데, 유저 등록 화면과 조사 프롬프트는 "운동명"이라고 부른다
        (D-166) — **같은 값을 두 이름으로 부르는 화면**이 된다.
      */
      attributes: {
        where: { active: true },
        select: { labelKo: true, attributeDefinition: { select: { key: true } } },
      },
    },
  });
  const defs = await prisma.attributeDefinition.findMany({
    select: { key: true, labelKo: true },
  });
  const labelByKey = new Map(defs.map((d) => [d.key, d.labelKo]));
  const labelByCategory = new Map(
    await Promise.all(
      categories.map(async (c) => [c.key, await categoryLabelKo(c.key)] as const),
    ),
  );

  return categories.map((c) => {
    // 매칭 키가 없는 카테고리는 A-03 미구성이다. 단일 `uniqueId` 로 가정하지
    // 않고 **빈 배열**로 넘겨 화면이 "먼저 A-03 을 구성하세요"를 띄우게 한다
    const keys = c.matchingKey?.attributeKeys ?? [];
    return {
      categoryKey: c.key,
      // ⚠️ 라벨을 **여기서 준다.** 화면이 `{ watch: "시계", ... }` 맵을 들고
      // 있으면 카테고리를 추가할 때마다 빠진다 — 운동(D-163)이 실제로 그렇게
      // `workout` 으로 렌더됐다 (A-11 의 하드코딩과 같은 종류의 버그)
      label: labelByCategory.get(c.key) ?? c.key,
      parts: keys.map((k) => {
        // override → 전역 라벨 → 키. 유저 화면과 같은 순서다 (`categoryFields`)
        const override = c.attributes.find(
          (a) => a.attributeDefinition.key === k,
        )?.labelKo;
        return { key: k, label: override ?? labelByKey.get(k) ?? k };
      }),
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

/**
 * 병합 후보 제안 (D-181, OI-58 해소).
 *
 * ## ⚠️ 유사도 점수를 발명하지 않는다
 * D-016 은 "시스템 자동 후보 제안"을 요구하지만 **어떤 유사도인지는 정하지
 * 않았다.** 임의의 점수(편집 거리·가중치)를 만들면 어드민이 그 숫자를 신뢰하게
 * 되고, 근거를 설명할 수 없다. 그래서 **이미 있는 규칙만** 쓴다:
 *
 * | 후보 조건 | 근거 |
 * |---|---|
 * | 같은 카테고리 | 매칭 키 체계가 카테고리별이다 (D-013) |
 * | 둘 다 미병합 | 연쇄 병합을 만들지 않는다 |
 * | **정규화 명칭이 같다** 또는 **한쪽이 다른 쪽의 접두** | 등록·검색과 **같은 정규화**(D-014)다 |
 * | 또는 **정규화 고유값이 같다** | 같은 물건인데 도감이 갈린 전형적 형태 |
 *
 * 즉 "왜 후보인가"를 항상 한 문장으로 말할 수 있다. 애매한 쌍은 **제안하지
 * 않는다** — 놓치는 것이 잘못 합치는 것보다 싸다 (병합은 아이템을 옮긴다).
 *
 * ## ⚠️ survivor 를 고르지 않는다
 * D-016 은 **어드민 수동 실행**이다. 어느 쪽을 남길지는 검증 상태·보유자 수를
 * 보고 사람이 정한다 — 화면이 양쪽 버튼을 준다.
 */
export async function getCodexMergeCandidates(): Promise<
  {
    reason: "sameName" | "prefix" | "sameUniqueId";
    a: { id: string; name: string; uniqueId: string; verified: boolean; items: number };
    b: { id: string; name: string; uniqueId: string; verified: boolean; items: number };
    categoryKey: string;
  }[]
> {
  const rows = await prisma.codexItem.findMany({
    where: { mergedIntoId: null },
    select: {
      id: true,
      displayName: true,
      uniqueId: true,
      verification: true,
      category: { select: { key: true } },
      _count: { select: { items: true } },
    },
    // 전수 비교라 상한을 둔다 — 넘으면 배치로 옮겨야 한다
    take: 500,
  });

  const norm = (v: string | null) => (v ? normalizeBrandToken(v) : "");
  const out: Awaited<ReturnType<typeof getCodexMergeCandidates>> = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const x = rows[i];
      const y = rows[j];
      if (x.category.key !== y.category.key) continue;

      const nx = norm(x.displayName);
      const ny = norm(y.displayName);
      const ux = norm(x.uniqueId);
      const uy = norm(y.uniqueId);

      let reason: "sameName" | "prefix" | "sameUniqueId" | null = null;
      if (ux && uy && ux === uy) reason = "sameUniqueId";
      else if (nx && ny && nx === ny) reason = "sameName";
      else if (nx && ny && (nx.startsWith(ny) || ny.startsWith(nx))) reason = "prefix";
      if (!reason) continue;

      const shape = (r: (typeof rows)[number]) => ({
        id: r.id,
        name: r.displayName,
        uniqueId: r.uniqueId ?? "",
        verified: r.verification === "VERIFIED",
        items: r._count.items,
      });
      out.push({ reason, a: shape(x), b: shape(y), categoryKey: x.category.key });
    }
  }
  // 같은 고유값 > 같은 명칭 > 접두 순으로 확실한 것부터
  const rank = { sameUniqueId: 0, sameName: 1, prefix: 2 };
  return out.sort((p, q) => rank[p.reason] - rank[q.reason]).slice(0, 50);
}
