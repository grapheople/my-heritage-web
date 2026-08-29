# 어드민 카테고리 상세 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카테고리를 어드민의 1급 객체로 만들어, A-02 동적 속성·A-03 매칭 키·A-04 도감의 카테고리분을 `/admin/categories/[key]` 하위 탭으로 흡수한다.

**Architecture:** Next.js App Router 중첩 라우트. `[key]/layout.tsx`가 DB로 카테고리 존재를 검증하고 탭바를 공유하며, 각 탭이 독립 `page.tsx`로 자기 데이터만 조회한다. 기존 서버 액션은 전부 `categoryKey` 기반이라 그대로 재사용하고 `revalidatePath` 대상만 늘린다.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind CSS 4 + shadcn/ui · Prisma 7 + PostgreSQL · pnpm

**Spec:** `docs/superpowers/plans/../specs/2026-08-29-admin-category-detail-design.md`

## Global Constraints

- **작업 브랜치: `main`** — PM이 명시적으로 지시했다. 브랜치를 따지 않는다
- **어드민 UI 언어는 ko 단일** (D-030). 문자열을 `messages/*.json`에 넣지 않고 하드코딩한다
- **어드민이 입력하는 유저 노출 필드는 ko/ja/en 3개 필수** (D-010) — 속성 라벨·단위·선택지·도감 설명. 어드민 UI가 ko 단일인 것과 별개다
- **삭제는 없다. 비활성화만 있다** (D-036). 값은 보존되고 표시에서만 빠진다
- **카테고리 라벨은 `adminCategoryOptions()` 하나만 쓴다.** 화면마다 라벨 맵을 만들지 않는다 — 같은 버그를 네 번 만났다 (D-173·D-182·D-185)
- **카테고리 존재 검증은 DB로 한다.** `adminCategoryOptions()`는 `CATEGORY_KEYS` 코드 배열을 읽으므로(OI-82 미해소) 존재 판정에 쓰면 안 된다
- **`CodexItem`에 `verified` 불리언은 없다.** `verification` enum(`VERIFIED` / `UNVERIFIED`)이다
- **`Category.key`는 맨 slug**(`watch`)이고, 도감 조회는 내부에서 `category.${key}`로 접두를 붙여 비교한다. URL 값을 변환 없이 넘긴다
- 검증 명령: `pnpm lint` · `pnpm typecheck` · 실제 HTTP 요청(`localhost:3002`)

### ⚠️ 이 저장소에는 테스트가 없다

테스트 파일 0개, `test` 스크립트 없음. 테스트 인프라 구축은 **스코프 밖으로 승인**되었다. 각 태스크의 검증은 `pnpm lint` + `pnpm typecheck` + **실제 요청**으로 한다.

**빌드도 typecheck도 이 화면들의 런타임 오류를 잡지 못한다** — 어드민은 `export const dynamic = "force-dynamic"`이라 빌드가 렌더하지 않는다. `admin-list-params.ts` 주석의 사고가 그것이다(클라이언트 모듈 함수를 서버에서 불러 모든 페이지가 500이었는데 `pnpm check`·`pnpm build` 모두 통과). **반드시 curl로 확인한다.**

---

## File Structure

### 생성

| 파일 | 책임 |
|---|---|
| `src/app/(admin)/admin/categories/[key]/layout.tsx` | 존재 검증(`notFound`) · 헤더 · 탭바 |
| `src/app/(admin)/admin/categories/[key]/page.tsx` | 개요 — 토글·집계·브랜드 |
| `src/app/(admin)/admin/categories/[key]/subtypes/page.tsx` | 하위 종류 |
| `src/app/(admin)/admin/categories/[key]/attributes/page.tsx` | 동적 속성 · 붙이기 · 선택지 |
| `src/app/(admin)/admin/categories/[key]/matching-key/page.tsx` | 매칭 키 |
| `src/app/(admin)/admin/categories/[key]/codex/page.tsx` | 도감 (`?q=&page=&size=`) |
| `src/components/admin/category-tabs.tsx` | 탭바 (client — `usePathname`) |
| `src/components/admin/attribute-attach.tsx` | 붙이기 후보 목록 + 버튼 (client) |

### 수정

| 파일 | 변경 |
|---|---|
| `src/lib/data/admin.ts` | `getAdminCategoryDetail` · `getUnattachedAttributes` 추가, `getAdminCategoryAttributes(key?)` 인자화 |
| `src/lib/actions/admin.ts` | `revalidatePath` 대상에 새 경로 추가 |
| `src/app/(admin)/admin/categories/page.tsx` | 각 행에 상세 링크 |
| `src/app/(admin)/admin/attributes/page.tsx` | redirect로 대체 |
| `src/app/(admin)/admin/matching-keys/page.tsx` | redirect로 대체 |
| `src/app/(admin)/admin/codex/page.tsx` | 등록 폼·자료조사 패널 제거 |
| `src/components/layout/admin-nav.tsx` | A-02·A-03 제거, A-04 라벨 변경 |

---

## Task 1: 데이터 레이어

**Files:**
- Modify: `src/lib/data/admin.ts`

**Interfaces:**
- Produces:
  - `getAdminCategoryDetail(key: string)` → `Promise<CategoryDetail | null>`
  - `getAdminCategoryAttributes(key?: string)` → 기존 반환 형태 유지(`{ slug, attrs }[]`), 인자 있으면 그 카테고리만
  - `getUnattachedAttributes(key: string)` → `Promise<{ key: string; label: string; type: string }[]>`

- [ ] **Step 1: `getAdminCategoryDetail` 추가**

`getAdminCategories` 바로 아래(약 60행)에 넣는다.

```ts
/**
 * 카테고리 상세 개요 (D-246).
 *
 * ⚠️ **존재 검증의 유일한 출처다.** `adminCategoryOptions()` 는 `CATEGORY_KEYS`
 * 코드 배열을 읽으므로(OI-82) 카테고리 추가 스크립트를 돌린 직후에는 DB 에
 * 있는 카테고리가 거기 없다. 그걸로 판정하면 **있는 카테고리가 404 가 된다.**
 *
 * ⚠️ `CodexItem` 에 `verified` 불리언은 없다 — `verification` enum 이다.
 */
export async function getAdminCategoryDetail(key: string) {
  const c = await prisma.category.findUnique({
    where: { key },
    select: {
      id: true,
      key: true,
      displayOrder: true,
      active: true,
      sellable: true,
      // D-224·D-231 — 토글하지 않는다. 표시만 한다
      requiresPhoto: true,
      userCodexCreation: true,
      matchingKey: { select: { attributeKeys: true } },
      // N:M 이라 상세에서는 읽기 전용이다 (편집은 A-11)
      brands: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      _count: {
        select: { items: true, codexItems: true, subtypes: true, attributes: true },
      },
    },
  });
  if (!c) return null;

  const unverifiedCodexCount = await prisma.codexItem.count({
    where: { categoryId: c.id, verification: "UNVERIFIED" },
  });

  return {
    slug: c.key,
    order: c.displayOrder + 1,
    active: c.active,
    sellable: c.sellable,
    requiresPhoto: c.requiresPhoto,
    userCodexCreation: c.userCodexCreation,
    matchingKeys: c.matchingKey?.attributeKeys ?? [],
    brands: c.brands,
    itemCount: c._count.items,
    codexCount: c._count.codexItems,
    unverifiedCodexCount,
    subtypeCount: c._count.subtypes,
    attributeCount: c._count.attributes,
  };
}
```

