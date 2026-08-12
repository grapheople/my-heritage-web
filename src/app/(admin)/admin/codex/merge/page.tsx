import { AdminPage, Pill, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { mergeCodex, undoMergeCodex } from "@/lib/actions/admin";
import { getAdminMergeHistory, getCodexMergeCandidates } from "@/lib/data/admin";

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
 *
 * ## ⚠️ 자동 후보 제안은 아직 없다 (OI-58)
 * D-016 은 "어드민 수동 실행 + **시스템 자동 후보 제안**"을 요구하는데,
 * 유사도 계산 로직이 존재하지 않는다. **유사도를 지어내 채우지 않는다** —
 * 화면이 동작하는 것처럼 보이면 미구현 사실이 묻힌다.
 */
/** 어드민은 ko 단일이다 (D-030) */
const REASON: Record<string, string> = {
  sameUniqueId: "고유값 같음",
  sameName: "명칭 같음",
  prefix: "접두 일치",
};
const CATEGORY_LABEL: Record<string, string> = {
  watch: "시계", shoes: "신발", bicycle: "자전거",
  apparel: "옷", camping: "캠핑", deskterior: "데스크테리어", workout: "운동",
};

/** 검증 배지·보유자 수까지 보여준다 — survivor 판단의 근거다 */
function describe(c: { name: string; uniqueId: string; verified: boolean; items: number }) {
  return (
    <span className="block">
      <b className="font-semibold">{c.name}</b>
      {c.verified && <Pill tone="sale">검증</Pill>}
      <span className="block text-xs text-muted-foreground">
        {c.uniqueId || "고유값 없음"} · 아이템 {c.items}건
      </span>
    </span>
  );
}

export default async function AdminCodexMergePage() {
  const [history, candidates] = await Promise.all([
    getAdminMergeHistory(),
    getCodexMergeCandidates(),
  ]);
  return (
    <AdminPage
      id="A-06" title="도감 병합 큐"
      desc="병합하면 유저 아이템이 survivor 로 옮겨갑니다. 되돌리기가 가능해야 합니다."
    >
      {/*
        병합 후보 제안 (D-181, OI-58 해소).
        ⚠️ **유사도 점수를 발명하지 않았다** — 등록·검색과 같은 정규화(D-014)로
        "같은 고유값 / 같은 명칭 / 한쪽이 접두" 세 가지만 제안한다. 애매한 쌍은
        제안하지 않는다 — 놓치는 것이 잘못 합치는 것보다 싸다(병합은 아이템을 옮긴다).
        ⚠️ **survivor 를 시스템이 고르지 않는다** (D-016 — 어드민 수동 실행).
        검증 배지·보유자 수를 보고 사람이 정하도록 양쪽 버튼을 준다.
      */}
      <section>
        <h2 className="text-sm font-bold">
          병합 후보
          <span className="ml-2 font-normal text-muted-foreground">
            {candidates.length}쌍
          </span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          같은 카테고리에서 <b className="text-foreground">고유값이 같거나 · 명칭이
          같거나 · 한쪽이 다른 쪽의 접두</b>인 쌍입니다 (등록·검색과 같은 정규화, D-014).
          <b className="text-foreground"> 남길 쪽을 직접 고르세요</b> — 아이템이 그쪽으로 옮겨갑니다.
        </p>

        {candidates.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            후보가 없습니다.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  {["근거", "카테고리", "도감 A", "도감 B", "조치"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((c) => (
                  <tr key={`${c.a.id}:${c.b.id}`}>
                    <Td><Pill tone={c.reason === "prefix" ? undefined : "warn"}>{REASON[c.reason]}</Pill></Td>
                    <Td className="whitespace-nowrap">{CATEGORY_LABEL[c.categoryKey] ?? c.categoryKey}</Td>
                    <Td>{describe(c.a)}</Td>
                    <Td>{describe(c.b)}</Td>
                    <Td className="flex flex-wrap gap-2">
                      {/* 남기는 쪽 = survivor. 아이템이 그쪽으로 옮겨간다 */}
                      <AdminActionButton
                        label="A 를 남긴다"
                        confirm={`"${c.b.name}" 의 아이템 ${c.b.items}건이 "${c.a.name}" 로 옮겨갑니다. 되돌릴 수 있습니다.`}
                        action={mergeCodex.bind(null, { survivorId: c.a.id, absorbedIds: [c.b.id] })}
                      />
                      <AdminActionButton
                        label="B 를 남긴다"
                        confirm={`"${c.a.name}" 의 아이템 ${c.a.items}건이 "${c.b.name}" 로 옮겨갑니다. 되돌릴 수 있습니다.`}
                        action={mergeCodex.bind(null, { survivorId: c.b.id, absorbedIds: [c.a.id] })}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
              {history.length === 0 ? (
                <tr>
                  <Td className="text-muted-foreground">아직 병합 이력이 없습니다.</Td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id}>
                    <Td className="font-semibold">{h.survivor}</Td>
                    <Td className="text-muted-foreground">{h.absorbed}</Td>
                    <Td>{h.absorbedOwners}</Td>
                    <Td className="whitespace-nowrap">—</Td>
                    <Td>
                      <AdminActionButton
                        label="되돌리기"
                        // ⚠️ 도감은 살아나지만 **이관된 아이템은 돌아오지 않는다**
                        // — 어디서 왔는지 기록하지 않기 때문이다 (OI-62)
                        confirm="도감만 복구됩니다. 옮겨간 아이템은 수동으로 되돌려야 합니다 (OI-62)."
                        action={undoMergeCodex.bind(null, h.id)}
                      />
                    </Td>
                  </tr>
                ))
              )}
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
