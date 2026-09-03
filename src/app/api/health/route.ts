import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readMigrationState } from "@/lib/migration-status";
import { BUCKET, isRemoteStorageConfigured, storageClient } from "@/lib/storage";

/**
 * 배포 후 확인용 (`DEPLOY.md` §7).
 *
 * ## ⚠️ 단순한 "DB 살아있음"이 아니다
 * **D-097 출시 순서 의존성**을 확인한다. 마이그레이션만 하고 배포하면 앱은
 * 뜨는데 **유저가 아이템을 한 건도 등록할 수 없다** — 카테고리↔속성 조합이
 * 비어 있기 때문이다. 그 상태를 배포 직후에 알아야 한다.
 *
 * ## ⚠️ 무엇을 노출하지 않는가
 * 유저 수·아이템 수 같은 **영업 지표를 내지 않는다.** 인증 없이 접근 가능한
 * 엔드포인트이므로 "출시 준비가 됐는가"에 필요한 최소만 낸다. 연결 문자열·
 * 버전·스택 정보도 내지 않는다 — 공격 표면을 넓힐 이유가 없다.
 */
export const dynamic = "force-dynamic";

/**
 * ⚠️ **빨리 실패해야 한다.**
 *
 * DB 에 닿지 못하면 Prisma 는 기본 타임아웃까지 기다린다. 그러면 헬스체크가
 * **응답하지 않고 매달린다** — "DB 가 안 된다"를 알려야 하는 엔드포인트가
 * 정작 그 상황에서 침묵하는 셈이다. 실제로 그렇게 됐다 (사내 네트워크가
 * Postgres 포트를 차단, D-113).
 *
 * 배포 파이프라인·모니터링이 이걸 폴링하므로 상한을 명시한다.
 */
