# my-heritage-web

**Zroom** — 취미 수집품을 가상의 방에 전시하고, 남의 방을 들여다보고, 그 물건을 그대로 매물로 전환할 수 있는 컬렉터 커뮤니티.

기획은 별도 레포에 있다: [`my-heritage-planning`](../my-heritage-planning). **기획과 코드가 다르면 기획이 이긴다.**
개발 규칙·정책 요약은 [`CLAUDE.md`](./CLAUDE.md)에 있다.

## 시작하기

```bash
pnpm install
cp .env.example .env      # DATABASE_URL 등을 채운다

pnpm db:local             # 로컬 Postgres (별도 터미널)
pnpm db:migrate           # 마이그레이션 적용
pnpm prisma db seed       # 카테고리 6개 · 공통 속성 14종 · 레벨 테이블

pnpm dev                  # http://localhost:3002
```

- 유저 앱: `/ko` · `/ja` · `/en` (`/`는 `Accept-Language`로 판별 후 리다이렉트)
- 어드민: `/admin` (ko 단일 · 데스크톱 1440)

## 스택

Next.js 16 (App Router · Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui ·
next-intl (ko/ja/en) · Prisma 7 + PostgreSQL · pnpm

## 명령어

| | |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | `prisma generate` + 프로덕션 빌드 |
| `pnpm check` | lint + typecheck |
| `pnpm db:migrate` / `db:deploy` | 마이그레이션 (dev / prod) |
| `pnpm db:studio` | Prisma Studio |

## 현재 상태

라우팅·i18n·데이터 모델 골격까지 구성됐고, **화면은 대부분 미구현**이다.
`ScreenStub`이 렌더되는 페이지가 남은 화면 목록이다:

```bash
rg -l "ScreenStub" src/app
```

디자인은 디자이너 Figma 1차 탐색 대기 상태다. 그 전에는
`../my-heritage-planning/projects/myroom-service/prototype/`의 HTML 프로토타입(45화면)을 참고한다.
