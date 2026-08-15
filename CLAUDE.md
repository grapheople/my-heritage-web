@AGENTS.md

# my-heritage-web

**Zroom** 서비스의 웹 구현체. 취미 수집품을 가상의 방에 전시하고, 남의 방을 들여다보고, 그 물건을 그대로 매물로 전환할 수 있는 컬렉터 커뮤니티.

## 언어

**모든 산출물·주석·커밋 메시지는 한국어.** 간결하고 실용적인 톤. 기획 레포와 같은 규칙이다.

---

## ⚠️ 기획서가 SoT다

기획은 **별도 레포**에 있다: `../my-heritage-planning` (`/Users/pax/Documents/GitHub/my-heritage-planning`)

이 레포는 그 기획의 구현체다. **기획과 코드가 다르면 기획이 이긴다.** 코드에서 편한 쪽으로 정책을 바꾸지 않는다.

### SoT 3층 구조 (D-094)

| 층 | SoT | 충돌 시 |
|---|---|---|
| **정책** (무엇이 어떻게 동작하는가) | Planning Spec / PRD | **기획이 이긴다** — 코드를 고친다 |
| **시각** (색·간격·컴포넌트) | `knowledge/design-system.md` | **문서가 이긴다** — `globals.css`를 고친다 |
| **구조** (라우트 경로·디렉토리·스택) | **이 레포의 코드** | **코드가 이긴다** — 기획 쪽 `10-frontend-spec.md`를 고친다 |

구조까지 기획이 이긴다고 보면 안 된다. 라우트 경로·디렉토리는 코드가 사실이고, 기획 문서가 그것을 따라온다.

### 읽는 순서

| 순서 | 문서 | 무엇이 있는가 |
|---|---|---|
| 1 | `projects/portfolio.md` | 전체 현황 · 확정된 서비스 전제 · 진행 블로커 |
| 2 | `projects/myroom-service/02-planning-spec.md` | **서비스 골격** — IA, 화면 목록(S-01~S-23), 상태 정의, 데이터 모델(§5), 어드민 화면(§6) |
| 2-a | **`projects/myroom-service/10-frontend-spec.md`** | **이 레포 전용.** 라우팅·렌더·색인 매트릭스 · Server/Client 경계 · **남은 작업 8건** |
| 2-b | **`knowledge/design-system.md`** | **시각 SoT.** 토큰(shadcn oklch) · 컴포넌트 인벤토리 · 브레이크포인트 |
| 3 | `policies/i18n/policy-handoff.md` | 다국어 정책 **SoT**. 번역 대상 경계, fallback, 포맷 |
| 4 | 해당 기능의 하위 프로젝트 문서 | 아래 표 |
| 5 | `knowledge/product-principles.md` | 판단이 갈릴 때의 tie-breaker |

### 기능 ↔ 문서 매핑

| 담당 프로젝트 | 범위 | 문서 |
|---|---|---|
| `myroom-service` | IA · 마이룸 진열 · 공개 범위 · NEW 피드 · 검색 · 인증 · 언어 · 제재 | `02-planning-spec.md` |
| `item-catalog` | 아이템 · 카테고리 동적 속성 · 브랜드 마스터 · 브랜드 요청 큐 | `03-prd.md` (PRD 급) |
| `codex` | 도감 — 매칭 키 · 정규화 · 병합 · 검증 배지 · alias | `03-prd.md` (PRD 급) |
| `market` | 판매 전환 · 마켓 · 외부 링크 · 신고 · 차단 · 금지품목 | `02-planning-spec.md` |
| `diary` | 일기 — 공개/비공개, 사진 10장, 1000자, 아이템 N:M | `02-planning-spec.md` |
| `leveling` | 경험치 · 레벨 테이블 | `02-planning-spec.md` |

각 프로젝트의 `06-decisions.md`(의사결정 누적)와 `07-status.md`(현재 상태)는 **항상 최신**이다. 작업 전에 `07-status.md`를 먼저 읽는다.

### 문서 ID 규칙

