# 카탈로그 스코프 — 브랜드·도감을 종류 단위로 매핑

- 작성일: 2026-08-29
- 대상: `my-heritage-web` (구현) · `my-heritage-planning` (정책 SoT)
- 영향 모델: `CodexItem` · `CodexMatchKey` · `Brand`(N:M 조인) · `Item` · `CategorySubtype`
- 의사결정 예정: D-252 ~ D-256

## 1. 문제

`CategorySubtype`(종류)이 등록 폼의 속성 집합만 가른다. **브랜드와 도감은 여전히 카테고리 단위**라 두 가지가 틀어진다.

| 증상 | 지금 |
|---|---|
| 안장 등록 폼에 시마노가 브랜드 후보로 뜬다 | `Brand ↔ Category` N:M 뿐이라 자전거에 연결된 40개가 전 부품에 노출 |
| 휠셋과 완성차가 같은 동일성 규칙을 쓴다 | 매칭 키가 카테고리 단위 — 둘 다 `brand+model+year`. 휠셋에 연식은 대체로 무의미 |
| 자전거 도감 105건이 전부 완성차인데 부품 도감을 넣을 자리가 없다 | `@@unique([categoryId, normalizedKey])` — 완성차와 부품이 한 이름 공간 |

## 2. 종류를 필수로 만든다 — 이것이 전제다

D-207 결정 5는 **"도감은 subtype 을 갖지 않는다"** 를 명시적으로 탈락시켰다. 근거는:

> 도감 유일성을 subtype 으로 쪼개면 같은 제품이 subtype 지정에 따라 두 도감으로 갈린다 — 한 유저는 "텐트"로 고르고 다른 유저는 안 고르면 `Snow Peak TP-670` 이 둘이 된다.

**이 논거는 subtype 이 선택이라는 전제 위에 있다.** 현재 `resolveSubtypeId` 는 값이 없으면 조용히 `null` 을 반환한다 — 정확히 그 상태다.

**종류가 있는 카테고리에서 종류를 필수로 만들면 그 실패 모드가 사라진다.** 그래서 이 설계는 D-207 을 뒤집는 것이 아니라 **그 전제를 제거한 뒤 재판정**하는 것이다.

⚠️ 대가: 등록 단계가 하나 늘고, 종류가 애매한 물건(텐트+타프 일체형)에서 유저가 멈춘다.

## 3. 핵심 개념 — 스코프는 두 방향으로 쓰인다

설계의 중심. **도감과 브랜드는 scope 를 반대로 쓴다.**

| | scope 의미 | 이유 |
|---|---|---|
| **도감** | **배타적** — 정확히 한 scope | 유일성 판정이다. 두 scope 에 같은 도감이 있으면 그게 곧 갈라짐 |
| **브랜드** | **포함적** — 카테고리 공통 ∪ 종류 전용 | 선택지 목록이다. 좁히면 유저가 막힌다 |

브랜드를 포함적으로 두면 `CategoryAttribute`(공통 + 제품군 전용 합집합)·`AttributeOption`(D-209: `null` = 전역, 값 = 그 카테고리만)과 **같은 패턴**이 된다. 새 개념이 아니다.

## 4. 스키마

### 4-1. `scopeId` 는 DB 가 계산한다

```prisma
model CodexItem {
  categoryId String              // 항상 — 카테고리 필터·진열·sitemap 이 그대로 동작
  subtypeId  String?             // 종류 있는 카테고리면 채운다
  subtype    CategorySubtype? @relation(fields: [subtypeId], references: [id], onDelete: Restrict)
  /// GENERATED ALWAYS AS (COALESCE("subtypeId", "categoryId")) STORED
  scopeId    String
  @@unique([scopeId, normalizedKey])   // 종전 [categoryId, normalizedKey] 대체
}

model CodexMatchKey {
  categoryId String              // 유지
  subtypeId  String?             // CodexItem 의 사본
  scopeId    String              // GENERATED
  @@unique([scopeId, value])     // 종전 [categoryId, value] 대체
}

model BrandScope {               // 암묵 조인 `_BrandToCategory` → 명시 조인
  id         String  @id @default(cuid())
  brandId    String
  brand      Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  subtypeId  String?            // null = 이 카테고리 전 종류 공통
  subtype    CategorySubtype? @relation(fields: [subtypeId], references: [id], onDelete: Cascade)
  scopeId    String             // GENERATED
  @@unique([brandId, scopeId])
  @@index([scopeId])
}
```