const TIMEOUT_MS = 5_000;

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${TIMEOUT_MS}ms)`)), TIMEOUT_MS),
    ),
  ]);
}

export async function GET() {
  try {
    const [
      categories,
      categoriesWithAttrs,
      attributeDefs,
      categoryAttrs,
      levels,
      brands,
      admins,
      migrations,
    ] = await withTimeout(
      Promise.all([
        prisma.category.count({ where: { active: true } }),
        /**
         * ⚠️ **카테고리마다** 속성 조합이 있는가 (D-097 5단계).
         *
         * 전체 개수만 보면(예전 판정) 카테고리 하나가 조합 없이 추가돼도
         * 통과한다 — 그 카테고리에서는 유저가 아이템을 등록할 수 없는데도.
         */
        prisma.category.count({
          where: { active: true, attributes: { some: { active: true } } },
        }),
        prisma.attributeDefinition.count(),
        prisma.categoryAttribute.count({ where: { active: true } }),
        prisma.levelDefinition.count(),
        prisma.brand.count({ where: { active: true } }),
        prisma.adminUser.count({ where: { active: true } }),
        /**
         * ⚠️ 이것만 실패해도 나머지 판정은 살려야 한다 — `_prisma_migrations`
         * 가 없는 DB(생성 직후)에서 헬스체크 전체가 죽으면 안 된다.
         */
        readMigrationState().catch(() => null),
      ]),
      "database",
    );

    /**
     * 배포-마이그레이션 순서 사고 (2026-09-03).
     *
     * ⚠️ **`pending` 만 판정에 넣는다.** 코드가 기대하는 마이그레이션이 DB 에
     * 없으면 그 컬럼을 읽는 화면이 전부 죽는다 — 치명적이다. 반대로 DB 가
     * 앞선 경우(`unknown`, 코드를 되돌린 배포)는 보통 여분 컬럼이 남아 있을
     * 뿐이라 서비스는 돈다. 그래서 세지만 `ready` 를 내리지는 않고 노출만 한다.
     */
    const migrationsReady = migrations !== null && migrations.pending.length === 0;
    if (migrations === null) {
      console.error("[health] _prisma_migrations 를 읽지 못했다");
    } else if (migrations.pending.length > 0) {
      // 응답에는 이름을 내지 않는다 (스키마 정보) — 로그로만 남긴다
      console.error("[health] 미적용 마이그레이션:", migrations.pending.join(", "));
    }

    /**
     * 스토리지 버킷 (D-114). **없으면 업로드가 전부 실패하고**, 아이템은 사진
     * 1장이 필수라(D-037) 유저가 아무것도 등록할 수 없다 — A-02 조합과 같은
     * 성격의 블로커다.
     *
     * 설정 자체가 없으면(로컬 파일시스템 모드) 확인 대상이 아니다.
     */
    let storageReady: boolean | undefined;
    if (isRemoteStorageConfigured()) {
      try {
        const { data, error } = await withTimeout(
          storageClient().storage.listBuckets(),
          "storage",
        );
        storageReady = !error && !!data?.some((b) => b.name === BUCKET);
      } catch {
        // 스토리지가 안 되는 것과 DB 가 안 되는 것은 다른 문제다 — 구분해서 낸다
        storageReady = false;
      }
    }

    /** 출시 순서 각 단계가 끝났는가 (D-097 · D-104 · D-114) */
    const steps = {
      // ⚠️ 하드코딩 true 였다 — 그래서 2026-09-03 사고를 통과시켰다
      "① 마이그레이션": migrationsReady,
      /**
       * ⚠️ **카테고리 수를 코드에 박지 않는다.** 예전 판정은 `categories === 6`
       * 이었는데 등산·운동이 추가되어 8개가 되자 영구히 `false` 였다 —
       * `ready` 가 계속 내려가 있어 신호로서 죽어 있었다.
       *
       * `sellable`·`requiresPhoto`·`userCodexCreation` 이 "카테고리를 코드에
       * 열거하지 않는다"로 정해진 것과 같은 이유다 (D-173·D-231·D-253).
       * 완전성은 아래 ⑤가 **카테고리마다** 본다.
       */
      "② 마스터 시드": categories > 0 && attributeDefs > 0 && levels > 0,
      "③ 브랜드 import": brands > 0,
      "④ 최초 어드민": admins > 0,
      "⑤ A-02 속성 조합": categories > 0 && categoriesWithAttrs === categories,
      // 로컬 파일시스템 모드면 해당 없음 — true 로 둔다
      "⑥ 스토리지 버킷": storageReady ?? true,
    };
    const ready = Object.values(steps).every(Boolean);

    return NextResponse.json(
      {
        ready,
        steps,
        counts: {
          categories,
          categoriesWithAttrs,
          attributeDefs,
          categoryAttrs,
          levels,
          brands,
          admins,
          // 이름은 내지 않는다 — 개수만으로 순서 사고를 판단할 수 있다
          migrations: migrations
            ? {
                expected: migrations.expected,
                applied: migrations.applied,
                pending: migrations.pending.length,
                unknown: migrations.unknown.length,
              }
            : null,
        },
        storage: isRemoteStorageConfigured() ? BUCKET : "local-filesystem",
        // ⑤가 비면 배포는 성공했지만 서비스가 동작하지 않는다
        hint: ready
          ? undefined
          : "DEPLOY.md §4 의 순서를 확인하세요. ①이 비면 마이그레이션을 적용하지 않고 배포된 상태입니다 — 해당 컬럼을 읽는 화면이 500 입니다. ⑤가 비면 그 카테고리에 유저가 아이템을 등록할 수 없습니다 (D-097).",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // 연결 실패 — DATABASE_URL 또는 풀러 설정 문제다
    console.error("[health]", error);
    return NextResponse.json(
      {
        ready: false,
        error: "database unreachable",
        // 원인 추적용 최소 정보 — 연결 문자열은 절대 내지 않는다
        detail: error instanceof Error && error.message.includes("timeout")
          ? "timeout — 네트워크가 Postgres 포트를 막고 있을 수 있다 (D-113)"
          : undefined,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