| 접두 | 뜻 | 예 |
|---|---|---|
| `D-xxx` | 확정된 의사결정. **decisions.md에 없는 결정은 존재하지 않는 것이다** | D-019 공개 판정 |
| `FR-xx-A-nn` | 기능 요구사항 (EARS 형식) | FR-02-A-04 |
| `AC-...` | 인수 조건 | |
| `M-nn` | 데이터 모델 관계 규칙 | M-06 공개 판정 |
| `S-nn` | 유저 화면 (**34개** — 스텁 0) | S-01 NEW 피드 · **S-22 알림함** · **S-23 카테고리 전체** |
| `A-nn` | 어드민 화면 (**15개**) | A-13 운영 대시보드 |
| `OI-nn` | 오픈 이슈 (미확정) | OI-18 |

**코드 주석과 커밋 메시지에서 이 ID로 근거를 밝힌다.** 왜 이렇게 짰는지 추적할 수 있어야 한다.

### 기획서를 고치지 않는다

이 레포에서 작업하다 기획의 구멍·모순·누락을 발견하면:

1. **추측으로 채우지 않는다.** 없는 API 필드, 없는 메시지 슬롯, 없는 상태를 만들어내지 않는다 (기획 레포 CLAUDE.md 공통 규칙 9)
2. 발견 내용을 사용자에게 보고한다. 기획 문서 수정은 기획 레포의 에이전트 파이프라인이 담당한다
3. 진행이 막히면 **가정을 명시하고** 그 가정을 코드 주석 + 보고에 남긴다

---

## 스택

| | |
|---|---|
| Next.js | **16.3.0** — App Router · Turbopack (기본) · `typedRoutes` |
| React | 19.2 |
| TypeScript | 5.9 (strict) |
| 스타일 | Tailwind CSS v4 (`@import "tailwindcss"`, config 파일 없음) |
| 컴포넌트 | shadcn/ui — Radix 기반 · `radix-nova` 스타일 · `components.json` |
| i18n | next-intl 4.13 — `/[locale]` 라우팅 |
| DB | PostgreSQL + Prisma **7** (`prisma-client` generator + `@prisma/adapter-pg` driver adapter) |
| 패키지 매니저 | pnpm 11 |

### Next 16 주의점

- **`middleware.ts`는 `proxy.ts`로 이름이 바뀌었다.** 이 레포는 `src/proxy.ts`를 쓴다
- `params`·`searchParams`·`headers()`·`cookies()`는 **모두 async**다. `await` 필수
- 레이아웃·페이지 props 타입은 전역 `LayoutProps<"/route">` / `PageProps<"/route">`를 쓴다 (typedRoutes가 생성)
- 학습 데이터와 다른 부분이 있으면 `node_modules/next/dist/docs/`를 읽는다

### Prisma 7 주의점

- generator는 `prisma-client`(≠ `prisma-client-js`)이고 **output 경로 필수** → `src/generated/prisma` (gitignore됨)
- import 경로는 `@/generated/prisma/client`
- SQL provider는 **driver adapter 필수**. `src/lib/prisma.ts`가 `PrismaPg`로 감싼 싱글턴을 export한다. 직접 `new PrismaClient()` 하지 말 것
- `DATABASE_URL`은 `schema.prisma`가 아니라 **`prisma.config.ts`**에서 읽는다

---

## 명령어

```bash
pnpm dev                # 개발 서버
pnpm build              # prisma generate + next build
pnpm check              # lint + typecheck (작업 완료 전에 반드시 실행)
pnpm typecheck
pnpm lint

pnpm db:local           # 로컬 Postgres (prisma dev)
pnpm db:migrate         # 마이그레이션 생성·적용 (dev)
pnpm db:deploy          # 마이그레이션 적용 (prod)
pnpm db:studio          # Prisma Studio
pnpm db:generate        # 클라이언트 재생성 (스키마 변경 후 필수)
pnpm prisma db seed     # 시드 (멱등)
```

`.env`는 `.env.example`을 복사해 채운다.

---

