import { MatchingKeyEditor } from "@/components/admin/matching-key-editor";
import { Pill, Table, Td } from "@/components/admin/ui";
import { categoryLabelKo } from "@/lib/category-label";
import {
  getAdminMatchingKeys,
  getAdminSubtypes,
  getMatchingKeyCandidates,
} from "@/lib/data/admin";

/**
 * 카테고리 상세 — 매칭 키 (A-03 흡수, codex F-02 · D-013 · D-246).
 *
 * ## 카테고리마다 고유값 체계가 다르다
 * 시계·신발·캠핑은 강한 고유 ID 가 있고, 자전거는 복합 키가 필요하며,
 * **옷은 사실상 없다** (D-013). 그래서 카테고리별로 따로 정의한다.
 *
 * ⚠️ **옷·자전거·데스크테리어는 초안이 검증되지 않았다** (D-034) — PM 액션 대기.
 *
 * 매칭 키로 쓸 수 있는 타입은 `text`/`number`/`select`/`date` 4종뿐이다
 * (D-041) — `multiselect`·`boolean`·`textarea`·`url` 은 동일성 판정에 부적합하다.
 *
 * ⚠️ 운동은 매칭 키가 **빈 배열이고 그것이 정상이다** — 도감을 어드민이
 * 준비하기 때문이다 (D-227·D-228, `userCodexCreation=false`).
 *
 * 변경 이력을 남긴다 (`MatchingKeyChangeLog`) — 키가 바뀌면 기존 연결의
 * 의미가 달라진다.
 */
export default async function CategoryMatchingKeyPage({
  params,
}: PageProps<"/admin/categories/[key]/matching-key">) {
  const { key } = await params;
  const [keys, candidates, subtypes, label] = await Promise.all([
    getAdminMatchingKeys(),
    getMatchingKeyCandidates(),
    getAdminSubtypes(),
    categoryLabelKo(key),
  ]);
  const mk = keys.find((m) => m.category === key);
  const mine = subtypes.filter((s) => s.categoryKey === key);

  return (
    <>
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>옷·자전거·데스크테리어는 초안이 검증되지 않았습니다</b> (D-034 조사 대기).
        조사 결과에 따라 값이 바뀝니다.
      </div>

      <Table head={["대상", "매칭 키", "검증", "조치"]}>
        <tr>
          <Td className="font-semibold">{label}</Td>
          <Td>
            {mk && mk.keys.length > 0 ? (
              <span className="flex gap-1">
                {mk.keys.map((k) => (
                  <Pill key={k} tone="sale">{k}</Pill>
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">없음 — 도감 자동 매칭 불가</span>
            )}
          </Td>
          <Td>{mk?.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}</Td>
          <Td>
            <MatchingKeyEditor
              categoryKey={key}
              categoryLabel={label}
              current={mk?.keys ?? []}
              candidates={candidates}
            />
          </Td>
        </tr>

        {/*
          D-207 — 제품군 전용 매칭 키. **없으면 카테고리 것으로 떨어지므로**
          "카테고리 기본"으로 표시한다. 텐트만 품번을 쓰고 나머지는 카테고리
          규칙을 따르는 상태가 정상이다
        */}
        {mine.map((s) => (
          <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
            <Td className="pl-6 text-sm">
              ↳ <b>{s.labels.ko}</b>
            </Td>
            <Td>
              {s.matchingKeys.length > 0 ? (
                <span className="flex gap-1">
                  {s.matchingKeys.map((k) => (
                    <Pill key={k} tone="sale">{k}</Pill>
                  ))}
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
                categoryKey={key}
                categoryLabel={`${label} · ${s.labels.ko}`}
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
    </>
  );
}
