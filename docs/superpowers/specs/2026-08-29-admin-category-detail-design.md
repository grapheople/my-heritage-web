# 어드민 카테고리 상세 페이지 — 설계

- 작성일: 2026-08-29
- 대상 저장소: `my-heritage-web` (구현) · `my-heritage-planning` (정책 SoT)
- 관련 화면: A-01 카테고리 관리 · A-02 동적 속성 관리 · A-03 매칭 키 정의 · A-04 도감 목록
- 의사결정: D-246 ~ D-249 (`projects/item-catalog/06-decisions.md`)

## 1. 문제

어드민 18개 화면이 전부 평면이다. 카테고리 하나를 손보려면 화면 4개를 오간다:

| 하려는 일 | 지금 가야 하는 곳 |
|---|---|
| 시계를 비활성화 / 판매 막기 | A-01 |
| 시계 하위 종류 추가 | A-01 (모달) |
| 시계 속성 필수 토글 | A-02 `?category=watch` |
| 시계 선택지 노출 범위 | A-02 하단 |
| 시계 매칭 키 변경 | A-03 |
| 시계 도감 확인 | A-04 (카테고리 필터) |

각 화면은 **전 카테고리를 조회한 뒤 화면에서 필터**한다. 카테고리가 작업 단위인데
화면은 기능 단위로 잘려 있어, 한 카테고리의 상태를 한눈에 볼 수 있는 자리가 없다.

## 2. 방향

**카테고리를 어드민의 1급 객체로 만든다.** 카테고리 축으로 접히는 기능(A-02·A-03과
A-04의 카테고리분)을 상세 페이지 하위 탭으로 흡수하고, 축이 다른 것(A-11 브랜드는
N:M, A-05~A-07 큐는 전 카테고리 횡단)은 전역으로 남긴다.

### 흡수 판정 기준

| 화면 | 카테고리 축인가 | 처리 |
|---|---|---|
| A-02 동적 속성 | ✅ `CategoryAttribute.categoryId` | **흡수** — 전역 화면 제거 |
| A-03 매칭 키 | ✅ 카테고리 1행 = 1정의 | **흡수** — 전역 화면 제거 |
| A-04 도감 | ✅ `CodexItem.categoryId` | **부분 흡수** — 전역은 검색 용도로 유지 |
| A-11 브랜드 | ❌ Category N:M | 상세에 **읽기 전용**만 |
| A-05·A-06·A-07 | ❌ 전 카테고리 큐 | 전역 유지 |
| A-17·A-18 운동 | ❌ 운동은 아이템이 아니다 (D-227) | 전역 유지 |

## 3. 라우트 구조

```
/admin/categories                        A-01 목록 (유지, 각 행 → 상세 링크)
/admin/categories/[key]/layout.tsx       공유 헤더 + 탭바 + 존재 검증
/admin/categories/[key]/page.tsx         개요
/admin/categories/[key]/subtypes/        하위 종류
/admin/categories/[key]/attributes/      동적 속성 + 선택지
/admin/categories/[key]/matching-key/    매칭 키
/admin/categories/[key]/codex/           도감  ?q= &page= &size=
```

### `[key]`는 `Category.key` 그대로다

DB 값이 이미 맨 slug(`watch`, `workout`)이고, `getAdminCodexPage`가 비교 시점에
`category.${q.category}`로 접두를 붙인다. **URL 값을 변환 없이 넘긴다.**

### ⚠️ 존재 검증은 DB로 한다

`adminCategoryOptions()`는 DB가 아니라 `CATEGORY_KEYS` 코드 배열을 읽는다
(OI-82 미해소). 이것으로 존재를 판정하면 **DB에 있는데 코드 배열에 없는 카테고리가
404가 된다** — 카테고리 추가 스크립트(`setup-workout-category.ts` 류)를 돌린 직후가
정확히 그 상태다.

`layout.tsx`는 `prisma.category.findUnique({ where: { key } })`로 검증하고,
라벨만 기존 헬퍼에서 가져온다.