## 디렉토리 구조

```
src/
  app/
    [locale]/                    ← 유저 앱 root layout (html lang={locale})
      (user)/                    ← 하단 탭 4개가 붙는 셸
        page.tsx                 S-01 NEW 피드
        me/…  search/  market/  items/  diaries/  codex/  rooms/  brands/  report/
      login/                     S-13 (탭바 없음)
      suspended/                 S-21 제재 안내 (탭바 없음)
    (admin)/admin/               ← 어드민 root layout (html lang="ko" 고정)
      …                          A-01 ~ A-13
    globals.css                  Tailwind v4 + shadcn 테마 토큰
  components/
    ui/                          shadcn/ui (생성물 — 직접 수정 최소화)
    layout/                      BottomTabBar · AdminNav
    common/                      ExternalLinkWarning (S-16 공통 컴포넌트)
    dev/screen-stub.tsx          미구현 화면 플레이스홀더
  i18n/                          routing · request · navigation
  lib/                           prisma · format · utils
  generated/prisma/              Prisma Client (gitignore)
  proxy.ts                       locale 판별·리다이렉트
messages/                        ko.json · ja.json · en.json
prisma/                          schema.prisma · migrations/ · seed.ts
```

### root layout이 2개다

`src/app/layout.tsx`는 **없다.** `[locale]/layout.tsx`(유저)와 `(admin)/admin/layout.tsx`(어드민)가 각각 `<html>`을 낸다.

이유: **어드민 UI 언어는 ko 단일**(D-030)이므로 `/ko/admin`·`/en/admin`이 존재해서는 안 된다. `src/proxy.ts`의 matcher에서 `/admin`을 제외해 locale 리다이렉트가 걸리지 않게 했다.

단, **어드민이 입력하는 유저 노출 필드**(속성 라벨 · enum 선택지 · `number` 단위 · 도감 설명 · alias)는 ko/ja/en **3개 입력 필드**를 제공해야 한다 (D-010, D-030).

### 화면 스텁

`ScreenStub`이 렌더되는 페이지는 **미구현**이다. 남아 있는 stub 목록이 곧 남은 화면 목록이다:

```bash
rg -l "ScreenStub" src/app
```

### ⚠️ 디자이너 핸드오프 단계는 제거됐다 (2026-08-07)

Figma 탐색을 기다리지 않는다. 시각 기준은 **`knowledge/design-system.md`가 SoT**이고, 화면 형태는 프로토타입(HTML **47화면**)을 참조한다:

```
../my-heritage-planning/projects/myroom-service/prototype/
  myroom-prototype.html         마이룸 진열 + 등록 폼 + 카테고리 전체 12화면
  myroom-prototype-2.html       피드·검색·마켓·도감·일기·알림함·설정·제재 21화면
  myroom-admin-prototype.html   A-01~A-13 · 1440×900 · ko 단일
  brand-directions.html         브랜드 3안 비교 — A안(무채색) 선택 근거 (D-079)
```

프로토타입 상단에 **뷰포트 토글(390 ↔ 1200)**이 있다. `lg` 레이아웃(D-089)을 여기서 확인한다.
`~/drafts/designer-handoff.md`는 **폐기됐다** — 참조하지 않는다.

---

## 반드시 지켜야 하는 규칙

아래는 **틀리면 조용히 정책을 위반하는** 지점들이다. 코드를 쓰기 전에 확인한다.

### 1. 공개 판정은 `Room.visibility AND Item.visibility` (M-06, D-019)

방 상태가 아이템 설정을 **무시**한다. 두 축을 독립적으로 계산하면 유저가 자기 노출 상태를 예측할 수 없다 (FR-02-A-04).

- 비공개 아이템·비공개 방은 **NEW 피드 · 검색 · 도감 소유자 목록 · 마켓 전부**에서 빠진다
- 타인 방에서는 아이템의 **구매처·구매일·구매가를 노출하지 않는다** (FR-01-B-03). 소유 기간만 보여준다
- 예외 하나: 아이템이 비공개여도 **연결된 공개 일기는 계속 노출**된다 (FR-02-B-06). 일기→아이템 링크만 비활성