### ⚠️ 왜 생성 컬럼인가 — 그냥 3열 유니크로는 뚫린다

`@@unique([categoryId, subtypeId, normalizedKey])` 로 두면 **`subtypeId` 가 `NULL` 일 때 중복이 통과한다.** Postgres 에서 `NULL` 은 서로 다른 값이라 유니크 제약에 걸리지 않기 때문이다.

로컬 PG 16.14 에서 검증했다:

```sql
CREATE TEMP TABLE t (a text, b text,
  s text GENERATED ALWAYS AS (COALESCE(b,a)) STORED, k text);
CREATE UNIQUE INDEX ON t (s, k);
INSERT INTO t (a,b,k) VALUES ('cat1', NULL,   'x');   -- OK
INSERT INTO t (a,b,k) VALUES ('cat1', 'sub1', 'x');   -- OK  (scope 다름)
INSERT INTO t (a,b,k) VALUES ('cat1', NULL,   'x');   -- ERROR: duplicate key ✓
```

생성 컬럼은 **앱이 틀릴 수 없고**(DB 가 계산), **FK 무결성도 유지**된다(`categoryId`·`subtypeId` 각각 진짜 FK).

Prisma 에서는 읽기 전용 필드로 매핑하고, 컬럼 생성은 **원시 SQL 마이그레이션**으로 한다.

### 4-2. 손대지 않는 것

`CategoryAttribute` 와 `MatchingKeyDefinition` 은 이미 `categoryId?` XOR `subtypeId?` 로 동작한다. **스키마 변경 없이** 종류별 행을 채우기만 하면 된다 — 완성차 `{brand,model,year}`, 휠셋 `{brand,model}`.

두 표현(XOR 컬럼 / `scopeId`)이 한 스키마에 공존하는 것은 의도적이다. 셋의 의미가 다르기 때문이다:
- `CategoryAttribute` — 공통 행과 종류 행이 **동시에 유효**(합집합)
- `CodexItem` — 정확히 한 scope(**배타**)
- `BrandScope` — 공통과 전용이 **동시에 유효**(합집합)

통합은 별건으로 남긴다 (§8).

## 5. 조회 규칙

```
도감 매칭   scopeId == (item.subtypeId ?? item.categoryId)     정확히 일치
브랜드 목록 scopeId IN [item.categoryId, item.subtypeId].filter(Boolean)
```

⚠️ **브랜드 목록의 `null` 을 그대로 넘기지 말 것.** `scopeId IN ('cat1', NULL)` 은
SQL 에서 `NULL` 항목이 **절대 매칭되지 않는다**(그리고 `NOT IN` 이면 전체가 빈다).
종류 없는 카테고리에서는 배열이 원소 1개가 되도록 **넘기기 전에 걸러낸다.**

### 바뀌는 호출부

**브랜드** (`categories: { some / none / connect }` → `scopes`)

| 파일 | 지점 |
|---|---|
| `src/lib/brand-master.ts:58` | `resolveMasterBrand` — 카테고리 스코프 조회 |
| `src/app/api/brands/route.ts:24` | 등록 폼 브랜드 목록 — **합집합으로 바뀌는 곳** |
| `src/lib/data/admin.ts:243` | `getAdminBrands` — `categories` select |
| `src/lib/data/admin.ts:301` | `getUnlinkedBrands` (D-251) |
| `src/lib/actions/admin.ts:1438` | `setBrandCategory` (D-251) — 종류 인자 추가 |
| `src/lib/actions/admin.ts:1505·1508` | 브랜드 요청 승인 `connect` |
| `src/lib/actions/admin.ts:2002` | `createBrand` `connect` |

**도감** (`categoryId` → `scopeId`)

