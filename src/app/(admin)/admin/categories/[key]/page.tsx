import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionButton } from "@/components/admin/action-button";
import { Pill, StatCard } from "@/components/admin/ui";
import { setCategoryActive, setCategorySellable } from "@/lib/actions/admin";
import { getAdminCategoryDetail } from "@/lib/data/admin";

/**
 * 카테고리 상세 — 개요 (D-246).
 *
 * ## ⚠️ `requiresPhoto`·`userCodexCreation` 은 토글하지 않는다
 * 둘 다 **카테고리의 성질**이지 운영 판단이 아니다 — `sellable` 이 토글인 것과
 * 갈리는 지점이다.
 *
 * - `requiresPhoto` — `FR-07-A-13` 이 **의도적으로 토글을 만들지 않았다.**
 *   잘못 끄면 판매 매물에서 사진이 사라져 거래 신뢰가 무너진다
 * - `userCodexCreation` — D-231. 켜면 **유저 등록이 조용히 도감을 만들기
 *   시작한다.** 운동 도감은 어드민이 준비한다는 전제(D-227·D-228)가 무너진다
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
        <StatCard
          label="하위 종류"
          value={c.subtypeCount}
          href={`/admin/categories/${key}/subtypes`}
        />
        <StatCard
          label="속성"
          value={c.attributeCount}
          href={`/admin/categories/${key}/attributes`}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold">상태</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <span className="text-sm">노출</span>
          {c.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}
          <AdminActionButton
            label={c.active ? "비활성화" : "활성화"}
            // 비활성화해도 기존 아이템은 그대로다 (D-036) — 그래서 확인만 받는다
            confirm={c.active ? "신규 등록이 막힙니다. 기존 아이템은 그대로입니다." : undefined}
            action={setCategoryActive.bind(null, key, !c.active)}
          />

          <span className="ml-6 text-sm">마켓</span>
          {c.sellable ? <Pill tone="sale">판매 가능</Pill> : <Pill>판매 불가</Pill>}
          {/*
            ⚠️ 끄면 **신규 판매 전환이 막히고 기존 매물도 마켓에서 내려간다**
            — 조회 조건이 `sellable` 을 본다 (D-173). 되돌리면 다시 노출된다
          */}
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
            <dd>
              {c.userCodexCreation ? <Pill tone="sale">생성함</Pill> : <Pill>생성 안 함</Pill>}
            </dd>
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
          <Link href="/admin/brands" className="underline">
            브랜드 마스터 (A-11)
          </Link>{" "}
          에서 관리합니다. 연결되지 않은 브랜드는 유저 선택 목록에 없습니다 (D-044).
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.brands.length === 0 ? (
            <span className="text-sm text-muted-foreground">연결된 브랜드가 없습니다</span>
          ) : (
            c.brands.map((b) => <Pill key={b.id}>{b.name}</Pill>)
          )}
        </div>
      </section>
    </>
  );
}