### 2. 아이템 명칭은 저장하지 않는 파생값 (M-14, D-073)

도감 연결 시 `CodexItem.displayName`, 미연결 시 `brand.name + model`. **조회 시 생성**한다 (FR-03-A-11). `Item`에 `name` 컬럼을 추가하지 말 것. 번역하지 않는다.

### 3. 차단은 양방향 (M-11, D-051)

`Block` 1건(A→B)이 **양쪽 가시성**을 차단한다. NEW · 검색 · 마켓 · 도감 소유자 목록 · 기록 **전부**에 양방향 필터가 필요하다. 한 곳이라도 빠지면 상호 비가시가 깨진다.

### 4. 제재 해제 시 방 공개 상태는 제재 이전 값으로 복원 (M-12, D-065)

`Sanction.previousRoomVisibility`에 저장해 둔 값으로 되돌린다. **강제 전환값(PRIVATE)으로 원본을 덮어쓰면** 원래 비공개였던 방이 해제 후 공개로 노출된다.

제재는 콘텐츠를 삭제하지 않는다 (M-13). 판매중 아이템은 별도 로직 없이 공개 판정에 의해 마켓에서 사라진다 (FR-07-B-05).

### 5. 경험치는 유저 타임존 기준 1일 1회 (D-026, D-056)

`ExperienceLog`의 `@@unique([userId, reason, localDate])`가 유일한 보장이다. `localDate`는 `lib/format.ts`의 `userLocalDate(user.timezone)`로 만든다.

**운영 지표는 UTC(`createdAt`) 기준이다 — 두 기준이 공존한다. 섞지 말 것.** 경험치 회수는 없다. 레벨은 단조 증가 (D-058).

### 6. 탭 4개는 항상 노출되고 누를 수 있다 (D-069)

비로그인·정지 상태에서도 **회색 처리나 숨김을 쓰지 않는다.** 누를 수 있게 두고 이동한 화면에서 안내를 띄운다 (FR-05-B-05·06). 온보딩 화면은 없다. 최초 진입은 NEW 피드.

### 7. 외부 링크는 반드시 공통 컴포넌트 경유 (D-040)

마켓 거래 링크와 아이템 `url` 속성 값 **모두** `components/common/external-link-warning.tsx`를 쓴다. "건너뛰기/다시 보지 않기" 설정은 없다. 경고를 필드 단위로 붙이면 반드시 새는 곳이 생긴다.

### 8. NEW 피드 정렬 시각은 갱신되지 않는다 (D-070)

`Item.createdAt` 역순. 비공개→공개 전환이나 판매완료→전시중 복귀로 **정렬 시각을 갱신하지 않는다** (FR-03-A-09).

### 9. ⚠️ 도감 소유자 목록을 서버 렌더 결과에 넣지 않는다 (D-078, FR-07-A-07·08)

**도감 상세(`/[locale]/codex/[codexId]`)는 검색엔진 색인 대상이다.** 그런데 그 안의 **소유자 방 목록·보유자 수는 비로그인에게 렌더해서는 안 된다.**

| 영역 | 렌더 | 크롤러가 보는가 |
|---|---|:---:|
| 제품 정보 (명칭·브랜드·스펙·검증 배지·사진) | 서버 (SSR — ISR 아님, OI-60) | O |
| **소유자 방 목록 · 보유자 수** | **클라이언트에서 인증 후 fetch** | **✕** |

**서버 컴포넌트에서 소유자 목록을 fetch하면 HTML에 실려 나가고 크롤러가 읽는다.** 화면에서 조건부로 숨겨도 소용없다 — 응답 본문에 이미 있다.

깨지면: **D-031에서 수용한 절도 리스크가 검색엔진 규모로 커진다.** 구글에 "고가 시계 보유자 목록"이 색인된다. 이것이 D-078의 존재 이유다.