### 왜 중첩 라우트인가

- 도감은 카테고리당 수백~수천 건이다. 단일 페이지면 속성을 볼 때도 도감을 조회한다
- 도감 탭은 자기 `searchParams`(`q`·`page`·`size`)가 필요하다. 쿼리 파라미터 탭이면
  `tab`과 `page`가 한 네임스페이스에서 섞인다
- 섹션당 파일 하나로 쪼개진다 — `page.tsx` 하나가 7개 분기를 지지 않는다

## 4. 탭별 구성

새로 만드는 UI는 **탭바와 개요 탭뿐이다.** 나머지는 기존 컴포넌트를 카테고리
스코프로 감싼다.

| 탭 | 내용 | 재사용 컴포넌트 |
|---|---|---|
| **개요** | 활성·판매 토글, 사진필수·userCodexCreation **읽기 전용**, 집계, 연결 브랜드 읽기 전용 | `AdminActionButton` + `setCategoryActive` / `setCategorySellable` |
| **하위 종류** | 제품군 CRUD | `SubtypeManager` (props 그대로) |
| **동적 속성** | 공통 속성 표 + **붙이기 후보** + 제품군 전용 + 선택지 | `AttributeCreateForm` · `SubtypeAttributes` · `AttributeOptions` |
| **매칭 키** | 카테고리 + 제품군 매칭 키 | `MatchingKeyEditor` (`categoryKey`·`subtypeId` 그대로) |
| **도감** | 목록·검색·페이징·등록·검증 토글·편집·자료조사 | `AdminListControls` · `CodexCreateForm` · `CodexEditForm` · `CodexResearchPanel` |

### 개요 탭 집계

- 등록 아이템 수 (`_count.items`)
- 도감 수 / 그중 미검증 수
- 하위 종류 수 (활성 / 전체)
- 활성 속성 수 (공통 / 제품군 전용)
- 연결 브랜드 수 + 목록 (읽기 전용, A-11 링크)

### ⚠️ `requiresPhoto` · `userCodexCreation`은 토글하지 않는다

둘 다 **카테고리의 성질**이지 운영 판단이 아니다. `sellable`이 토글인 것과 갈리는
지점이다.

- `requiresPhoto` — `FR-07-A-13`이 **의도적으로 어드민 토글을 만들지 않았다.**
  잘못 끄면 판매 매물에서 사진이 사라져 거래 신뢰가 무너진다
- `userCodexCreation` — D-231. 켜면 **유저 등록이 조용히 도감을 만들기 시작한다.**
  운동 도감은 어드민이 준비한다는 전제(D-227·D-228)가 무너진다

개요 탭에는 **현재 값만 표시**하고, 바꾸려면 마이그레이션이라는 사실을 문구로 붙인다.

### ⚠️ 속성을 카테고리에 붙이는 UI가 없다 — 함께 메운다

`createAttributeDefinition`은 전역 `AttributeDefinition`만 만들고 `CategoryAttribute`
행은 만들지 않는다. 그런데 "속성 추가" 버튼은 카테고리 탭 안에 있어서, **시계 탭에서
만든 속성이 시계 목록에 나타나지 않는다.** 붙이는 경로가 UI에 없다.

제품군에는 있다 — `SubtypeAttributes`가 `candidates` prop으로 붙이기를 제공한다.
**카테고리 본체에만 빠져 있다.**

카테고리 상세로 옮기면 이 어긋남이 더 두드러진다 (URL이 `watch`인 화면에서 만든
속성이 그 화면에 없다). 속성 탭에 **"이 카테고리에 없는 속성" 목록 + 붙이기**를
추가한다.

**서버는 이미 준비돼 있다** — `setCategoryAttribute`가 upsert라 없으면 만든다.
새 액션이 필요 없고, 후보 목록 조회와 버튼만 추가하면 된다.

### 도감 탭에서 카테고리 셀렉트를 숨긴다