| 파일 | 지점 |
|---|---|
| `src/lib/codex-insert.ts:89` | 중복 검사 |
| `src/lib/codex-insert.ts:108` | 매칭 키 선점 검사 |
| `src/lib/codex-match-key.ts:51` | 매칭 조회 |
| `src/lib/codex-match-key.ts:87` | 매칭 키 upsert |
| `src/lib/exercise-insert.ts:178` | 운동 — 종류 0개라 `scopeId == categoryId`, **동작 불변** |
| `src/lib/actions/admin-exercise.ts:391` | 운동 충돌 검사 — 동작 불변 |

⚠️ **운동은 종류가 없어 이 변경의 영향을 받지 않는다.** `scopeId` 가 항상 `categoryId` 와 같다. 회귀 확인의 기준선으로 쓴다.

## 6. 자전거 — '완성차' 종류 신설

현재 종류 7개가 전부 부품(프레임·구동계·휠셋·핸들바·안장·브레이크·타이어)이라 **완성차가 고를 종류가 없다.** 종류를 필수로 만들면 완성차가 등록되지 않는다.

`완성차` 종류를 추가해 8개로 만든다. 기존 도감 105건은 **전부 완성차**(`Trek Domane SL 6`·`Specialized Tarmac SL7`·`Canyon Ultimate CF SL` …)이므로 **기계적 일괄 이관**이 가능하다.

부수 효과로 매칭 키가 종류별로 갈린다:

| 종류 | 매칭 키 | 근거 |
|---|---|---|
| 완성차 | `{brand, model, year}` | 종전 자전거 규칙 유지 |
| 휠셋·안장·핸들바 | `{brand, model}` | 연식이 제품 동일성을 가르지 않는다 |
| 타이어 | `{brand, model, tireSize}` | 같은 모델도 규격이 다르면 다른 제품 |

⚠️ 위 표의 완성차 외 값은 **초안이다.** D-034 가 자전거 매칭 키를 "미검증"으로 두고 있으므로, 부품 키는 PM 확정 전까지 **카테고리 기본을 상속**시킨다(종류 행을 만들지 않으면 자동으로 그렇게 된다).

## 7. ⚠️ 캠핑 208건은 기계적으로 못 나눈다 — 단계를 쪼갠다

`Hilleberg Keron` 이 텐트라는 것은 사람이나 AI 가 알아야 한다. 여기가 이 작업의 실제 비용이다.

| 단계 | 내용 | 종류 필수 |
|---|---|---|
| **1** | 스키마 + `scopeId` + `BrandScope` + 완성차 종류 + 자전거 도감 105건 이관 | 자전거만 |
| **2** | 캠핑 208건 분류 — 로컬 AI 조사(D-185) 제안 → 어드민 검수 | 캠핑은 아직 선택 |
| **3** | 캠핑 종류 필수 전환 | 자전거·캠핑 둘 다 |

### 단계를 안 나누면 무슨 일이 일어나는가

캠핑 도감이 미분류(= `subtypeId` null, scope = 카테고리)인 채로 종류가 필수가 되면, 유저가 텐트를 등록할 때 매칭이 **텐트 scope** 를 보는데 거기 아무것도 없다. → **기존 208건과 만나지 못하고 중복 도감을 만든다.** 원칙 4(도감은 연결점)가 정확히 무너지는 경로다.

### 폴백 조회로 때우지 않는다

"텐트 scope 에 없으면 카테고리 scope 도 본다"는 폴백은 읽기는 살리지만 **쓰기에서 갈라진다** — 새 도감은 텐트 scope 에 생기므로 같은 제품이 두 scope 에 공존하게 된다. D-207 이 경고한 상태로 되돌아간다. **분류를 미루는 대신 필수화를 미룬다.**

### 분류의 부수 효과

캠핑 도감에 오염분이 섞여 있다 — `Danner Bull Run`(부츠, 신발 소관) · `Mammut 9.5 Infinity`(클라이밍 로프) · `Mammut Wall Rider`(헬멧). **어느 종류에도 안 맞는 것이 곧 오분류 신호**라 분류 작업이 이것들을 드러낸다.

## 8. 브랜드는 마이그레이션이 0건이다

