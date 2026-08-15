import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { MatchingKeyEditor } from "@/components/admin/matching-key-editor";
import { adminCategoryOptions } from "@/lib/admin-categories";
import { getAdminMatchingKeys, getAdminSubtypes, getMatchingKeyCandidates } from "@/lib/data/admin";

/**
 * A-03 매칭 키 정의 (codex F-02, D-013).
 *
 * ## 6개 카테고리가 하나의 매칭 방식을 공유할 수 없다
 * 시계·신발·캠핑은 강한 고유 ID 가 있고, 자전거는 복합 키가 필요하며,
 * **옷은 사실상 없다** (D-013). 그래서 카테고리별로 매칭 키를 따로 정의한다.
 *
 * ⚠️ **옷·자전거·데스크테리어는 매칭 키 초안이 검증되지 않았다** (D-034).
 * 조사 결과에 따라 이 화면의 값이 바뀐다 — PM 액션 대기.
 *
 * 매칭 키로 쓸 수 있는 타입은 `text`/`number`/`select`/`date` 4종뿐이다
 * (D-041) — `multiselect`·`boolean`·`textarea`·`url` 은 동일성 판정에 부적합하다.
 *
 * 변경 이력을 남긴다 (`MatchingKeyChangeLog`) — 키가 바뀌면 기존 연결의
 * 의미가 달라지기 때문이다.
 */
export default async function AdminMatchingKeysPage() {
  const [keys, candidates, categories, subtypes] = await Promise.all([
    getAdminMatchingKeys(),
    getMatchingKeyCandidates(),
    adminCategoryOptions(),
    getAdminSubtypes(),
  ]);
  /*
    ⚠️ **라벨 맵을 화면마다 만들지 않는다.** 같은 함정을 네 번 만났다 —
    D-173(A-01 이 운동을 빈칸으로) · D-182(A-11 이 전 브랜드를 "시계"로) ·
    D-185(도감 화면 두 곳이 `workout` 을 그대로 렌더) · 그리고 이 화면의
    A-03 은 **운동이 아예 목록에 없었다**. `adminCategoryOptions()` 하나만 쓴다
  */
  const label = new Map(categories.map((c) => [c.key, c.label]));

  return (
    <AdminPage
      id="A-03" title="매칭 키 정의"
      desc="카테고리마다 고유값 체계가 다릅니다 (D-013). text·number·select·date 4종만 매칭 키로 쓸 수 있습니다 (D-041)."
    >
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>옷·자전거·데스크테리어는 초안이 검증되지 않았습니다</b> (D-034 조사 대기).
        조사 결과에 따라 값이 바뀝니다.
      </div>

      <Table head={["카테고리", "매칭 키", "검증", "조치"]}>
        {keys.map((m) => (
          <tr key={m.category}>
            <Td className="font-semibold">{label.get(m.category) ?? m.category}</Td>
            <Td>
              {m.keys.length > 0 ? (
                <span className="flex gap-1">
                  {m.keys.map((k) => <Pill key={k} tone="sale">{k}</Pill>)}
                </span>
              ) : (
                <span className="text-muted-foreground">없음 — 도감 자동 매칭 불가</span>
              )}
            </Td>
            <Td>
              {m.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}
            </Td>
            <Td>
              <MatchingKeyEditor
                  categoryKey={m.category}
                  categoryLabel={label.get(m.category) ?? m.category}
                  current={m.keys}
                  candidates={candidates}
                />
            </Td>
          </tr>
        ))}

        {/*
          D-207 — 제품군 전용 매칭 키. **없으면 카테고리 것으로 떨어지므로**
          "카테고리 기본"으로 표시한다. 텐트만 품번을 쓰고 나머지는 카테고리
          규칙을 따르는 상태가 정상이다
        */}
        {subtypes.map((s) => (
          <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
            <Td className="pl-6 text-sm">
              ↳ {label.get(s.categoryKey) ?? s.categoryKey} · <b>{s.labels.ko}</b>
            </Td>
            <Td>
              {s.matchingKeys.length > 0 ? (
                <span className="flex gap-1">
                  {s.matchingKeys.map((k) => <Pill key={k} tone="sale">{k}</Pill>)}
                </span>
              ) : (
                <span className="text-muted-foreground">— 카테고리 기본을 따름</span>
              )}
            </Td>
            <Td>
              <Pill tone="warn">미검증</Pill>
            </Td>
            <Td>
              <MatchingKeyEditor
                categoryKey={s.categoryKey}
                categoryLabel={`${label.get(s.categoryKey) ?? s.categoryKey} · ${s.labels.ko}`}
                current={s.matchingKeys}
                candidates={candidates}
                subtypeId={s.id}
              />
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        매칭 키를 바꾸면 기존 도감 연결의 의미가 달라지므로 변경 이력을 남깁니다.
        옷처럼 매칭 키가 없는 카테고리는 도감 자동 연결이 되지 않고, 유저가
        &ldquo;고유값을 모르겠어요&rdquo;로 등록하는 것과 같은 상태가 됩니다 (D-032).
      </p>
    </AdminPage>
  );
}
