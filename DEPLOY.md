# 배포 (Vercel)

> 이 문서는 **순서가 중요하다.** D-097(출시 순서 의존성) 때문에 단계를 건너뛰면
> 유저가 아이템을 한 건도 등록할 수 없는 상태로 배포된다.

## 1. 리전 — `icn1` (서울)

`vercel.json` 에 고정했다. 3개 언어 시장(ko·ja·en) 중 **ko·ja 가 주 시장**이고
서울이 도쿄와도 가깝다. DB 도 같은 리전에 둔다 — **함수와 DB 가 멀면 쿼리마다
왕복이 붙어** 진열처럼 쿼리가 많은 화면에서 체감된다.

## 2. Postgres — 풀링과 직접 연결을 **둘 다** 설정한다

Vercel Marketplace 에서 Postgres(Neon 등)를 붙이면 두 종류의 연결 문자열이 나온다.

| 환경 변수 | 형태 | 쓰는 곳 |
|---|---|---|
| `DATABASE_URL` | **풀링됨** (`...-pooler.<region>...`) | 런타임 (`lib/prisma.ts`) |
| `DIRECT_URL` | 직접 연결 | 마이그레이션·시드 (`prisma.config.ts`) |

### Supabase 를 쓰는 경우 — 어떤 값을 어디에

Supabase(또는 Vercel 연동)는 변수를 **자기 이름으로** 주입한다. 코드가 그 이름을
그대로 읽으므로 **옮겨 적을 필요가 없다** (`src/lib/db-url.ts`).

| 주입된 이름 | 포트 | 쓰이는 곳 | 판별법 |
|---|:---:|---|---|
| `POSTGRES_PRISMA_URL` | **6543** | **런타임** (= `DATABASE_URL`) | `pgbouncer=true` 가 붙어 있다 |
| `POSTGRES_URL_NON_POOLING` | **5432** | **마이그레이션** (= `DIRECT_URL`) | 파라미터에 `pgbouncer` 가 없다 |
| ~~`POSTGRES_URL`~~ | 6543 | **쓰지 않는다** | 6543 인데 `pgbouncer=true` 가 없다 |

> ⚠️ **`POSTGRES_URL` 이 가장 헷갈리는 값이다.** 이름이 "기본 URL" 처럼 보이는데
> transaction 풀러(6543)이면서 `pgbouncer=true` 플래그가 없다. 마이그레이션에
> 쓰면 advisory lock 을 못 잡고, 런타임에 써도 Prisma 가 풀러임을 모른다.
>
> Supabase 의 5432 는 "직접 연결"이 아니라 **session 모드 풀러**다. advisory lock
> 과 prepared statement 를 지원하므로 마이그레이션에 쓸 수 있다. `db.<ref>.supabase.co`
> (진짜 직접 연결)는 신규 프로젝트에서 IPv6 전용이라 대개 쓸 수 없다.

**지금 설정이 맞는지 확인**:

```bash
pnpm db:which
```

런타임/마이그레이션이 각각 어느 호스트·포트를 보는지 낸다. 풀링 여부가 잘못되면
경고한다. **런타임과 마이그레이션이 다른 DB 를 가리키면**, 증상이 "마이그레이션했는데
화면에 반영이 안 된다" 로 나타나 원인을 찾기 어렵다. 그래서 이 스크립트를 만들었다.

> **로컬 env 파일은 `.env.local` 하나다** (2026-09-03 통합). 예전에는 `.env` 와
> 둘로 나뉘어 있었는데 `DATABASE_URL`·`AUTH_SECRET` 이 양쪽에 중복 정의돼 있었다.
> `.env.local` → `.env` 순으로 읽고 **앞의 것이 이기므로** `.env` 쪽 값은 죽은
> 값이었다 — 고쳐도 반영되지 않는 함정이라 합쳤다.
>
> 로딩 순서는 `prisma/env.ts` 가 Next.js 와 맞춘다. `dotenv/config` 는 `.env` 만
> 읽어서, 그 차이가 앱과 CLI 가 다른 DB 를 보는 사고를 만들었다.

### ⚠️ 사내 네트워크가 Postgres 포트를 막을 수 있다

**2026-08-08 확인**: 이 개발 머신에서 `5432`·`6543` 이 **둘 다 타임아웃**이다.
Supabase 프로젝트는 살아 있다 (REST `443` 은 응답). DNS 도 정상. 즉 **네트워크가
outbound Postgres 를 차단**한다.

그래서 **이 머신에서는 마이그레이션을 돌릴 수 없다.** 선택지:

| 방법 | 비고 |
|---|---|
| **CI 에서 실행** (GitHub Actions 등) | 권장. 배포 파이프라인에 넣으면 절차가 한 곳에 모인다 |
| 차단 없는 네트워크 | 테더링 등. 일회성으로는 가장 빠르다 |
| Supabase SQL Editor 에 SQL 붙여넣기 | **`_prisma_migrations` 기록이 남지 않아** 이후 마이그레이션이 어긋난다. 권하지 않는다 |