포함적 scope 라 기존 **312개** 연결(`_BrandToCategory` 전체)을 `BrandScope`(`subtypeId = null`)로 그대로 옮기면 **동작이 완전히 같다.** 그중 종류가 있는 카테고리는 자전거 40 · 캠핑 50 뿐이고, 나머지 222개는 애초에 좁힐 종류가 없다. 어드민이 좁히고 싶을 때만 종류 행을 추가한다.

**덧셈 작업이라 방치해도 나빠지지 않는다.** 강제 분해였다면 자전거 40×7 + 캠핑 50×8 = **680행**을 만들어놓고 어드민이 틀린 것을 지우는 뺄셈 작업이 됐을 것이다.

D-251 로 막 만든 카테고리 상세 `연결 브랜드` 탭이 이 작업의 자리다 — 종류 선택만 추가하면 된다.

## 9. 마이그레이션

| 대상 | 건수 | 방법 |
|---|---|---|
| `_BrandToCategory` → `BrandScope` | 312 | `subtypeId = null` 로 복사. 기계적 |
| 자전거 도감 → 완성차 | 105 | 일괄 UPDATE. 기계적 |
| 자전거 `CodexMatchKey` | 105 | 도감과 함께 |
| 자전거 아이템 | 1 | 완성차로 |
| 캠핑 도감 분류 | 208 | **단계 2** — AI 제안 + 어드민 검수 |
| 시계·신발·옷·데스크테리어·운동 | 739 | **변경 없음** — 종류가 없어 `scopeId == categoryId` |

`scopeId` 는 생성 컬럼이라 **백필이 필요 없다** — 컬럼을 추가하는 순간 DB 가 채운다.

## 10. 검증

이 저장소에는 테스트가 없다(§ 기존 관행). `pnpm lint` · `pnpm typecheck` · 실제 요청으로 검증한다.

| 확인 | 기대 |
|---|---|
| 운동 등록·매칭 | **회귀 없음** — 종류가 없어 동작이 같아야 한다. 이것이 기준선 |
| 시계 등록·매칭 | 회귀 없음 |
| 자전거 완성차 등록 | 종류 필수 노출, 기존 도감 105건과 매칭됨 |
| 자전거 휠셋 등록 | 완성차 도감과 **매칭되지 않음**(scope 다름), 새 도감 생성 |
| 같은 값 두 번 등록 | 유니크 위반이 정확히 걸림 (§4-1 검증과 같은 형태) |
| 안장 폼 브랜드 목록 | 자전거 공통 40개가 그대로 (단계 1 시점) |
| 캠핑 등록 | 단계 1·2 동안 종류 선택 가능, **미선택도 허용** |

## 11. 하지 않는 것

| 항목 | 이유 |
|---|---|
| `CategoryAttribute`·`MatchingKeyDefinition` 의 XOR → `scopeId` 통합 | 동작 중이고 의미가 다르다(합집합 vs 배타). 별건 |
| 시계·신발 등 5개 카테고리에 더미 종류 추가 | UI 마다 숨겨야 하는 행이 생기고 D-207 의 "없는 것이 기본"을 뒤집는다 |
| 브랜드 강제 종류 분해 | 680행 뺄셈 작업. 포함적 scope 로 불필요 |
| 자전거 부품 매칭 키 확정 | D-034 미검증 상태. 카테고리 기본 상속으로 둔다 |
| 캠핑 도감 오염분 자동 이동 | 분류 중 드러나면 어드민이 판단한다. 자동 이동은 카테고리를 바꾸는 일이라 위험 |
| 테스트 인프라 구축 | 저장소 전체 관행 변경. 별건 |

## 12. 기록할 의사결정

- **D-252** 종류를 필수로 — D-207 결정 5 의 전제를 제거한다. 선택지: 필수 / 브랜드만 종류화 / 선택 유지+도감 분할(탈락, D-207 재현)
- **D-253** 스코프 = `COALESCE(subtypeId, categoryId)` 생성 컬럼. 선택지: 생성 컬럼 / XOR 부분 유니크 두 벌 / 전 카테고리 더미 종류
- **D-254** 도감은 배타적 scope, 브랜드는 포함적 scope — 방향이 다른 이유
- **D-255** 자전거 `완성차` 종류 신설. 종류 8개
- **D-256** 캠핑 필수화는 분류 이후 — 폴백 조회로 때우지 않는 이유