- [ ] **Step 2: `getAdminCategoryAttributes`를 인자화**

기존 시그니처 `getAdminCategoryAttributes()`(289행)를 바꾼다. **반환 형태는 그대로 둔다** — 전역 A-02가 제거될 때까지 두 호출자가 공존한다.

```ts
export async function getAdminCategoryAttributes(key?: string) {
  const cats = await prisma.category.findMany({
    // 인자가 있으면 그 카테고리만. 없으면 종전대로 전부
    where: key ? { key } : undefined,
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
  // 이하 기존 map 블록 그대로
```

- [ ] **Step 3: `getUnattachedAttributes` 추가**

`getAdminCategoryAttributes` 바로 아래에 넣는다.

```ts
/**
 * 이 카테고리에 **아직 붙지 않은** 속성 정의 (D-250).
 *
 * ## ⚠️ 왜 필요한가
 * `createAttributeDefinition` 은 `AttributeDefinition` 만 만들고
 * `CategoryAttribute` 행은 만들지 않는다. 그래서 시계 화면에서 속성을 만들어도
 * **시계 목록에 나타나지 않았다** — 붙이는 경로가 UI 에 없었다.
 *
 * 제품군에는 있다(`SubtypeAttributes` 의 `candidates`). 카테고리 본체에만
 * 빠져 있었다.
 *
 * ⚠️ **비활성 행도 "붙어 있음"으로 친다.** 비활성은 D-036 의 상태이지 없는
 * 것이 아니다 — 후보에 다시 띄우면 어드민이 같은 속성을 두 번 붙이려 한다.
 */
export async function getUnattachedAttributes(key: string) {
  const defs = await prisma.attributeDefinition.findMany({
    where: { categoryAttributes: { none: { category: { key } } } },
    orderBy: { key: "asc" },
    select: { key: true, type: true, labelKo: true },
  });
  return defs.map((d) => ({ key: d.key, label: d.labelKo, type: d.type }));
}
```

- [ ] **Step 4: 검증**

```bash
cd /Users/pax/Documents/GitHub/my-heritage-web
pnpm typecheck
```

기대: 통과. 실패하면 `_count` 관계명(`items`·`codexItems`·`subtypes`·`attributes`)과 `verification` enum 값을 `prisma/schema.prisma`에서 재확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/data/admin.ts
git commit -m "$(cat <<'EOF'
D-246 카테고리 상세 조회 3종 추가 — 존재 검증은 DB 로 한다

adminCategoryOptions() 는 CATEGORY_KEYS 코드 배열을 읽어서(OI-82)
카테고리 추가 직후에는 DB 에 있는 것이 거기 없다. 존재 판정에 쓰면
있는 카테고리가 404 가 된다.

getUnattachedAttributes 는 D-250 — 만들어도 안 붙던 구멍을 메운다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 2: layout + 탭바 + 개요 탭

**Files:**
- Create: `src/app/(admin)/admin/categories/[key]/layout.tsx`
- Create: `src/app/(admin)/admin/categories/[key]/page.tsx`
- Create: `src/components/admin/category-tabs.tsx`

**Interfaces:**
- Consumes: `getAdminCategoryDetail(key)` (Task 1)
- Produces: `/admin/categories/[key]` 라우트 그룹, `CategoryTabs` 컴포넌트

- [ ] **Step 1: 탭바 컴포넌트**

`src/components/admin/category-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 카테고리 상세 탭바 (D-246).
 *
 * ⚠️ **개요 탭만 정확 일치로 판정한다.** `startsWith` 로 하면 `/watch/codex`
 * 에서 개요도 함께 활성으로 보인다.
 */
const TABS = [
  { seg: "", label: "개요" },
  { seg: "subtypes", label: "하위 종류" },
  { seg: "attributes", label: "동적 속성" },
  { seg: "matching-key", label: "매칭 키" },
  { seg: "codex", label: "도감" },
] as const;

export function CategoryTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/admin/categories/${slug}`;

  return (
    <nav className="mt-4 flex gap-1 border-b">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const activeTab = t.seg ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.seg}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              activeTab
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: layout.tsx**

`src/app/(admin)/admin/categories/[key]/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import { CategoryTabs } from "@/components/admin/category-tabs";
import { categoryLabelKo } from "@/lib/category-label";
import { getAdminCategoryDetail } from "@/lib/data/admin";

/**
 * 카테고리 상세 공통 레이아웃 (D-246).
 *
 * ⚠️ **존재 검증은 여기 한 곳에서만 한다.** 탭마다 걸면 새 탭을 추가할 때
 * 빠뜨린다 — 어드민 인가 가드가 layout 에 있는 것과 같은 이유다 (D-096).
 *
 * ⚠️ **DB 로 판정한다.** `adminCategoryOptions()` 로 하면 카테고리 추가
 * 스크립트 직후 있는 카테고리가 404 가 된다 (OI-82).
 */
export default async function CategoryDetailLayout({
  children,
  params,
}: LayoutProps<"/admin/categories/[key]">) {
  const { key } = await params;
  const detail = await getAdminCategoryDetail(key);
  if (!detail) notFound();

  const label = await categoryLabelKo(key);

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold text-muted-foreground">A-01 · 카테고리 상세</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{label}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{key}</p>
        <CategoryTabs slug={key} />
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: 개요 page.tsx**

`src/app/(admin)/admin/categories/[key]/page.tsx`:

```tsx
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/action-button";
import { Pill, StatCard } from "@/components/admin/ui";
import { setCategoryActive, setCategorySellable } from "@/lib/actions/admin";
import { getAdminCategoryDetail } from "@/lib/data/admin";
import { notFound } from "next/navigation";

/**
 * 카테고리 상세 — 개요 (D-246).
 *
 * ⚠️ **`requiresPhoto`·`userCodexCreation` 은 토글하지 않는다.** 둘 다
 * 카테고리의 **성질**이지 운영 판단이 아니다 (`sellable` 과 갈리는 지점).
 * `FR-07-A-13` 이 사진 필수 토글을 의도적으로 만들지 않았고, D-231 은
 * `userCodexCreation` 을 켜면 **유저 등록이 조용히 도감을 만들기 시작한다**.
 */