비로그인에게는 소유자 목록 자리에 **로그인 유도 블록**을 렌더한다 (`FR-07-A-07`).

**같은 숫자가 나오는 모든 화면에 같은 판정을 적용한다** (D-096). 도감 상세만 가리면 **검색 결과가 우회로**가 된다. 판정은 `lib/auth/viewer.ts`의 `isLoggedIn()` 한 곳에서만 한다.

**조건부 렌더로 숨기지 말고, 데이터를 넘기지 않는다.** `ownerCount`를 프롭으로 주고 `false`일 때만 안 그리면, 그 컴포넌트가 클라이언트 컴포넌트가 되는 순간 RSC 페이로드로 실려 나간다. `CodexRow`는 `Omit<CodexEntry, "ownerCount">`를 받는다 — **타입으로 막는다.**

#### ⚠️ 반대로, 판매중 매물은 비로그인에게도 서버 렌더한다 (D-098, FR-07-A-09)

같은 도감 상세 안에서 규칙이 갈린다. 가르는 기준은 데이터 종류가 아니라 **유저가 공개를 선택했는지**다.

| | 소유자 목록 | 판매중 매물 |
|---|---|---|
| 유저의 의사 | 팔 의사 없이 그냥 보유 | **스스로 매물로 올렸다** |
| 서버 렌더 | **✕ 금지** | **○ 필수** (마켓 유입 경로) |

도감 상세에서 매물을 가려도 **마켓 페이지에서 그대로 색인되므로 막히는 게 없다.** 반대로 소유자 목록은 도감 상세가 유일한 노출 지점이라 막는 것이 실효가 있다.

#### 비로그인 경로를 어떻게 확인하나

개발 우회로(`lib/auth/viewer.ts`)가 켜져 있으면 **`isLoggedIn()`이 항상 true**라서 위 규칙을 **확인할 수 없다.** 쿠키로 비로그인을 흉내낸다:

```bash
curl -s -b 'dev-logged-out=1' 'http://localhost:3002/ko/search?q=sub&tab=codex' | grep '명 보유'   # 결과 없어야 한다
curl -s -b 'dev-logged-out=1' -o /dev/null -w '%{http_code}\n' localhost:3002/api/codex/cx-116610/owners  # 401
```

⚠️ 숫자를 grep할 때 **`<script>`를 먼저 제거할 것** — SVG 경로 데이터와 청크 해시에 두세 자리 숫자가 흔해서 오탐이 난다.

### 10. 색인 기본값은 noindex다 (D-078, D-093)

**색인 대상만 명시적으로 켠다.** 기본값을 index로 두면 새 화면이 추가될 때마다 D-078이 조용히 깨진다.

| 색인 | 대상 |
|:---:|---|
| **O** | 도감 상세 · 마켓 목록 · **판매중 + 공개 아이템 상세** |
| ✕ | 그 외 전부 — 방 · 일기 · 검색 · `/me/**` · `/notifications` · `/report` · `/admin` |

**아이템 상세는 조건부다** (D-093): `saleStatus === ON_SALE && visibility === PUBLIC && room.visibility === PUBLIC` 일 때만 색인. 판매중 → 비판매로 되돌리면 **사이트맵에서 빼고 noindex로 전환**한다.

### 11. 권한 없는 아이템은 응답에서 제외한다 (D-083, FR-01-B-06·07)

타인 방·일기에서 열람 권한이 없는 아이템은 **흐리게 처리하거나 자물쇠를 붙이지 않고 아예 렌더하지 않는다.** 개수 집계에서도 뺀다.

흐리게 두면 "비공개 아이템이 몇 개 있다"가 노출된다. **D-019 두 축 프라이버시의 취지는 존재를 감추는 것이다.**

> 예외 하나는 그대로다: 아이템이 비공개여도 **연결된 공개 일기는 계속 노출**된다 (FR-02-B-06). 그 일기에서 아이템으로 가는 링크만 렌더하지 않는다.

### 12. 유채색은 상태색 3개뿐이다 (D-079)

