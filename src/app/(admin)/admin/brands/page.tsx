import { AdminActionButton } from "@/components/admin/action-button";
import { setBrandActive } from "@/lib/actions/admin";
import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
import { BrandAliasEditor, BrandCreateForm } from "@/components/admin/brand-forms";
import { getAdminBrands } from "@/lib/data/admin";

/**
 * A-11 브랜드 마스터 (item-catalog F-08, D-043 · D-047).
 *
 * ## 브랜드가 자유 텍스트면 도감이 언어별로 쪼개진다
 * `Snow Peak` · `스노우피크` · `スノーピーク` 가 각각 다른 브랜드가 되어
 * 같은 제품의 도감이 3개로 갈라진다 (D-043). 그래서 마스터 + `select` 다.
 *
 * ## alias 가 없으면 브랜드가 없는 것으로 오인된다 (D-047)
 * 한국 유저가 "롤렉스"로 검색해도 `Rolex` 가 나와야 한다. 안 나오면 브랜드
 * 추가 요청을 보내고, 어드민이 그걸 또 처리해야 한다.
 *
 * ⚠️ **시드 290건 + alias 약 900건이 아직 없다.** 지금 5건은 개발용이다 —
 * 시드 없이 출시하면 첫 아이템 등록부터 막힌다 (PM 액션 대기).
 */
/** 어드민은 ko 단일이다 (D-030) */
const CATEGORY_LABEL: Record<string, string> = {
  watch: "시계", shoes: "신발", bicycle: "자전거",
  apparel: "옷", camping: "캠핑", deskterior: "데스크테리어", workout: "운동",
};

export default async function AdminBrandsPage() {
  const brands = await getAdminBrands();
  return (
    <AdminPage
      id="A-11" title="브랜드 마스터"
      desc="원문 1개 + 언어별 alias. 자유 텍스트가 아닌 이유는 도감이 언어별로 쪼개지기 때문입니다 (D-043)."
      action={
        <BrandCreateForm />
      }
    >
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>시드가 없습니다.</b> 브랜드 290건 + alias 약 900건이 필요합니다.
        현재 {brands.length}건입니다. alias 가 비면 유저에게는 브랜드가 없는 것으로 보입니다 (D-047). 마스터가 비면 첫 아이템
        등록부터 막힙니다 (D-044·D-045·D-047).
      </div>

      <Table head={["원문 (고정)", "alias", "연결 카테고리", "상태", "조치"]}>
        {brands.map((b) => (
          <tr key={b.name}>
            {/* 원문은 번역하지 않는다 — 1개 고정 (D-009) */}
            <Td className="font-semibold">{b.name}</Td>
            <Td>
              <span className="flex flex-wrap gap-1">
                {b.aliases.map((a) => <Pill key={a}>{a}</Pill>)}
              </span>
            </Td>
            {/*
              ⚠️ 예전에는 여기에 **"시계" 가 하드코딩**돼 있었다 (D-182). 브랜드
              마스터는 카테고리별이라(D-044) 전 브랜드가 시계로 보이면 어드민이
              어디에 붙었는지 알 수 없다
            */}
            <Td className="text-muted-foreground">
              {b.categoryKeys.length === 0
                ? "연결 없음"
                : b.categoryKeys.map((k) => CATEGORY_LABEL[k] ?? k).join(" · ")}
            </Td>
            <Td>
              {b.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}
            </Td>
            <Td className="flex flex-wrap gap-2">
              <BrandAliasEditor brandId={b.id} brandName={b.name} initial={b.aliasesByLang} />
              {/*
                ⚠️ **삭제가 아니라 비활성화다** (D-036·D-043). 비활성화하면 신규
                등록 선택지에서만 빠지고 **이미 이 브랜드로 등록된 아이템은 그대로**
                남는다 — 지우면 그 아이템들이 브랜드를 잃는다
              */}
              <AdminActionButton
                label={b.active ? "비활성화" : "활성화"}
                confirm={
                  b.active
                    ? "신규 등록·브랜드 선택에서 빠집니다. 이미 이 브랜드로 등록된 아이템은 그대로 남습니다."
                    : undefined
                }
                action={setBrandActive.bind(null, b.id, !b.active)}
              />
            </Td>
          </tr>
        ))}
      </Table>

      <section className="mt-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">브랜드 추가 · 편집</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <span className="text-sm font-semibold">
              원문 <span className="text-destructive">*</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                번역하지 않습니다 — 1개 고정 (D-009)
              </span>
            </span>
            <input defaultValue="Rolex" className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          {/* alias 는 언어별로 받는다 — 검색 인덱스 전용이고 화면에 표시되지 않는다 */}
          <TriLingualField label="alias (검색용)" name="alias"
            values={{ ko: "롤렉스", ja: "ロレックス", en: "rolex" }} />
        </div>
      </section>
    </AdminPage>
  );
}
