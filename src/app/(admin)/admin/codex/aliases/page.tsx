import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
import { getAdminCodex } from "@/lib/data/admin";

/**
 * A-07 도감 alias 관리 (codex F-05, D-009 · D-047).
 *
 * ## alias 는 검색 인덱스 전용이고 화면에 표시되지 않는다
 * 도감 명칭은 **원문 1개 고정**이다 (D-009). alias 는 한국·일본 유저가
 * 자기 언어로 검색해도 찾을 수 있게 하는 장치다.
 *
 * ⚠️ **alias 가 없으면 브랜드·제품이 없는 것으로 오인된다** (D-047).
 * 한국 유저가 "롤렉스 서브마리너"로 검색했는데 안 나오면 도감을 새로
 * 만들어버리고, 그게 다시 병합 큐(A-06)로 온다.
 *
 * alias 로 매칭된 경우 검색 결과에 **어떤 alias 로 일치했는지 표기**한다
 * (`policies/i18n` §2) — 원문이 영문이라 왜 나왔는지 알 수 없기 때문이다.
 */
export default async function AdminCodexAliasesPage() {
  const codex = await getAdminCodex();
  return (
    <AdminPage
      id="A-07" title="도감 alias 관리"
      desc="검색 인덱스 전용입니다. 화면에는 원문만 표시됩니다 (D-009)."
    >
      <Table head={["도감 (원문)", "등록된 alias", "조치"]}>
        {codex.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.displayName}</Td>
            <Td>
              {c.aliases.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {c.aliases.map((a) => <Pill key={a}>{a}</Pill>)}
                </span>
              ) : (
                <span className="text-warn">없음 — 한국어·일본어 검색으로 안 나옵니다</span>
              )}
            </Td>
            <Td>
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-accent">편집</button>
            </Td>
          </tr>
        ))}
      </Table>

      <section className="mt-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">alias 추가</h2>
        <div className="mt-4">
          <TriLingualField label="검색용 별칭" name="alias"
            values={{ ko: "롤렉스 서브마리너", ja: "ロレックス サブマリーナ", en: "sub date" }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          alias 가 비어 있으면 그 언어 유저에게는 <b>도감이 없는 것과 같습니다.</b>
          유저는 새 도감을 만들고, 그것이 다시 병합 큐(A-06)로 옵니다 (D-047).
        </p>
      </section>
    </AdminPage>
  );
}