서비스 크롬은 **무채색만.** `globals.css`의 shadcn 팔레트는 전부 `oklch(L 0 0)`(채도 0)이고 **그것이 의도다.**

허용된 유채색: `--sale`(판매중) · `--warn`(외부 링크 경고·미검증 도감) · `--destructive`(삭제). **네 번째를 추가하려면 기획 결정이 필요하다.**

- `--priv`(비공개)는 **무채색이 의도다** — 비공개는 상태이지 경고가 아니고, 색을 주면 눈에 띄어 규칙 11과 충돌한다
- 컴포넌트에 `text-blue-500`·`bg-neutral-100` 같은 **스케일/임의 유틸리티를 쓰지 않는다.** 시맨틱 토큰(`text-muted-foreground`·`bg-sale`)만 쓴다 — 스케일 유틸리티는 다크 모드에서 반전되지 않는다 (D-080)

---

## i18n 규칙 (가장 자주 틀리는 곳)

SoT: `../my-heritage-planning/policies/i18n/policy-handoff.md`

### 번역 대상 경계 — "누가 그 텍스트를 만들었는가"

| 번역한다 (3개 언어) | 번역하지 않는다 (원문 그대로) |
|---|---|
| UI 문구 전체 · 버튼 · 라벨 · placeholder · 빈 상태 | 일기 본문 · 사진 캡션 |
| 하단 탭 4개 (D-022 — 영문 고정 정책은 **폐기**) | 닉네임 · 방 이름 · 프로필 소개 |
| 카테고리명 (6개, i18n 리소스) | 아이템 메모 |
| 속성 **명** · `number` **단위** | 속성 **값** (브랜드="Rolex", 구매처="명동 백화점") |
| 속성 **선택지(enum)** ← **가장 흔한 누락** | 도감 `displayName` · 브랜드 `name` (원문 1개 + alias) |
| 상태명 · 에러 메시지 · 인앱 알림 문구 | 외부 링크 URL |

도감·브랜드는 **원문 1개 고정 + 언어별 검색용 alias**다 (D-009, D-043). alias는 검색 인덱스 전용이고 화면에 표시되지 않는다. alias로 매칭된 경우 **어떤 alias로 일치했는지 결과 카드에 보조 표기**한다 (§2 UX 요구).

### fallback

`요청 언어 → en → ko` (D-012). `src/i18n/request.ts`가 메시지를 **병합**해 구현한다 (런타임 fallback이 아니라 merge).

- **i18n key를 화면에 노출하지 않는다** (`item.detail.button.sell` 같은 문자열이 보이면 결함)
- **빈 문자열로 렌더하지 않는다**
- 3개 언어 전부에 없는 key는 **배포 결함**이다. dev에서 throw하도록 되어 있다 — 그냥 넘기지 말고 메시지를 채운다

### 포맷은 `lib/format.ts`만 쓴다

컴포넌트에서 직접 `Intl.*`를 부르지 않는다. 언어별로 어긋난다.

| | 규칙 |
|---|---|
| 날짜 | ko `2026.08.04` / ja `2026年8月4日` / en `Aug 4, 2026` |
| 천 단위 | **3개 언어 모두 콤마** |
| 통화 | `₩1,200,000` · `¥180,000` · `$1,200.00`. **환산하지 않는다** (D-011). 통화는 가격의 일부다 |
| 복수형 | 라이브러리 plural rule 사용. **문자열 결합으로 만들지 않는다** (영어 복수형) |
| 텍스트 길이 | 버튼·탭·배지에 **고정 폭 금지**. 3개 언어 중 가장 긴 문자열로 검증 |

### 라우팅

유저 화면에서는 `next/link`·`next/navigation` 대신 **`@/i18n/navigation`의 `Link`·`useRouter`·`usePathname`**을 쓴다 (locale이 자동으로 붙는다). 어드민(`/admin`)은 locale prefix가 없으므로 `next/link`를 쓴다.

---

## 확정된 서비스 전제 (모든 기능이 상속)