`AdminListControls`의 `categories`는 optional이다. 넘기지 않으면 셀렉트가 렌더되지
않는다. 카테고리가 URL로 고정된 화면에서 카테고리 셀렉트를 또 주면, 고른 값과 URL이
어긋난다.

### 도감 등록·자료조사는 상세로 옮긴다

전역 A-04의 `CodexCreateForm`은 카테고리 선택부터 받는다. 상세에서는 이미 정해져
있으므로 그 단계가 사라진다 — 실질 개선이다. 전역 A-04는 **검색·목록·검증 토글**
중심으로 남는다 (전 카테고리를 훑는 용도).

## 5. 데이터 레이어

`src/lib/data/admin.ts`(1135줄)에 **얇게 얹는다. 기존 함수를 고치지 않는다** —
전역 화면 A-04·A-11이 계속 쓰고 있다.

| 추가 | 용도 |
|---|---|
| `getAdminCategoryDetail(key)` | 기본 정보 + 집계 + 연결 브랜드 |
| `getAdminCategoryAttributes(key?)` | 기존은 전역 조회 후 화면 필터. 인자 있으면 해당 카테고리만 |
| `getUnattachedAttributes(key)` | 이 카테고리에 `CategoryAttribute` 행이 없는 정의 목록 (붙이기 후보) |

**도감은 손댈 게 없다** — `getAdminCodexPage({ category: key, ...params })`가 이미
카테고리 스코프를 지원한다.

**서버 액션은 전부 그대로 쓴다.** `src/lib/actions/admin.ts`(1999줄)의 관련 액션이
이미 `categoryKey` 기반이다 (`setCategoryActive` · `setCategorySellable` ·
`setCategoryAttribute` · 매칭 키·제품군 액션 전부). **`revalidatePath` 대상에 새
경로를 추가하는 것이 유일한 변경이다.**

## 6. 네비게이션 · 기존 경로

```
아이템
  카테고리 관리 (A-01)     ← 상세 진입점
  브랜드 마스터 (A-11)
  브랜드 요청 큐 (A-12)
  운동 마스터 (A-17) / 운동 요청 큐 (A-18)
도감
  도감 전체 검색 (A-04)    ← 유지, 이름 변경
  검증 큐 (A-05) / 병합 큐 (A-06) / alias 관리 (A-07)
```

- `/admin/attributes` → `/admin/categories` **redirect** (삭제 아님)
- `/admin/matching-keys` → `/admin/categories` **redirect**
- A-04 라벨 `도감 목록` → `도감 전체 검색`

redirect로 두는 이유: 기획 문서·북마크·과거 커밋 메시지가 옛 경로를 가리킨다.
삭제하면 404만 남고, 어디로 가야 하는지 알 수 없다.

### 화면 ID

상세는 **A-01 하위**로 둔다. 새 A-번호를 발급하지 않는다 — 상세는 A-01의 다른
표현이지 별개 화면이 아니다. A-02·A-03 번호는 **회수하되 재사용하지 않는다**
(D-220: 번호를 재사용하면 문서·화면·로그가 서로 다른 것을 가리킨다).

## 7. 검증

**이 저장소에는 테스트가 0개이고 `test` 스크립트도 없다.** 테스트 인프라 구축은 이
작업의 스코프가 아니다. 기존 관행을 따른다:

```bash
pnpm lint
pnpm typecheck
```

### ⚠️ 빌드도 typecheck도 이 화면들의 런타임 오류를 잡지 못한다

어드민은 `export const dynamic = "force-dynamic"`이라 빌드가 렌더하지 않는다.
`admin-list-params.ts` 주석에 남은 사고가 그것이다 — 클라이언트 모듈 함수를 서버에서
불러 **모든 페이지가 500이었는데 `pnpm check`도 `pnpm build`도 통과했다.**

**새 라우트 6개 + redirect 2개를 실제 요청해서 확인한다** (`localhost:3002`).