export default async function CategoryOverviewPage({
  params,
}: PageProps<"/admin/categories/[key]">) {
  const { key } = await params;
  const c = await getAdminCategoryDetail(key);
  // layout 이 이미 막았지만 타입을 좁히려면 필요하다
  if (!c) notFound();

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="등록 아이템" value={c.itemCount} />
        <StatCard label="도감" value={c.codexCount} href={`/admin/categories/${key}/codex`} />
        <StatCard label="미검증 도감" value={c.unverifiedCodexCount} warn />
        <StatCard label="하위 종류" value={c.subtypeCount} href={`/admin/categories/${key}/subtypes`} />
        <StatCard label="속성" value={c.attributeCount} href={`/admin/categories/${key}/attributes`} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold">상태</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <span className="text-sm">노출</span>
          {c.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}
          <AdminActionButton
            label={c.active ? "비활성화" : "활성화"}
            confirm={c.active ? "신규 등록이 막힙니다. 기존 아이템은 그대로입니다." : undefined}
            action={setCategoryActive.bind(null, key, !c.active)}
          />

          <span className="ml-6 text-sm">마켓</span>
          {c.sellable ? <Pill tone="sale">판매 가능</Pill> : <Pill>판매 불가</Pill>}
          <AdminActionButton
            label={c.sellable ? "판매 막기" : "판매 허용"}
            confirm={
              c.sellable
                ? "신규 판매 전환이 막히고, 이미 판매중인 매물도 마켓에서 내려갑니다. 되돌릴 수 있어요."
                : undefined
            }
            action={setCategorySellable.bind(null, key, !c.sellable)}
          />
        </div>
      </section>

      {/*
        ⚠️ 토글이 아니다. 카테고리의 성질이라 어드민이 바꾸지 않는다 —
        `FR-07-A-13`(사진 필수) · D-231(유저 도감 생성)
      */}
      <section className="mt-6">
        <h2 className="text-sm font-bold">카테고리 성질 (읽기 전용)</h2>
        <dl className="mt-3 grid gap-3 rounded-lg border border-dashed p-4 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">사진 1장 필수</dt>
            <dd>{c.requiresPhoto ? <Pill tone="sale">필수</Pill> : <Pill>면제</Pill>}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">유저 등록이 도감 생성</dt>
            <dd>{c.userCodexCreation ? <Pill tone="sale">생성함</Pill> : <Pill>생성 안 함</Pill>}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          이 둘은 어드민이 바꾸지 않습니다. 사진 필수를 잘못 끄면 판매 매물에서 사진이
          사라지고 (FR-07-A-13), 유저 도감 생성을 잘못 켜면 어드민이 준비하기로 한 도감이
          유저 등록으로 생겨납니다 (D-231). 바꾸려면 마이그레이션이 필요합니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold">연결 브랜드 {c.brands.length}건 (읽기 전용)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          브랜드는 카테고리와 N:M 이라 여기서 편집하지 않습니다 —{" "}
          <Link href="/admin/brands" className="underline">브랜드 마스터 (A-11)</Link> 에서
          관리합니다. 연결되지 않은 브랜드는 유저 선택 목록에 없습니다 (D-044).
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.brands.length === 0
            ? <span className="text-sm text-muted-foreground">연결된 브랜드가 없습니다</span>
            : c.brands.map((b) => <Pill key={b.id}>{b.name}</Pill>)}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: 검증 — typecheck**

```bash
pnpm typecheck
```

기대: 통과. `LayoutProps`/`PageProps` 제네릭 문자열이 실제 라우트와 정확히 일치해야 한다 — Next 16이 타입을 생성하므로 경로 오타는 여기서 잡힌다.

- [ ] **Step 5: 검증 — 실제 요청**

개발 서버가 3002에 떠 있어야 한다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/watch
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/workout
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/nonexistent
```

기대: `200` · `200` · `404`

⚠️ 어드민은 인가 가드가 있다. 로그인 세션 없이 curl하면 전부 `404`다 — 그 경우 브라우저로 확인하거나 개발 우회로가 켜져 있는지 본다. **`200`과 `404`가 구분되지 않으면 이 검증은 무의미하다.** `watch`가 200으로 나오는 것을 먼저 확인하고 나서 `nonexistent`의 404를 신뢰한다.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(admin)/admin/categories/[key]/layout.tsx" \
        "src/app/(admin)/admin/categories/[key]/page.tsx" \
        src/components/admin/category-tabs.tsx
git commit -m "$(cat <<'EOF'
D-246 카테고리 상세 레이아웃 + 개요 탭

존재 검증은 layout 한 곳에서만 한다 — 탭마다 걸면 새 탭에서 빠뜨린다
(D-096 이 그렇게 샜다).

requiresPhoto·userCodexCreation 은 읽기 전용이다. 카테고리의 성질이지
운영 판단이 아니다 (FR-07-A-13 · D-231).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 3: 하위 종류 탭

**Files:**
- Create: `src/app/(admin)/admin/categories/[key]/subtypes/page.tsx`

**Interfaces:**
- Consumes: `getAdminSubtypes()` (기존), `categoryLabelKo` (기존)
- Produces: `/admin/categories/[key]/subtypes`

- [ ] **Step 1: 페이지 작성**

```tsx
import { SubtypeManager } from "@/components/admin/subtype-manager";
import { categoryLabelKo } from "@/lib/category-label";
import { getAdminSubtypes } from "@/lib/data/admin";

/**
 * 카테고리 상세 — 하위 종류 (D-207 · D-246).
 *
 * ⚠️ **없는 것이 기본이다.** 제품군을 만들지 않으면 등록 폼은 지금과 같다 —
 * 캠핑처럼 속성 집합이 갈리는 카테고리에서만 만든다.
 *
 * ⚠️ **도감은 subtype 을 갖지 않는다** (D-207 결정 5). 도감 유일성을 subtype
 * 으로 쪼개면 같은 제품이 두 도감으로 갈린다.
 */
export default async function CategorySubtypesPage({
  params,
}: PageProps<"/admin/categories/[key]/subtypes">) {
  const { key } = await params;
  const [all, label] = await Promise.all([getAdminSubtypes(), categoryLabelKo(key)]);
  const mine = all.filter((s) => s.categoryKey === key);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        속성 집합이 서로 다른 제품군을 가릅니다 (D-207). 만들지 않으면 등록 폼은
        지금과 같습니다. 도감은 제품군으로 갈리지 않습니다.
      </p>
      <SubtypeManager categoryKey={key} categoryLabel={label} subtypes={mine} />
    </>
  );
}
```

- [ ] **Step 2: 검증**

```bash
pnpm typecheck
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/camping/subtypes
```

기대: typecheck 통과, `200`.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(admin)/admin/categories/[key]/subtypes/page.tsx"
git commit -m "$(cat <<'EOF'
D-246 카테고리 상세 — 하위 종류 탭

SubtypeManager 를 그대로 쓴다. props 가 이미 categoryKey 기반이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 4: 동적 속성 탭 + 붙이기 UI

**Files:**
- Create: `src/app/(admin)/admin/categories/[key]/attributes/page.tsx`
- Create: `src/components/admin/attribute-attach.tsx`

**Interfaces:**
- Consumes: `getAdminCategoryAttributes(key)` · `getUnattachedAttributes(key)` (Task 1), `setCategoryAttribute` (기존, upsert)
- Produces: `/admin/categories/[key]/attributes`, `AttributeAttach` 컴포넌트

- [ ] **Step 1: 붙이기 컴포넌트**

`src/components/admin/attribute-attach.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { setCategoryAttribute } from "@/lib/actions/admin";

/**
 * 이 카테고리에 아직 없는 속성을 **붙인다** (D-250).
 *
 * ## ⚠️ 왜 필요한가
 * `createAttributeDefinition` 은 정의만 만들고 `CategoryAttribute` 행은 만들지
 * 않는다. 그래서 시계 화면에서 속성을 만들어도 시계 목록에 안 나타났다.
 *
 * **새 서버 액션이 없다** — `setCategoryAttribute` 가 upsert 라 없으면 만든다.
 *
 * ⚠️ 붙일 때 `active: true` 만 준다. **`required` 는 기본값(false)** 으로 둔다 —
 * 필수는 등록 완주율에 직결되므로(D-039) 붙이는 것과 같은 동작으로 처리하지
 * 않는다. 붙인 뒤 표에서 따로 켠다.
 */