| 항목 | 내용 |
|---|---|
| 수익 모델 | 광고 (D-024). **MVP 전 기능 무료** → 구독 분기 코드를 만들지 않는다 |
| 광고 | MVP 미노출. 피드·마켓 레이아웃에 **슬롯 자리만 확보** (D-025) |
| 결제 | 없음 (D-001). 인앱 결제·에스크로·채팅 모두 스코프 밖. 외부 링크로 거래 |
| 알림 | **전부 인앱** (D-059). 푸시·이메일 인프라를 MVP에서 만들지 않는다 |
| 인증 | Google · Apple만 (D-021). Kakao·LINE은 계정 병합 정책 확정 후 P2 |
| 카테고리 | 6개 고정 (D-007). 어드민이 신규 생성·삭제하지 않는다 |
| 사진 | 아이템 **1~10장 (1장 이상 필수)** (D-037, M-07). 일기도 최대 10장 |
| 속성 타입 | 8종 (D-038). 매칭 키는 `text`/`number`/`select`/`date` 4종만 (D-041) |
| 속성 삭제 | 사용 중이면 **비활성화만**. 값은 보존 (D-036, M-09) |
| 브랜드 | `select` + 어드민 브랜드 마스터. 자유 텍스트 아님 (D-043, M-08) |
| 마켓 필터 | 카테고리 + 통화 **2개만**. 언어권 필터 없음 (D-049) |
| 마켓 정렬 | 가격순은 **통화 필터 선택 시에만** 활성화. 환율 미사용 (D-048) |
| 일기 | 언어 무관 **1000자**. 플레인 텍스트. URL 자동 링크화 없음. 아이템과 **N:M** (D-053~D-055) |
| 유저 콘텐츠 | **외부 분석 도구로 보내지 않는다** (D-003, 프라이버시) |
| **플랫폼** | **웹 (D-077).** 모바일 우선 + **데스크톱 대응**. `lg`(1024px+)에서 하단 탭바 → 상단 네비 + 좌측 사이드 (D-089) |
| **브랜드 색** | **무채색 (D-079).** `--primary`는 검정. 유채색은 상태색 3개뿐 (규칙 12) |
| **다크 모드** | 토큰·`next-themes` 준비됨. **MVP는 라이트만 출시** — 테마 토글을 노출하지 않는다 (D-080) |
| **색인** | 도감 · 마켓 · **판매중 공개 아이템만**. 기본값 noindex (규칙 10, D-078·D-093) |
| **알림함** | **S-22 신설** (D-087). 푸시가 없으므로(D-059) **유일한 전달 경로**. `Notification` 모델이 아직 없다 |
| 진열 | 섹션당 **~1023px 12개 / 1024px~ 15개** + "더 보기" → S-23 (D-085). 떠난 아이템은 맨 아래 **기본 접힘** (D-086) |
| 기록(일기) 목록 | **세로 1열 + 날짜 헤더.** 진열(그리드)과 다르게 (D-084) |
| NEW 필터 | 카테고리 칩 스크롤 + 언어권 드롭다운을 **1줄**에 (D-082) |
| 제재 안내 | **세션당 1회** + 제재 대상 행동 시도 시 재노출 (D-088) |
| 아이콘 | `lucide-react` (OI-42 해소) |

---

## 알려진 공백 (아직 채울 수 없는 것)

작업 중 이 항목에 부딪히면 **추측으로 메우지 말고** 사용자에게 확인한다.

