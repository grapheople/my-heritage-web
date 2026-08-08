import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
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
export default async function AdminBrandsPage() {
  const brands = await getAdminBrands();
  return (
    <AdminPage
      id="A-11" title="브랜드 마스터"
      desc="원문 1개 + 언어별 alias. 자유 텍스트가 아닌 이유는 도감이 언어별로 쪼개지기 때문입니다 (D-043)."
      action={
        <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
          브랜드 추가
        </button>
      }
    >
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>시드가 없습니다.</b> 브랜드 290건 + alias 약 900건이 필요합니다.
        현재 {brands.length}건입니다. alias 가 비면 유저에게는 브랜드가 없는 것으로 보입니다 (D-047). 마스터가 비면 첫 아이템
        등록부터 막힙니다 (D-044·D-045·D-047).
      </div>

      <Table head={["원문 (고정)", "alias", "연결 카테고리", "조치"]}>
        {brands.map((b) => (
          <tr key={b.name}>
            {/* 원문은 번역하지 않는다 — 1개 고정 (D-009) */}
            <Td className="font-semibold">{b.name}</Td>
            <Td>
              <span className="flex flex-wrap gap-1">
                {b.aliases.map((a) => <Pill key={a}>{a}</Pill>)}
              </span>
            </Td>
            <Td className="text-muted-foreground">시계</Td>
            <Td>
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-accent">편집</button>
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