**Vercel 런타임은 영향받지 않는다** — Vercel 네트워크는 막지 않는다.

### ⚠️ 왜 둘 다 필요한가

- **풀링이 없으면 DB 가 마비된다.** Vercel Functions 는 요청마다 인스턴스가 생기므로
  직접 연결로는 `max_connections` 를 금방 넘긴다. 코드는 정상인데 전부 500 이 된다.
- **마이그레이션은 풀러를 거치면 실패한다.** `prisma migrate` 는 동시 실행을 막기 위해
  advisory lock 을 쓰는데 풀러의 transaction 모드가 이를 지원하지 않는다.

로컬에는 풀러가 없으므로 `DIRECT_URL` 을 비워두면 `DATABASE_URL` 을 쓴다.

## 3. 환경 변수

`.env.example` 이 전체 목록이다. 프로덕션에서 **반드시** 채워야 하는 것:

| 변수 | 없으면 |
|---|---|
| `DATABASE_URL` · `DIRECT_URL` | 앱이 뜨지 않는다 |
| `AUTH_SECRET` | 세션 서명 불가 |
| `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | **로그인 불가.** 그리고 개발 우회로가 프로덕션에서 꺼져 있어 어드민도 못 들어간다 |
| `SUPABASE_SERVICE_ROLE_KEY` | **사진 업로드가 던진다** (D-114 — 프로덕션에서 로컬 저장으로 대체하지 않는다). ⚠️ `NEXT_PUBLIC_` 을 붙이지 말 것 — RLS 를 우회하는 키다 |
| `NEXT_PUBLIC_SITE_URL` | sitemap·hreflang 이 `*.vercel.app` 을 가리킨다 |

`AUTH_APPLE_*` 은 일본 시장용이다 (D-092). 없으면 Apple 버튼만 실패한다.

### OAuth 리디렉트 URI

Google 콘솔에 `https://<도메인>/api/auth/callback/google` 을 등록한다.
**preview 배포는 URL 이 매번 달라 로그인이 안 된다** — 정상이다. preview 에서
로그인을 확인하려면 고정 preview 도메인을 하나 만들어 함께 등록한다.

## 4. 배포 순서 (D-097)

```bash
# ⓪ 스토리지 버킷 (D-114) — 없으면 업로드가 전부 실패하고,
#    사진이 필수라 아이템 등록이 막힌다
pnpm storage:init

# ① 마이그레이션 — DIRECT_URL 로
pnpm db:deploy

# ② 마스터 시드 (카테고리 6 · 속성 정의 14 · 레벨 10)
pnpm prisma db seed

# ③ 브랜드 마스터 290건 (D-044·D-045)
pnpm db:import-brands ../my-heritage-planning/projects/item-catalog/drafts/brand-seed.csv

# ④ 최초 어드민 (D-104 — 화면으로 만들 수 없다)
pnpm admin:add <이메일> "<이름>"
```

그다음은 **운영이 화면에서** 한다:

| 순서 | 화면 | 없으면 |
|:---:|---|---|
| ⑤ | **A-02 카테고리별 속성 조합 + 필수 지정** | **유저가 아이템을 한 건도 등록할 수 없다** (D-097) |
| ⑥ | A-03 매칭 키 지정 | 도감 연결이 안 된다 (옷·자전거·데스크테리어는 D-034 조사 후) |
| ⑦ | A-14 어드민 2명째부터 초대 | — |

> **⑤를 건너뛰면 배포는 성공하는데 서비스가 동작하지 않는다.** 시드가 조합을
> 넣지 않는 것은 의도다 — 조합은 카테고리마다 다르고 운영 판단이다 (D-097).

## 5. 마이그레이션을 빌드에서 돌리지 않는다

`build` 는 `prisma generate && next build` 다. **`migrate deploy` 를 넣지 않았다.**

**이유**: preview 배포가 프로덕션 DB 를 가리키면 **preview 빌드가 프로덕션
스키마를 바꾼다.** 아직 머지되지 않은 브랜치의 마이그레이션이 프로덕션에
적용되는 셈이다. 배포 파이프라인에서 **프로덕션에만** 별도 단계로 돌린다.

## 6. CDN

Vercel Edge Network 가 정적 자산·이미지 최적화를 자동으로 캐시한다. 우리가 정한 것:

| 대상 | 정책 | 근거 |
|---|---|---|
| `/api/brands` | `public, max-age=60, s-maxage=300` | 마스터 데이터. 어드민 변경이 5분 내 반영 |
| `/api/categories/[key]/attributes` | 같음 | 같은 성격 |
| `/api/codex/[id]/owners` | **`private, no-store`** | **차단 관계로 유저마다 값이 다르다** (E-07-07, D-051). 공용 캐시에 올리면 남의 결과가 노출된다 |
| 업로드 이미지 | Supabase Storage CDN + `next/image` | `remotePatterns` 를 **호스트 + 경로**(`/storage/v1/object/public/**`)로 좁혔다 — 호스트만 열면 우리 최적화기가 남의 이미지를 서빙하는 통로가 된다 |

### ⚠️ 페이지는 대부분 CDN 캐시가 걸리지 않는다

`[locale]/(user)/layout.tsx` 가 `isLoggedIn()` 으로 쿠키를 읽어 **그 아래 전 화면이
동적 렌더**다 (OI-60). 색인 대상(홈·마켓·도감)까지 매 요청 렌더된다.

캐시를 살리려면 레이아웃에서 로그인 판정을 빼야 하는데, 그것이 쓰이는 곳은
**알림 벨 노출 하나뿐**이다 (FR-08-A-07). 트레이드오프는 OI-60 에 적어뒀다.

## 7. 배포 후 확인

```bash
curl -s https://<도메인>/api/health          # DB 연결 + 마스터 데이터 상태
curl -s https://<도메인>/robots.txt
curl -s https://<도메인>/sitemap.xml | grep -c '<url>'
```

`/api/health` 가 `ready: false` 를 내면 **어느 단계가 빠졌는지** 알려준다 (⓪~⑤).

**DB 에 닿지 못하면 5초 안에 `503`** 을 낸다. 타임아웃을 두지 않으면 "DB 가
안 된다"를 알려야 하는 엔드포인트가 정작 그 상황에서 **침묵한다** — 실제로
76초를 매달린 적이 있다.

## 8. 로컬 개발 — Supabase 와 docker 를 오간다

기본값은 **docker(5434)** 다. `.env.local` 에 `DATABASE_URL`(런타임)·`DIRECT_URL`
(마이그레이션) 이 명시돼 있다.

> 이 문서는 오래 "기본값은 Supabase" 라고 적혀 있었지만 실제 파일은 docker 를
> 가리키고 있었다 (2026-09-03 확인). `pnpm db:which` 가 사실이고 문서는 참고다.

```bash
pnpm db:which     # 지금 어느 DB 를 보는지 — 앱과 CLI 를 둘 다 찍는다
pnpm dev          # .env.local 의 DATABASE_URL — 기본은 docker
pnpm dev:docker   # 이번 실행만 docker 를 본다
```

> **VPN 을 끄고 써야 한다** (§2). 사내 네트워크는 5432·6543 을 막는다.
> 스토리지는 HTTPS 443 이라 VPN 과 무관하게 항상 동작한다.

Supabase 를 상시로 보려면 `.env.local` 의 `DATABASE_URL` 을 주석 처리한다 — 그러면
`POSTGRES_PRISMA_URL`(풀링) 이 이긴다. ⚠️ `DIRECT_URL` 은 그대로 둔다. 비우면
`POSTGRES_URL_NON_POOLING` 이 이겨서 `pnpm db:migrate` 가 **운영 DB** 에 걸린다.

### ⚠️ Supabase 를 볼 때 달라지는 것 3가지

| 항목 | docker | Supabase |
|---|---|---|
| 로그인 | `seed-dev` 개발 유저로 자동 로그인 | **비로그인** — 그 유저가 없다 |
| `/admin` | 어드민 0명이라 우회로가 연다 | **`DEV_ADMIN_EMAIL` 이 필요**하다 (아래) |
| `pnpm db:seed-dev` | 동작 | **막힌다** — 원격 호스트면 거부한다 (D-097) |

로그인 화면을 로컬에서 확인하려면 **OAuth 자격증명이 있어야 한다.**
`AUTH_GOOGLE_ID` 가 채워지는 순간 `viewer.ts` 의 개발 우회로는 자동으로 꺼지고
진짜 로그인이 유일한 경로가 된다.

### `DEV_ADMIN_EMAIL` — 어드민 진입 (D-117)

④ 로 어드민이 등록되면 개발 우회로(`어드민 0명일 때만`)가 꺼진다. OAuth 가
없으면 로그인도 못 하므로 `/admin` 이 **404 로 닫힌다.** 그런데 ⑤ A-02 속성
조합은 그 화면에서만 만들 수 있다. 그 고리를 끊는 값이다.

```bash
# .env.local
DEV_ADMIN_EMAIL="pax.zee@kakaohealthcare.com"
```

- `NODE_ENV=development` 에서만 작동한다
- **실재하고 `active` 인 `AdminUser` 여야** 사칭된다. 없으면 경고를 찍고 거부
- 조치 로그의 `actorId` 는 **그 실제 어드민** 을 가리킨다 — 감사 기록이 거짓이 되지 않는다
- 진짜 세션이 있으면 그쪽이 이긴다