| 항목 | 상태 | 막고 있는 것 |
|---|---|---|
| **브랜드 마스터 시드 290건 + alias ~900건** | PM 액션 대기 (D-044·D-045·D-047) | **아이템 등록 자체.** 시드 없으면 첫 등록이 막힌다. CSV import 스크립트도 필요 |
| 카테고리별 매칭 키 (A-03) | 옷·자전거·데스크테리어 미확정 — D-034 조사 대기 | 도감 정규화·자동 채움 |
| 레벨 테이블 곡선 | `prisma/seed.ts`의 값은 **자리만 잡은 것** | A-09 확정 테이블로 교체 필요 |
| `accessories` 선택지 ja/en 라벨 | ko만 확정. seed의 ja/en은 **추측 기반** | PM 컨펌 |
| 카테고리명 ja/en 라벨 | 기획 문서에 ko만 있다. `messages/{ja,en}.json`의 값은 **추측 기반** | PM/디자인 컨펌 |
| ~~앱 타이틀 ja/en~~ | ✅ **`Zroom`** — 3개 언어 공통 브랜드 마크 (D-139). 탭 라벨 `마이룸`은 그대로 |
| ~~디자인 (S-01~S-21)~~ | ✅ **해소** — 디자이너 단계 제거. `knowledge/design-system.md` + 프로토타입 47화면 | |
| ~~아이콘 세트 (OI-42)~~ | ✅ **해소** — `lucide-react` | |
| ~~API 응답 스키마 (OI-45)~~ | ✅ **해소** — Prisma 스키마 23모델 | |
| **`globals.css` 상태색 6개 누락** | `--sale`/`--warn`/`--priv` (+ `-bg`)가 없다. 패치는 `knowledge/design-system.md` §2-4에 있다 | **판매중 배지** — D-046 마켓 유입 진입점 |
| **유저 셸이 모바일 전용** | `(user)/layout.tsx`가 `max-w-screen-sm` 중앙 정렬. D-077에서 데스크톱 대응을 선택했다 | `lg` 레이아웃 (D-089) |
| **`Notification` 모델 없음** | D-087. 스키마 + `/[locale]/notifications` 라우트 모두 필요 | S-22 |
| **S-23 라우트 없음** | `/me/c/[category]` · `/rooms/[roomId]/c/[category]` (D-085) | 진열 "더 보기" |
| **`robots.ts`·`sitemap.ts` 없음** | D-078·D-093. 규칙 10 참조 | 색인 정책 |
| **A-13 운영 대시보드 라우트 없음 (OI-49)** | `/admin/levels`는 레벨 테이블 관리이고 D-072의 지표 대시보드가 아니다 | 지표 관측 |
| **폰트 정책 충돌 (OI-50)** | 코드는 Geist + OS 시스템 CJK 폴백. 기획 D-090은 로케일별 웹폰트. **코드 현행 유지** | 세 시장 렌더 일관성 |
| 어드민 계정·권한 모델 | 미확정. `Sanction.issuedBy` 등은 문자열로 둠 | 어드민 인증 구현 |
| 이벤트 로깅 스키마 | OI-33 — 각 spec에서 정의 필요 | 지표 측정 |
| 문의 이메일 운영 주체·SLA | OI-32 | S-20 문구 |
| 약관·개인정보처리방침 3개 언어 | OI-16 법무 검수 | 출시 |

기타 미해결 오픈 이슈(**OI-16·19·21·31~37·39·43·44·46·47·49·50**)는 `myroom-service/02-planning-spec.md` "오픈 이슈" 표에 있다.
**해소됨**: OI-17(D-081) · OI-18(D-083) · OI-20(D-082) · OI-26(D-084) · OI-34(D-087) · OI-38(D-085) · OI-40(D-092) · OI-41(D-091) · OI-42·OI-45·OI-48(D-094)

---

## 작업 관례

- **작업 완료 전 `pnpm check`를 돌린다.** 통과하지 않은 상태로 완료라고 말하지 않는다
- 스키마를 바꾸면 `pnpm db:migrate` + `pnpm db:generate`. 마이그레이션 파일은 커밋한다
- `src/generated/`는 생성물이다. 커밋되지 않는다 (`postinstall`이 다시 만든다)
- `src/components/ui/`는 shadcn 생성물이다. 수정보다 wrapper 컴포넌트를 만드는 쪽을 택한다
- `AGENTS.md`의 `nextjs-agent-rules` 블록은 `next dev`가 다시 써넣는다. 지우지 말고 그대로 커밋한다
- 커밋 메시지에 관련 `D-xxx`·`FR-xx`·`S-nn`을 남긴다