export function AttributeAttach({
  categoryKey,
  candidates,
}: {
  categoryKey: string;
  candidates: { key: string; label: string; type: string }[];
}) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        공통 속성 라이브러리의 모든 속성이 이 카테고리에 붙어 있습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="rounded-md border px-2 py-1.5 text-sm"
      >
        <option value="">속성 선택…</option>
        {candidates.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.key})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!pick || pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const res = await setCategoryAttribute({
              categoryKey,
              attributeKey: pick,
              active: true,
            });
            if (res && "error" in res && res.error) setError(String(res.error));
            else setPick("");
          })
        }
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {pending ? "붙이는 중…" : "붙이기"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
```

⚠️ **`setCategoryAttribute`의 실제 반환 형태를 확인하고 위 `res` 처리를 맞춘다.** `src/lib/actions/admin.ts`의 `fail()` 헬퍼가 무엇을 돌려주는지 읽어라 — 다른 폼 컴포넌트(`attribute-create-form.tsx`)가 같은 패턴을 쓰고 있으니 그것을 따른다.

- [ ] **Step 2: 속성 탭 페이지**

기존 `src/app/(admin)/admin/attributes/page.tsx`의 본문을 옮긴다. **카테고리 링크 줄(`all.map` 탭)은 뺀다** — 카테고리가 URL로 고정됐다.

```tsx
import { AdminActionButton } from "@/components/admin/action-button";
import { AttributeAttach } from "@/components/admin/attribute-attach";
import { AttributeCreateForm } from "@/components/admin/attribute-create-form";
import { AttributeOptions } from "@/components/admin/attribute-options";
import { SubtypeAttributes } from "@/components/admin/subtype-attributes";
import { Pill, Table, Td } from "@/components/admin/ui";
import { setCategoryAttribute } from "@/lib/actions/admin";
import { adminCategoryOptions } from "@/lib/admin-categories";
import {
  getAdminAttributeOptions,
  getAdminCategoryAttributes,
  getAdminSubtypeAttributes,
  getAdminSubtypes,
  getUnattachedAttributes,
} from "@/lib/data/admin";

const TYPE_LABEL: Record<string, string> = {
  text: "한 줄", textarea: "여러 줄", number: "숫자", select: "단일 선택",
  multiselect: "다중 선택", date: "날짜", boolean: "토글", url: "URL",
};

/**
 * 카테고리 상세 — 동적 속성 (A-02 흡수, D-246).
 *
 * ⚠️ **삭제가 없다. 비활성화만 있다** (D-036). 값은 보존되고 표시에서 빠진다.
 * ⚠️ **필수 개수에 상한이 없다** (D-039) — 지표로 관측할 뿐 막지 않는다.
 *
 * 3개 언어가 필요한 곳: 속성명 · `number` 단위 · `select`/`multiselect` 선택지.
 */
export default async function CategoryAttributesPage({
  params,
}: PageProps<"/admin/categories/[key]/attributes">) {
  const { key } = await params;
  const [scoped, subtypes, optionGroups, categories, candidates] = await Promise.all([
    getAdminCategoryAttributes(key),
    getAdminSubtypes(),
    getAdminAttributeOptions(),
    adminCategoryOptions(),
    getUnattachedAttributes(key),
  ]);
  const attrs = scoped[0]?.attrs ?? [];

  const mine = subtypes.filter((s) => s.categoryKey === key);
  const subtypeRows = await Promise.all(
    mine.map(async (s) => ({ ...s, attrs: await getAdminSubtypeAttributes(s.id) })),
  );
  const allDefs = attrs.map((a) => ({ key: a.key, label: a.label }));

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          삭제는 없고 비활성화만 됩니다 (D-036). 필수 개수에 상한이 없습니다 (D-039).
        </p>
        <AttributeCreateForm />
      </div>

      <Table head={["순서", "속성명 (ko)", "key", "타입", "필수", "매칭 키", "조치"]}>
        {attrs.map((a, i) => (
          <tr key={a.key}>
            <Td>{i + 1}</Td>
            <Td className="font-semibold">{a.label}</Td>
            <Td className="font-mono text-xs">{a.key}</Td>
            <Td>{TYPE_LABEL[a.type]}</Td>
            <Td>{a.required ? <Pill tone="warn">필수</Pill> : "—"}</Td>
            <Td>{a.matchingKey ? <Pill tone="sale">매칭 키</Pill> : "—"}</Td>
            <Td>
              <span className="flex items-start gap-2 whitespace-nowrap">
                <AdminActionButton
                  label={a.active ? "비활성화" : "활성화"}
                  confirm={a.active ? "기존 값은 보존되고 표시에서만 빠집니다." : undefined}
                  action={setCategoryAttribute.bind(null, {
                    categoryKey: key, attributeKey: a.key, active: !a.active,
                  })}
                />
                <AdminActionButton
                  label={a.required ? "선택으로" : "필수로"}
                  action={setCategoryAttribute.bind(null, {
                    categoryKey: key, attributeKey: a.key, required: !a.required,
                  })}
                />
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      {/*
        D-250 — 만들어도 안 붙던 구멍. `createAttributeDefinition` 은 정의만
        만들고 `CategoryAttribute` 행은 만들지 않는다
      */}
      <section className="mt-6 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-bold">이 카테고리에 없는 속성 붙이기</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          공통 속성 라이브러리(D-010)에 있지만 이 카테고리에 붙지 않은 속성입니다.
          붙이면 <b>선택 속성</b>으로 들어갑니다 — 필수는 표에서 따로 켭니다.
        </p>
        <AttributeAttach categoryKey={key} candidates={candidates} />
      </section>

      {subtypeRows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold">하위 종류 전용 속성</h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            위 공통 속성에 <b>더해서</b> 나옵니다. 종류를 고르지 않으면 공통만 나옵니다.
          </p>
          <div className="flex flex-col gap-4">
            {subtypeRows.map((s) => (
              <SubtypeAttributes
                key={s.id}
                subtypeId={s.id}
                label={s.labels.ko}
                active={s.active}
                attrs={s.attrs}
                candidates={allDefs}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold">선택지 관리 (select · multiselect)</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          ⚠️ <b>선택지 번역 누락이 가장 흔합니다</b>. 속성명만 번역하고 선택지를 빼면{" "}
          <b>일본어 화면에 한국어 옵션이 섞입니다.</b>
          <br />
          공통 속성이라도 <b>선택지는 카테고리마다 다를 수 있습니다</b> — 노출 범위로
          가립니다 (D-209).
        </p>
        <AttributeOptions groups={optionGroups} categories={categories} />
      </section>
    </>
  );
}
```

- [ ] **Step 3: 검증**

```bash
pnpm typecheck
pnpm lint
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/watch/attributes
```

기대: 전부 통과, `200`.

- [ ] **Step 4: 붙이기 동작 확인 (브라우저)**

1. `/admin/categories/watch/attributes` 열기
2. "속성 추가"로 새 속성 만들기 (`key`: `test_attach_check`, 타입 `한 줄`, ko/ja/en 라벨 채움)
3. **위 표에는 안 나타나는 것을 확인** — 이것이 D-250이 고치는 문제다
4. "이 카테고리에 없는 속성 붙이기"에서 방금 만든 것을 골라 "붙이기"
5. **표에 나타나는지 확인**
6. 확인 후 그 속성을 비활성화해 정리한다 (삭제는 없다 — D-036)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(admin)/admin/categories/[key]/attributes/page.tsx" \
        src/components/admin/attribute-attach.tsx
git commit -m "$(cat <<'EOF'
D-246·D-250 카테고리 상세 — 동적 속성 탭 + 붙이기 UI

createAttributeDefinition 은 정의만 만들고 CategoryAttribute 행은
만들지 않아서, 시계 화면에서 만든 속성이 시계에 안 나타났다. 제품군에는
붙이기가 있었고(SubtypeAttributes.candidates) 카테고리 본체에만 없었다.

새 서버 액션은 없다 — setCategoryAttribute 가 upsert 다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 5: 매칭 키 탭

**Files:**
- Create: `src/app/(admin)/admin/categories/[key]/matching-key/page.tsx`

**Interfaces:**
- Consumes: `getAdminMatchingKeys()` · `getMatchingKeyCandidates()` · `getAdminSubtypes()` (기존)
- Produces: `/admin/categories/[key]/matching-key`

- [ ] **Step 1: 페이지 작성**

```tsx
import { MatchingKeyEditor } from "@/components/admin/matching-key-editor";
import { Pill, Table, Td } from "@/components/admin/ui";
import { categoryLabelKo } from "@/lib/category-label";
import {
  getAdminMatchingKeys,
  getAdminSubtypes,
  getMatchingKeyCandidates,
} from "@/lib/data/admin";

/**
 * 카테고리 상세 — 매칭 키 (A-03 흡수, D-013 · D-246).
 *
 * ⚠️ **6개 카테고리가 하나의 매칭 방식을 공유할 수 없다.** 시계·신발·캠핑은
 * 강한 고유 ID 가 있고, 자전거는 복합 키가 필요하며 **옷은 사실상 없다**.
 *
 * ⚠️ **옷·자전거·데스크테리어는 초안이 검증되지 않았다** (D-034).
 *
 * 매칭 키로 쓸 수 있는 타입은 `text`/`number`/`select`/`date` 4종뿐이다 (D-041).
 *
 * ⚠️ 운동은 매칭 키가 **빈 배열**이고 그것이 정상이다 — 도감을 어드민이
 * 준비하기 때문이다 (D-227·D-228, `userCodexCreation=false`).
 */
export default async function CategoryMatchingKeyPage({
  params,
}: PageProps<"/admin/categories/[key]/matching-key">) {
  const { key } = await params;
  const [keys, candidates, subtypes, label] = await Promise.all([
    getAdminMatchingKeys(),
    getMatchingKeyCandidates(),
    getAdminSubtypes(),
    categoryLabelKo(key),
  ]);
  const mk = keys.find((m) => m.category === key);
  const mine = subtypes.filter((s) => s.categoryKey === key);

  return (
    <>
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>옷·자전거·데스크테리어는 초안이 검증되지 않았습니다</b> (D-034 조사 대기).
        조사 결과에 따라 값이 바뀝니다.
      </div>

      <Table head={["대상", "매칭 키", "검증", "조치"]}>
        <tr>
          <Td className="font-semibold">{label}</Td>
          <Td>
            {(mk?.keys.length ?? 0) > 0 ? (
              <span className="flex gap-1">
                {mk!.keys.map((k) => <Pill key={k} tone="sale">{k}</Pill>)}
              </span>
            ) : (
              <span className="text-muted-foreground">없음 — 도감 자동 매칭 불가</span>
            )}
          </Td>
          <Td>{mk?.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}</Td>
          <Td>
            <MatchingKeyEditor
              categoryKey={key}
              categoryLabel={label}
              current={mk?.keys ?? []}
              candidates={candidates}
            />
          </Td>
        </tr>

        {/*
          D-207 — 제품군 전용. 없으면 카테고리 것으로 떨어지므로 "카테고리
          기본"으로 표시한다. 텐트만 품번을 쓰고 나머지는 카테고리 규칙을
          따르는 상태가 정상이다
        */}
        {mine.map((s) => (
          <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
            <Td className="pl-6 text-sm">↳ <b>{s.labels.ko}</b></Td>
            <Td>
              {s.matchingKeys.length > 0 ? (
                <span className="flex gap-1">
                  {s.matchingKeys.map((k) => <Pill key={k} tone="sale">{k}</Pill>)}
                </span>
              ) : (
                <span className="text-muted-foreground">— 카테고리 기본을 따름</span>
              )}
            </Td>
            <Td><Pill tone="warn">미검증</Pill></Td>
            <Td>
              <MatchingKeyEditor
                categoryKey={key}
                categoryLabel={`${label} · ${s.labels.ko}`}
                current={s.matchingKeys}
                candidates={candidates}
                subtypeId={s.id}
              />
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        매칭 키를 바꾸면 기존 도감 연결의 의미가 달라지므로 변경 이력을 남깁니다.
        매칭 키가 없는 카테고리는 도감 자동 연결이 되지 않습니다 (D-032).
      </p>
    </>
  );
}
```

- [ ] **Step 2: 검증**

```bash
pnpm typecheck
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/watch/matching-key
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories/workout/matching-key
```

기대: 둘 다 `200`. **`workout`은 매칭 키가 빈 배열이므로 "없음 — 도감 자동 매칭 불가"가 떠야 하고, 그것이 정상이다** (D-227·D-228).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(admin)/admin/categories/[key]/matching-key/page.tsx"
git commit -m "$(cat <<'EOF'
D-246 카테고리 상세 — 매칭 키 탭 (A-03 흡수)

카테고리 1행 + 제품군 행. MatchingKeyEditor 를 그대로 쓴다.

운동은 매칭 키가 빈 배열이고 그것이 정상이다 — 도감을 어드민이
준비한다 (D-227·D-228).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 6: 도감 탭

**Files:**
- Create: `src/app/(admin)/admin/categories/[key]/codex/page.tsx`

**Interfaces:**
- Consumes: `getAdminCodexPage({ ...params, category: key })` · `getCodexKeyForms()` (기존), `parseListParams` (기존)
- Produces: `/admin/categories/[key]/codex`

- [ ] **Step 1: 페이지 작성**

```tsx
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/action-button";
import { CodexCreateForm } from "@/components/admin/codex-create-form";
import { CodexEditForm } from "@/components/admin/codex-edit-form";
import { CodexResearchPanel } from "@/components/admin/codex-research-panel";
import { AdminListControls } from "@/components/admin/list-controls";
import { Pill, Table, Td } from "@/components/admin/ui";
import { setCodexVerification } from "@/lib/actions/admin";
import { parseListParams } from "@/lib/admin-list-params";
import { botEnabled, claudeConfigured } from "@/lib/bot/guard";
import { getAdminCodexPage, getCodexKeyForms } from "@/lib/data/admin";

/**
 * 카테고리 상세 — 도감 (A-04 카테고리분 흡수, D-246 · D-248).
 *
 * ⚠️ **운영자가 직접 등록한 도감은 바로 `검증됨`이다** (FR-04-A-02). 유저
 * 등록분은 `미검증`으로 시작한다 (D-033).
 *
 * ⚠️ **카테고리 셀렉트를 주지 않는다.** `AdminListControls.categories` 는
 * optional 이다 — 카테고리가 URL 로 고정된 화면에서 셀렉트를 또 주면 고른 값과
 * URL 이 어긋난다.
 *
 * 도감 명칭은 원문 1개 고정이고 번역하지 않는다 (D-009).
 */
export default async function CategoryCodexPage({
  params,
  searchParams,
}: PageProps<"/admin/categories/[key]/codex">) {
  const { key } = await params;
  const listParams = parseListParams(await searchParams);
  const [list, keyForms] = await Promise.all([
    // ⚠️ URL 의 카테고리가 이긴다 — 쿼리의 category 는 무시한다
    getAdminCodexPage({ ...listParams, category: key }),
    getCodexKeyForms(),
  ]);

  /*
    자료 조사는 **로컬 전용**이다 (D-146·D-185) — 프로덕션 런타임에 `claude`
    바이너리가 없다. 숨기지 않고 이유를 붙여 비활성으로 둔다
  */
  const researchEnabled = botEnabled() && claudeConfigured();
  const researchReason = !botEnabled()
    ? "자료 조사는 로컬 개발 모드에서만 동작합니다"
    : "로컬 claude CLI 를 찾을 수 없습니다 (CLAUDE_CLI_PATH)";

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          운영자가 직접 등록한 도감은 바로 검증됨입니다 (FR-04-A-02).
        </p>
        <CodexCreateForm forms={keyForms} />
      </div>

      <div className="mb-4">
        <CodexResearchPanel
          forms={keyForms}
          enabled={researchEnabled}
          disabledReason={researchReason}
        />
      </div>

      {/* categories 를 넘기지 않는다 — 카테고리는 URL 로 고정됐다 */}
      <AdminListControls
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
      />

      <Table head={["명칭 (원문)", "고유값", "검증", "보유자", "조치"]}>
        {list.rows.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.displayName}</Td>
            <Td className="font-mono text-xs">{c.uniqueId}</Td>
            <Td>{c.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}</Td>
            <Td>{c.ownerCount}</Td>
            <Td>
              <span className="flex items-start gap-2 whitespace-nowrap">
                <AdminActionButton
                  label={c.verified ? "미검증으로" : "검증됨으로"}
                  tone={c.verified ? "default" : "primary"}
                  confirm={c.verified ? "검증 일시와 검증자 기록이 지워집니다." : undefined}
                  action={setCodexVerification.bind(null, c.id, !c.verified)}
                />
                <CodexEditForm
                  codexId={c.id}
                  displayName={c.displayName}
                  uniqueId={c.uniqueId}
                  verified={c.verified}
                />
                <Link href="/admin/codex/aliases"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent">alias</Link>
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        도감 명칭은 원문 1개 고정이며 번역하지 않습니다 (D-009). 설명은 검증본만
        3개 언어입니다 (FR-07-A-05).
      </p>
    </>
  );
}
```

⚠️ **`CodexCreateForm`이 카테고리를 폼 안에서 고르는 구조라면**, `forms={keyForms}`를 이 카테고리 것만 남겨 넘기거나 컴포넌트에 `fixedCategory` prop을 더한다. `src/components/admin/codex-create-form.tsx`를 먼저 읽고 결정한다 — **읽지 않고 추측하지 말 것.**

- [ ] **Step 2: 검증**

```bash
pnpm typecheck
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3002/admin/categories/watch/codex"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3002/admin/categories/watch/codex?q=rolex&page=1&size=10"
```

기대: 둘 다 `200`.

- [ ] **Step 3: 브라우저 확인**

1. 도감 탭에 **카테고리 셀렉트가 없는지** 확인
2. 검색어 입력 → 결과가 **이 카테고리로만** 좁혀지는지 확인
3. 페이지 크기 10으로 바꾸고 2페이지 이동 → URL에 `?size=10&page=2`, 목록이 바뀌는지 확인

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(admin)/admin/categories/[key]/codex/page.tsx"
git commit -m "$(cat <<'EOF'
D-246·D-248 카테고리 상세 — 도감 탭

getAdminCodexPage 가 이미 category 스코프를 지원해서 조회는 손댈 게
없었다. URL 의 카테고리가 이기고 쿼리의 category 는 무시한다.

AdminListControls.categories 를 넘기지 않아 카테고리 셀렉트가 사라진다
— URL 로 고정된 값을 셀렉트로 또 주면 둘이 어긋난다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 7: A-01 목록 링크 + revalidatePath

**Files:**
- Modify: `src/app/(admin)/admin/categories/page.tsx`
- Modify: `src/lib/actions/admin.ts`

- [ ] **Step 1: A-01 목록에 상세 링크**

카테고리명 `<Td>`를 링크로 바꾸고, `SubtypeManager` 컬럼은 **개수 + 링크**로 대체한다 (편집은 상세 탭으로 갔다).

```tsx
<Td className="font-semibold">
  <Link
    href={`/admin/categories/${c.slug}`}
    className="underline underline-offset-2 hover:text-primary"
  >
    {label.get(c.slug) ?? c.slug}
  </Link>
</Td>
```

`import Link from "next/link";`를 추가하고, `SubtypeManager` import와 `getAdminSubtypes()` 호출은 제거한다. 하위 종류 컬럼:

```tsx
<Td>
  <Link
    href={`/admin/categories/${c.slug}/subtypes`}
    className="text-xs underline underline-offset-2 hover:text-primary"
  >
    관리
  </Link>
</Td>
```

- [ ] **Step 2: `revalidatePath` 대상 추가**

`src/lib/actions/admin.ts`에서 카테고리·속성·매칭 키·제품군·도감을 건드리는 액션의 `revalidatePath` 호출을 찾는다:

```bash
grep -n 'revalidatePath("/admin/\(categories\|attributes\|matching-keys\|codex\)' src/lib/actions/admin.ts
```

각 지점에 새 경로를 **추가**한다 (기존 줄을 지우지 않는다 — 전역 A-04가 남아 있다). 예:

```ts
revalidatePath("/admin/categories");
revalidatePath(`/admin/categories/${input.categoryKey}`);
revalidatePath(`/admin/categories/${input.categoryKey}/attributes`);
```

⚠️ 액션마다 카테고리 키를 담은 변수명이 다르다(`input.categoryKey` · `categoryKey` · 조회해온 `category.key`). **각 함수 본문을 읽고 그 스코프에 실제로 있는 이름을 쓴다.** 키를 알 수 없는 액션(도감 ID만 받는 `setCodexVerification` 등)은 `revalidatePath("/admin/categories", "layout")`로 하위 전체를 무효화한다.

- [ ] **Step 3: 검증**

```bash
pnpm typecheck
pnpm lint
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/categories
```

기대: 통과, `200`.

- [ ] **Step 4: 브라우저 확인**

1. A-01 목록에서 카테고리명 클릭 → 상세 개요로 이동
2. 개요에서 "비활성화" → 목록으로 돌아갔을 때 상태가 바뀌어 있는지 (revalidate 확인)
3. 되돌린다

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(admin)/admin/categories/page.tsx" src/lib/actions/admin.ts
git commit -m "$(cat <<'EOF'
D-246 A-01 목록에서 상세로 진입 + revalidatePath 확장

기존 revalidatePath 줄은 지우지 않는다 — 전역 A-04 가 남아 있다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 8: 옛 경로 redirect + 네비게이션 정리

**Files:**
- Modify: `src/app/(admin)/admin/attributes/page.tsx`
- Modify: `src/app/(admin)/admin/matching-keys/page.tsx`
- Modify: `src/app/(admin)/admin/codex/page.tsx`
- Modify: `src/components/layout/admin-nav.tsx`

- [ ] **Step 1: A-02 → redirect**

`src/app/(admin)/admin/attributes/page.tsx` **전체를 교체**한다.

```tsx
import { redirect } from "next/navigation";

/**
 * A-02 는 카테고리 상세 `동적 속성` 탭으로 흡수됐다 (D-246).
 *
 * ⚠️ **삭제하지 않고 redirect 로 남긴다.** 기획 문서·북마크·과거 커밋
 * 메시지가 이 경로를 가리킨다. 지우면 404 만 남고 어디로 가야 하는지
 * 알 수 없다.
 *
 * ⚠️ A-02 번호는 **회수하되 재사용하지 않는다** (D-220) — 재사용하면
 * 문서·화면·로그가 서로 다른 것을 가리킨다.
 */
export default function AdminAttributesRedirect() {
  redirect("/admin/categories");
}
```

- [ ] **Step 2: A-03 → redirect**

`src/app/(admin)/admin/matching-keys/page.tsx` 전체를 교체한다. 위와 같은 형태, 주석의 탭 이름만 `매칭 키`로.

```tsx
import { redirect } from "next/navigation";

/**
 * A-03 은 카테고리 상세 `매칭 키` 탭으로 흡수됐다 (D-246).
 *
 * ⚠️ **삭제하지 않고 redirect 로 남긴다.** 기획 문서·북마크·과거 커밋
 * 메시지가 이 경로를 가리킨다.
 *
 * ⚠️ A-03 번호는 회수하되 재사용하지 않는다 (D-220).
 */
export default function AdminMatchingKeysRedirect() {
  redirect("/admin/categories");
}
```

- [ ] **Step 3: A-04에서 등록 폼·자료조사 패널 제거**

`src/app/(admin)/admin/codex/page.tsx`에서:
- `action={<CodexCreateForm forms={keyForms} />}` 제거
- `<CodexResearchPanel .../>` 블록 제거
- 쓰지 않게 된 import(`CodexCreateForm` · `CodexResearchPanel` · `botEnabled` · `claudeConfigured`) 제거
- `getCodexKeyForms()` 호출이 더 이상 쓰이지 않으면 제거
- 제목을 `도감 전체 검색`으로, `desc`에 안내 추가:

```tsx
desc="전 카테고리 도감을 검색합니다. 등록·자료 조사는 카테고리 상세의 도감 탭에서 합니다 (D-248)."
```

⚠️ `AdminListControls`의 `categories` prop은 **여기서는 그대로 둔다** — 전역 화면이므로 카테고리 필터가 있어야 한다.

- [ ] **Step 4: 네비게이션**

`src/components/layout/admin-nav.tsx`의 `SECTIONS`에서:
- `아이템` 그룹에서 `{ href: "/admin/attributes", label: "동적 속성 관리", id: "A-02" }` 제거
- `도감` 그룹에서 `{ href: "/admin/matching-keys", label: "매칭 키 정의", id: "A-03" }` 제거
- `도감 목록` → `도감 전체 검색`으로 라벨 변경
- 상단 주석의 화면 수(`어드민 화면 17개 + 로컬 전용 1개`)를 실제에 맞게 고치고, A-02·A-03이 A-01 상세로 흡수됐고 번호는 재사용하지 않는다는 한 줄을 남긴다

- [ ] **Step 5: 검증**

```bash
pnpm typecheck
pnpm lint
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3002/admin/attributes
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3002/admin/matching-keys
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/codex
```

기대: 앞의 둘은 `307`(Next `redirect()`의 기본) 또는 `308`이고 `location`이 `/admin/categories`. 마지막은 `200`.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(admin)/admin/attributes/page.tsx" \
        "src/app/(admin)/admin/matching-keys/page.tsx" \
        "src/app/(admin)/admin/codex/page.tsx" \
        src/components/layout/admin-nav.tsx
git commit -m "$(cat <<'EOF'
D-246·D-248·D-249 A-02·A-03 흡수, A-04 는 전체 검색으로

옛 경로는 삭제하지 않고 redirect 로 남긴다 — 기획 문서·북마크가
가리키고 있어서 지우면 404 만 남는다.

A-02·A-03 번호는 회수하되 재사용하지 않는다 (D-220).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Task 9: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 정적 검사**

```bash
cd /Users/pax/Documents/GitHub/my-heritage-web
pnpm lint && pnpm typecheck
```

기대: 둘 다 통과.

- [ ] **Step 2: 전 경로 실제 요청**

```bash
for p in \
  /admin/categories \
  /admin/categories/watch \
  /admin/categories/watch/subtypes \
  /admin/categories/watch/attributes \
  /admin/categories/watch/matching-key \
  /admin/categories/watch/codex \
  /admin/categories/workout \
  /admin/categories/workout/matching-key \
  /admin/categories/nonexistent \
  /admin/attributes \
  /admin/matching-keys \
  /admin/codex ; do
  printf "%-45s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3002$p"
done
```

기대:

| 경로 | 기대 |
|---|---|
| `/admin/categories` ~ `/watch/codex` | `200` |
| `/admin/categories/workout` · `/workout/matching-key` | `200` |
| `/admin/categories/nonexistent` | `404` |
| `/admin/attributes` · `/admin/matching-keys` | `307` 또는 `308` |
| `/admin/codex` | `200` |

⚠️ **전부 404가 나오면 인가 가드에 막힌 것이다** (D-102 — 비인가는 404). 그때는 브라우저 세션으로 확인한다. `/admin/categories`가 200인 것을 먼저 확인하고 나서 `nonexistent`의 404를 신뢰한다.

- [ ] **Step 3: `workout` 회귀 확인**

`workout`은 매칭 키 빈 배열 + `userCodexCreation=false`인 유일한 카테고리다. 카테고리 축 화면이 깨지는 곳이 항상 여기였다 (D-173·D-182·D-185).

브라우저로 `/admin/categories/workout` 다섯 탭을 모두 연다:

| 탭 | 기대 |
|---|---|
| 개요 | 라벨이 `운동`(빈칸도 `workout`도 아님), `유저 등록이 도감 생성` = **생성 안 함**, `판매 불가` |
| 하위 종류 | 비어 있어도 렌더됨 |
| 동적 속성 | 속성 목록이 뜸. `model` 라벨이 **`루틴명`** — 전역 `모델명`이 아니어야 한다 (D-168 override, 값은 D-243·D-244 용어 정리 이후 기준) |
| 매칭 키 | `없음 — 도감 자동 매칭 불가`. **이것이 정상이다** |
| 도감 | 목록이 뜸 |

- [ ] **Step 4: 개발 서버 로그 확인**

브라우저로 훑는 동안 `pnpm dev` 콘솔에 에러·경고가 없는지 본다. 특히 `"use client"` 경계 오류 — 빌드·typecheck가 못 잡는 부류다.

---

## Task 10: planning 저장소 동기화

**Files (저장소가 다르다 — `/Users/pax/Documents/GitHub/my-heritage-planning`):**
- Modify: `projects/item-catalog/06-decisions.md`
- Modify: `projects/codex/06-decisions.md`
- Modify: `projects/myroom-service/02-planning-spec.md`
- Modify: `projects/myroom-service/10-frontend-spec.md`
- Modify: `projects/myroom-service/dev-sync-log.md`
- Modify: `projects/myroom-service/07-status.md`
- Modify: `projects/portfolio.md`

⚠️ **D-넘버는 프로젝트 횡단 전역이다.** 현재 최대는 D-245(`item-catalog`). 착수 전 전 프로젝트를 다시 grep해서 충돌을 확인한다:

```bash
cd /Users/pax/Documents/GitHub/my-heritage-planning
grep -rhoE "^### D-[0-9]+" projects/ | sort -u -t- -k2 -n | tail -5
```

- [ ] **Step 1: `item-catalog/06-decisions.md`에 D-246·247·249·250 추가**

파일 끝에 `### D-NNN: 제목` 형식으로 append한다. 각 결정은 **선택지 + 근거**를 포함한다 (CLAUDE.md 자동 업데이트 규칙).

- **D-246** 어드민 카테고리 상세 신설 — 카테고리를 1급 객체로. A-02·A-03 흡수. 선택지: ①평면 유지 ②상세에 요약만 ③흡수(채택). 근거: 카테고리가 작업 단위인데 화면이 기능 단위로 잘려 4개 화면을 오갔다
- **D-247** 흡수 판정 기준 — 카테고리 축인 것만 흡수. A-11 브랜드는 N:M이라 읽기 전용, A-05~A-07 큐는 전 카테고리 횡단이 목적이라 전역 유지
- **D-249** 옛 경로는 redirect로 남긴다 — 삭제 시 404만 남아 이동 경로를 알 수 없다. A-02·A-03 번호는 회수하되 재사용 금지 (D-220)
- **D-250** 속성 붙이기 UI 신설 — `createAttributeDefinition`이 `CategoryAttribute`를 만들지 않아 만들어도 안 붙던 구멍. `setCategoryAttribute`가 upsert라 새 액션 없음. 함께: `requiresPhoto`·`userCodexCreation`은 카테고리의 성질이라 토글하지 않는다 (FR-07-A-13 · D-231)

- [ ] **Step 2: `codex/06-decisions.md`에 D-248 추가**

- **D-248** A-04 역할 축소 — 도감 등록·자료조사는 카테고리 상세로, 전역 A-04는 검색 용도(`도감 전체 검색`). 근거: 상세에서는 카테고리가 이미 정해져 있어 폼의 선택 단계가 사라진다. 전 카테고리를 훑는 진입점은 남겨야 하므로 화면 자체는 유지

- [ ] **Step 3: `myroom-service/02-planning-spec.md` §6 어드민 화면 목록**

A-02·A-03 행을 **"A-01 상세로 흡수 (D-246). 번호 재사용 금지"** 로 갱신하고, A-01 행에 상세 탭 5개를 기재한다. A-04 명칭을 `도감 전체 검색`으로.

- [ ] **Step 4: `myroom-service/10-frontend-spec.md` 라우팅 매트릭스**

새 경로 6개 + redirect 2개를 추가한다. 이 파일은 **구조 SoT가 코드**이므로(D-094) 실제 만든 경로를 그대로 옮긴다 — 추측해서 쓰지 않는다.

- [ ] **Step 5: `myroom-service/dev-sync-log.md`에 블록 prepend**

CLAUDE.md의 형식을 그대로 따른다. 항상 최신이 위로.

```
## 2026-08-29 — 어드민 카테고리 상세 신설, A-02·A-03 흡수

**영향 받은 feature**: A-01, A-02, A-03, A-04

**변경 내용**:
- A-01: 카테고리 상세 신설 — 개요/하위종류/속성/매칭키/도감 5탭 (D-246)
- A-02: A-01 상세 `동적 속성` 탭으로 흡수, 옛 경로는 redirect (D-246·D-249)
- A-03: A-01 상세 `매칭 키` 탭으로 흡수, 옛 경로는 redirect (D-246·D-249)
- A-04: 등록·자료조사는 상세로 이전, 전역은 `도감 전체 검색` (D-248)
- A-01 상세 속성 탭에 붙이기 UI 신설 (D-250)

**dev-spec 동기화 필요 항목**:
- A-01 상세 라우트 6개 + redirect 2개 → 라우팅 매트릭스 반영
- `requiresPhoto`·`userCodexCreation` 읽기 전용 확정 → 어드민 토글 없음을 명시
- 속성 붙이기: 새 서버 액션 없음 (`setCategoryAttribute` upsert 재사용)

**참조 자료**:
- 설계: `my-heritage-web/docs/superpowers/specs/2026-08-29-admin-category-detail-design.md`
- 계획: `my-heritage-web/docs/superpowers/plans/2026-08-29-admin-category-detail.md`
```

- [ ] **Step 6: `07-status.md` · `portfolio.md` 갱신**

변경 이력 한 줄씩.

- [ ] **Step 7: 커밋 (planning 저장소)**

⚠️ **`gchat-notify.yml`이 커밋 메시지 전문을 Google Chat으로 보낸다.** 멘션·외부 발송용 문구를 넣지 않는다.

```bash
cd /Users/pax/Documents/GitHub/my-heritage-planning
git add projects/
git commit -m "$(cat <<'EOF'
D-246~D-250 어드민 카테고리 상세 — A-02·A-03 을 A-01 하위로 흡수

카테고리가 작업 단위인데 화면은 기능 단위로 잘려 있어서, 시계 하나를
손보려면 화면 4개를 오갔다. 카테고리 축으로 접히는 것만 흡수한다 —
브랜드는 N:M 이라 읽기 전용, 검증/병합/alias 큐는 횡단이 목적이라 전역.

D-250 은 만들어도 안 붙던 구멍이다. createAttributeDefinition 이
CategoryAttribute 를 만들지 않아 시계 화면에서 만든 속성이 시계에
나타나지 않았다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013o3Hkx6xv1gm3BGLogBJNZ
EOF
)"
```

---

## Self-Review 결과

**1. Spec coverage**

| Spec 섹션 | 태스크 |
|---|---|
| §3 라우트 구조 | Task 2·3·4·5·6 |
| §3 DB 존재 검증 | Task 2 Step 2 |
| §4 개요 탭 | Task 2 Step 3 |
| §4 requiresPhoto·userCodexCreation 읽기 전용 | Task 2 Step 3 |
| §4 속성 붙이기 (D-250) | Task 4 |
| §4 도감 카테고리 셀렉트 숨김 | Task 6 Step 1 |
| §4 도감 등록·자료조사 이전 | Task 6, Task 8 Step 3 |
| §5 데이터 레이어 | Task 1 |
| §5 revalidatePath | Task 7 Step 2 |
| §6 네비게이션·redirect | Task 8 |
| §7 검증 | Task 9 |
| §8 planning 동기화 | Task 10 |
| §9 하지 않는 것 | 어느 태스크에도 없음 (의도됨) |

누락 없음.

**2. Placeholder scan**

`TBD`·`TODO` 없음. 두 곳에 **의도적 지시**가 있고 둘 다 "읽고 결정하라"까지 명시했다:
- Task 4 Step 1 — `setCategoryAttribute` 반환 형태를 읽고 `res` 처리를 맞출 것
- Task 6 Step 1 — `CodexCreateForm`의 카테고리 입력 구조를 읽고 결정할 것

추측 금지를 명시했으므로 placeholder가 아니다.

**3. Type consistency**

- `getAdminCategoryDetail` 반환 필드명이 Task 2 Step 3의 사용처와 일치 (`slug`·`itemCount`·`codexCount`·`unverifiedCodexCount`·`subtypeCount`·`attributeCount`·`brands`·`matchingKeys`·`requiresPhoto`·`userCodexCreation`)
- `getUnattachedAttributes` 반환 `{ key, label, type }`이 `AttributeAttach`의 `candidates` prop과 일치
- `getAdminCategoryAttributes(key?)`가 `{ slug, attrs }[]` 배열을 유지 → Task 4가 `scoped[0]?.attrs`로 받음
- `CategoryTabs`의 `slug` prop이 Task 2 layout의 `<CategoryTabs slug={key} />`와 일치
- `verification` enum(`UNVERIFIED`)을 Task 1에서 사용 — `verified` 불리언 아님
