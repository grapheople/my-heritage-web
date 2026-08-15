import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
import { CodexAliasEditor } from "@/components/admin/codex-alias-editor";
import { CodexKeyAliasEditor } from "@/components/admin/codex-key-alias-editor";
import { KeyAliasCandidates } from "@/components/admin/key-alias-candidates";
import { getAdminCodex, getCodexKeyAliasCandidates } from "@/lib/data/admin";

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
  const [codex, candidates] = await Promise.all([
    getAdminCodex(),
    getCodexKeyAliasCandidates(),
  ]);
  return (
    <AdminPage
      id="A-07" title="도감 alias 관리"
      desc="명칭 alias 는 검색 전용, 키 alias 는 등록 매칭용입니다 (D-009 · D-192)."
    >
      <section className="mb-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">⚠️ alias 는 두 종류입니다 (D-192)</h2>
        <table className="mt-3 w-full text-left text-xs">
          <thead className="border-b text-muted-foreground">
            <tr><th className="py-1">　</th><th>명칭 alias</th><th>키 alias</th></tr>
          </thead>
          <tbody>
            <tr className="border-b"><td className="py-1">예</td><td><code>サブマリーナ</code></td><td><code>1460</code> → <code>11822006</code></td></tr>
            <tr className="border-b"><td className="py-1">쓰이는 곳</td><td>검색 인덱스</td><td><b>등록 매칭</b> (FR-02-B-05)</td></tr>
            <tr className="border-b"><td className="py-1">언어축</td><td>ko / ja / en</td><td><b>없음</b> — 제품 코드에 언어가 없다</td></tr>
            <tr className="border-b"><td className="py-1">중복</td><td>허용 (FR-06-A-04)</td><td><b>카테고리 안에서 유일</b> (FR-02-B-06)</td></tr>
            <tr><td className="py-1">틀렸을 때</td><td>검색이 조금 넓어진다</td><td className="text-warn"><b>아이템이 엉뚱한 도감에 붙는다</b></td></tr>
          </tbody>
        </table>
      </section>

      <section className="mb-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">키 alias 후보 큐 (FR-06-C-09)</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          <b>등록은 미스였는데 같은 값으로 검색하면 도감이 나온</b> 경우입니다 — 도감은 있는데
          키가 안 맞았다는 뜻이고, <b>유저가 실제로 넣은 값</b>이라 지어낸 값이 아닙니다 (D-198).
          많이 반복될수록 실제 통용 표기일 가능성이 높습니다.
        </p>
        <KeyAliasCandidates candidates={candidates} />
      </section>

      <Table head={["도감 (원문)", "명칭 alias", "키 alias", "조치"]}>
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
              {c.keyAliases.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {c.keyAliases.map((k) => (
                    <Pill key={k.id}>
                      {k.value}
                      {/* 승인 전 AI 제안은 매칭에 쓰이지 않는다 (FR-06-C-05) */}
                      {!k.active && <b className="text-warn"> 승인 대기</b>}
                    </Pill>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">없음</span>
              )}
            </Td>
            <Td>
              <span className="flex gap-2">
                <CodexAliasEditor codexId={c.id} displayName={c.displayName} initial={c.aliasesByLang} />
                <CodexKeyAliasEditor
                  codexId={c.id}
                  displayName={c.displayName}
                  normalizedKey={c.normalizedKey}
                  initial={c.keyAliases}
                />
              </span>
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
