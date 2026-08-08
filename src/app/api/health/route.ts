import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  try {
    const [categories, attributeDefs, categoryAttrs, levels, brands, admins] =
      await Promise.all([
        prisma.category.count({ where: { active: true } }),
        prisma.attributeDefinition.count(),
        // ⚠️ 여기가 0 이면 아이템 등록이 불가능하다 (D-097 5단계)
        prisma.categoryAttribute.count({ where: { active: true } }),
        prisma.levelDefinition.count(),
        prisma.brand.count({ where: { active: true } }),
        prisma.adminUser.count({ where: { active: true } }),
      ]);

    /** 출시 순서 각 단계가 끝났는가 (D-097 · D-104) */
    const steps = {
      "① 마이그레이션": true, // 쿼리가 성공했다는 것이 곧 증거다
      "② 마스터 시드": categories === 6 && attributeDefs > 0 && levels > 0,
      "③ 브랜드 import": brands > 0,
      "④ 최초 어드민": admins > 0,
      "⑤ A-02 속성 조합": categoryAttrs > 0,
    };
    const ready = Object.values(steps).every(Boolean);

    return NextResponse.json(
      {
        ready,
        steps,
        counts: { categories, attributeDefs, categoryAttrs, levels, brands, admins },
        // ⑤가 비면 배포는 성공했지만 서비스가 동작하지 않는다
        hint: ready
          ? undefined
          : "DEPLOY.md §4 의 순서를 확인하세요. ⑤가 비면 유저가 아이템을 등록할 수 없습니다 (D-097).",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // 연결 실패 — DATABASE_URL 또는 풀러 설정 문제다
    console.error("[health]", error);
    return NextResponse.json(
      { ready: false, error: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
