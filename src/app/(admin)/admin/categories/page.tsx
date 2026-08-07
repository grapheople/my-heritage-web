import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { DEV_ADMIN_CATEGORIES } from "@/lib/dev-fixture";

const LABEL: Record<string, string> = {
  "category.watch": "시계", "category.shoes": "신발", "category.bicycle": "자전거",
  "category.apparel": "옷", "category.camping": "캠핑", "category.deskterior": "데스크테리어",
};

/**
 * A-01 카테고리 관리 (item-catalog F-01).
 *
 * ⚠️ **6개 고정이다. 신규 생성·삭제를 허용하지 않는다** (D-007, FR-01-A-02).
 * 카테고리마다 매칭 키·속성 집합·도감 체계가 딸려 있어 임의 추가하면
 * 그 셋이 비어 있는 카테고리가 생긴다.
 *
 * **비활성화만 가능하다** (D-036) — 비활성화하면 **신규 등록만 막히고 기존
 * 아이템은 그대로 조회된다.** 삭제는 없다.
 *
 * 카테고리명은 i18n 리소스에서 온다 (FR-01-A-03) — 여기서 편집하지 않는다.
 * 표시 순서만 어드민이 정한다 (FR-01-A-04).
 */
export default function AdminCategoriesPage() {
  return (
    <AdminPage
      id="A-01" title="카테고리 관리"
      desc="6개 고정입니다. 추가·삭제할 수 없고 비활성화만 됩니다 (D-007·D-036)."
    >
      <Table head={["순서", "카테고리", "slug", "등록 아이템", "상태", "조치"]}>
        {DEV_ADMIN_CATEGORIES.map((c) => (
          <tr key={c.slug} className={c.active ? "" : "text-muted-foreground"}>
            <Td>{c.order}</Td>
            <Td className="font-semibold">{LABEL[c.labelKey]}</Td>
            <Td className="font-mono text-xs">{c.slug}</Td>
            <Td>{c.itemCount.toLocaleString("en-US")}</Td>
            <Td>{c.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}</Td>
            <Td>
              <button className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent">
                {c.active ? "비활성화" : "활성화"}
              </button>
            </Td>
          </tr>
        ))}
      </Table>

      <section className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          <b className="text-foreground">비활성화해도 기존 아이템은 사라지지 않습니다.</b>{" "}
          신규 등록만 막히고 조회·수정은 그대로입니다 (D-036).
          카테고리명은 i18n 리소스에서 관리하며 여기서 편집하지 않습니다 (FR-01-A-03).
        </p>
      </section>
    </AdminPage>
  );
}