| 확인 | 기대 |
|---|---|
| `/admin/categories/watch` | 200, 개요 렌더 |
| `.../subtypes` `.../attributes` `.../matching-key` `.../codex` | 200 |
| `/admin/categories/nonexistent` | 404 (존재하지 않는 키) |
| 속성 탭에서 속성 생성 | 생성 직후 **이 카테고리 목록에 나타남** |
| `/admin/categories/workout` | 200 — 매칭 키 빈 배열, `userCodexCreation=false` 표시 |
| `/admin/attributes` · `/admin/matching-keys` | 302 → `/admin/categories` |
| 도감 탭 `?q=&page=2&size=10` | 페이징 동작, 카테고리 셀렉트 없음 |

`workout`을 반드시 함께 본다 — 매칭 키가 빈 배열이고 `userCodexCreation`이 `false`인
유일한 카테고리라, 카테고리 축 화면이 깨지는 곳이 항상 여기다 (D-173·D-182·D-185).

## 8. planning 저장소 동기화

어드민 화면 구성은 **정책 층**이라 코드만 고치면 SoT가 어긋난다 (D-094).

| 파일 | 변경 |
|---|---|
| `projects/item-catalog/06-decisions.md` | D-246~D-249 신규 |
| `projects/myroom-service/02-planning-spec.md` §6 | 어드민 화면 목록에서 A-02·A-03 회수, A-01 상세 기재 |
| `projects/myroom-service/10-frontend-spec.md` | 라우팅·색인 매트릭스에 새 경로 6개 + redirect 2개 |
| `projects/myroom-service/dev-sync-log.md` | 화면 정의 변경 기재 |
| `projects/myroom-service/07-status.md` | 변경 이력 |
| `projects/portfolio.md` | 상태 갱신 |

### 기록할 의사결정

- **D-246** 어드민 카테고리 상세 신설 — 카테고리를 1급 객체로. A-02·A-03 흡수
- **D-247** 흡수 판정 기준 — 카테고리 축인 것만. A-11은 N:M이라 읽기 전용
- **D-248** A-04 역할 축소 — 등록·자료조사는 상세로, 전역은 검색 용도
- **D-249** 옛 경로는 redirect로 남긴다 — 삭제하지 않는다
- **D-250** 속성을 카테고리에 붙이는 UI 신설 — 만들어도 안 붙던 구멍을 메운다.
  `requiresPhoto`·`userCodexCreation`은 토글하지 않는다(카테고리의 성질)

## 9. 하지 않는 것

| 항목 | 이유 |
|---|---|
| 카테고리 신규 생성·삭제 | D-007·`FR-01-A-02`가 금지. 상세가 생겨도 그대로 |
| `requiresPhoto` 토글 | `FR-07-A-13`이 의도적으로 만들지 않음. 읽기 전용 표시만 |
| A-11 브랜드 카테고리 축 편입 | N:M이라 카테고리로 접으면 편집 의미가 깨진다 |
| OI-82 (`CATEGORY_KEYS` DB 이관) | 별건. 존재 검증만 DB로 우회한다 |
| 테스트 인프라 구축 | 저장소 전체 관행 변경. 별건 |
| A-05~A-07 큐 카테고리 분할 | 전 카테고리 횡단이 이 큐들의 목적이다 |

## 10. 작업 단위

1. `getAdminCategoryDetail` + `getAdminCategoryAttributes(key?)` — 데이터 레이어
2. `layout.tsx` (존재 검증 + 탭바) + 개요 `page.tsx`
3. `subtypes` · `attributes` · `matching-key` 탭 — 기존 컴포넌트 이식 + 속성 붙이기 UI
4. `codex` 탭 — `AdminListControls` 카테고리 고정
5. A-01 목록에 상세 링크, 서버 액션 `revalidatePath` 갱신
6. 옛 경로 redirect + `admin-nav.tsx` 정리
7. 실제 요청 검증 (§7 표)
8. planning 문서 동기화 (§8)
