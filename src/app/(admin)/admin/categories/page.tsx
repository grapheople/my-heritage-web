import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { setCategoryActive, setCategorySellable } from "@/lib/actions/admin";
import { getAdminCategories } from "@/lib/data/admin";

/**
 * ⚠️ 어드민은 ko 단일이라(D-030) 라벨을 여기 둔다. **카테고리를 추가하면 여기도
 * 추가해야 한다** — `운동` 을 넣을 때 실제로 빠뜨려 빈칸으로 표시됐다 (D-173).
 * key 가 없으면 slug 로 대체해 최소한 무엇인지 보이게 한다.
 */
const LABEL: Record<string, string> = {
  "category.watch": "시계", "category.shoes": "신발", "category.bicycle": "자전거",
  "category.apparel": "옷", "category.camping": "캠핑", "category.deskterior": "데스크테리어",
  "category.workout": "운동",
};

/**
 * A-01 카테고리 관리 (item-catalog F-01).
 *
 * ⚠️ **이 화면에서는 신규 생성·삭제를 허용하지 않는다** (D-007, FR-01-A-02).
 * 카테고리마다 매칭 키·속성 집합·도감 체계가 딸려 있어 임의 추가하면
 * 그 셋이 비어 있는 카테고리가 생긴다 — 추가는 셋을 함께 만드는 스크립트로 한다
 * (`prisma/setup-workout-category.ts` 가 그 예다, D-166). **"6개 고정"은 더 이상
 * 사실이 아니다 — 현재 7개**.
 *
 * **마켓 판매 허용**은 여기서 토글한다 (D-173) — 운동처럼 소유물이 아닌
 * 카테고리는 판매 전환을 막아야 한다.
 *
 * **비활성화만 가능하다** (D-036) — 비활성화하면 **신규 등록만 막히고 기존
 * 아이템은 그대로 조회된다.** 삭제는 없다.
 *
 * 카테고리명은 i18n 리소스에서 온다 (FR-01-A-03) — 여기서 편집하지 않는다.
 * 표시 순서만 어드민이 정한다 (FR-01-A-04).
 */
export default async function AdminCategoriesPage() {
  const categories = await getAdminCategories();
  return (
    <AdminPage
      id="A-01" title="카테고리 관리"
      desc="6개 고정입니다. 추가·삭제할 수 없고 비활성화만 됩니다 (D-007·D-036)."
    >
      <Table head={["순서", "카테고리", "slug", "등록 아이템", "상태", "마켓", "조치"]}>
        {categories.map((c) => (
          <tr key={c.slug} className={c.active ? "" : "text-muted-foreground"}>
            <Td>{c.order}</Td>
            {/* 라벨이 없으면 slug 로 — 빈칸으로 두면 무엇인지 알 수 없다 (D-173) */}
            <Td className="font-semibold">{LABEL[c.labelKey] ?? c.slug}</Td>
            <Td className="font-mono text-xs">{c.slug}</Td>
            <Td>{c.itemCount.toLocaleString("en-US")}</Td>
            <Td>{c.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}</Td>
            <Td>
              {c.sellable ? <Pill tone="sale">판매 가능</Pill> : <Pill>판매 불가</Pill>}
            </Td>
            <Td className="flex flex-wrap gap-2">
              <AdminActionButton
                label={c.active ? "비활성화" : "활성화"}
                // 비활성화해도 기존 아이템은 그대로다 (D-036) — 그래서 확인만 받는다
                confirm={c.active ? "신규 등록이 막힙니다. 기존 아이템은 그대로입니다." : undefined}
                action={setCategoryActive.bind(null, c.slug, !c.active)}
              />
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
                action={setCategorySellable.bind(null, c.slug, !c.sellable)}
              />
            </Td>
          </tr>
        ))}
      </Table>

      <section className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          <b className="text-foreground">비활성화해도 기존 아이템은 사라지지 않습니다.</b>{" "}
          신규 등록만 막히고 조회·수정은 그대로입니다 (D-036).
          카테고리명은 i18n 리소스에서 관리하며 여기서 편집하지 않습니다 (FR-01-A-03).
          <br />
          <b className="text-foreground">판매를 막으면 마켓 조회에서 제외됩니다.</b>{" "}
          이미 판매중이던 매물도 내려가고, 되돌리면 다시 노출됩니다 (D-173).
        </p>
      </section>
    </AdminPage>
  );
}
