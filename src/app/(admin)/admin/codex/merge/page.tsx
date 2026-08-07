import { AdminPage, Td } from "@/components/admin/ui";
import { DEV_MERGE_CANDIDATES } from "@/lib/dev-fixture";

/**
 * A-06 도감 병합 큐 (codex F-06).
 *
 * ## 병합은 되돌릴 수 있어야 한다
 * 병합하면 흡수된 도감(loser)에 연결돼 있던 **유저 아이템이 survivor 로
 * 옮겨간다.** 잘못 병합하면 남의 아이템이 엉뚱한 제품에 붙는다.
 * 되돌리기가 없으면 수동 복구가 불가능하다.
 *
 * ⚠️ 병합 결과는 **소유자에게 알림으로 통지**된다 (D-087, FR-08-B-04) —
 * 아이템 명칭이 바뀌기 때문이다 (D-073 파생값).
 *
 * 흡수된 도감의 상세로 접근하면 **survivor 로 이동**한다 (E-07-04, FR-05-B-05).
 *
 * ## 어느 쪽을 남길지가 판단 지점이다
 * 보유자가 많은 쪽을 남기는 게 보통이지만, **표기가 정확한 쪽**이 다를 수 있다.
 * 자동 판정하지 않고 비교 화면에서 운영자가 고른다.
 */
export default function AdminCodexMergePage() {
  return (
    <AdminPage
      id="A-06" title="도감 병합 큐"
      desc="병합하면 유저 아이템이 survivor 로 옮겨갑니다. 되돌리기가 가능해야 합니다."
    >
      <div className="flex flex-col gap-4">
        {DEV_MERGE_CANDIDATES.map((m) => (
          <div key={m.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                유사도 <span className="font-mono">{(m.similarity * 100).toFixed(0)}%</span>
              </p>
              <span className="flex gap-2">
                <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
                  다른 제품임 (병합 안 함)
                </button>
              </span>
            </div>

            {/* 비교 — 어느 쪽을 남길지 고른다 */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                { name: m.a, owners: m.aOwners, side: "A" },
                { name: m.b, owners: m.bOwners, side: "B" },
              ].map((s) => (
                <div key={s.side} className="rounded-md border p-3">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    보유자 {s.owners}명
                  </p>
                  <button className="mt-3 w-full rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground">
                    이쪽을 남기고 병합
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              보유자가 많은 쪽이 항상 정답은 아닙니다 — <b>표기가 정확한 쪽</b>을
              남기세요. 병합 시 흡수되는 쪽의 아이템 {Math.min(m.aOwners, m.bOwners)}건이
              옮겨가고, 소유자에게 알림이 갑니다 (D-087).
            </p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-bold">최근 병합 이력</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                {["남긴 도감", "흡수된 도감", "옮겨간 아이템", "일시", "조치"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <Td className="font-semibold">Omega Speedmaster Professional 3570.50</Td>
                <Td className="text-muted-foreground">OMEGA Speedmaster 3570-50</Td>
                <Td>12</Td>
                <Td className="whitespace-nowrap">2026-08-05</Td>
                <Td>
                  {/* 되돌리기가 없으면 수동 복구가 불가능하다 */}
                  <button className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent">
                    되돌리기
                  </button>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-3 text-xs text-muted-foreground">
        흡수된 도감의 상세로 접근하면 남긴 도감으로 이동합니다 (E-07-04).
        재계산 배치의 트리거·모니터링 주체는 아직 미정입니다 (OI-36).
      </p>
    </AdminPage>
  );
}
