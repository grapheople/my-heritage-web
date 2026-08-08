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
| `BLOB_READ_WRITE_TOKEN` | **사진 업로드가 던진다** (D-101 — 프로덕션에서 로컬 저장으로 대체하지 않는다) |
| `NEXT_PUBLIC_SITE_URL` | sitemap·hreflang 이 `*.vercel.app` 을 가리킨다 |

`AUTH_APPLE_*` 은 일본 시장용이다 (D-092). 없으면 Apple 버튼만 실패한다.

### OAuth 리디렉트 URI

Google 콘솔에 `https://<도메인>/api/auth/callback/google` 을 등록한다.
**preview 배포는 URL 이 매번 달라 로그인이 안 된다** — 정상이다. preview 에서
로그인을 확인하려면 고정 preview 도메인을 하나 만들어 함께 등록한다.

## 4. 배포 순서 (D-097)

```bash
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
| 업로드 이미지 | Blob CDN + `next/image` | `next.config.ts` `remotePatterns` 에 Blob 호스트만 허용 |

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

`/api/health` 가 `ready: false` 를 내면 4단계 중 무엇이 빠졌는지 알려준다.
