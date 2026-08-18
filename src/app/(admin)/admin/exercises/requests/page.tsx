import { AdminPage, Table, Td } from "@/components/admin/ui";
import { ExerciseRequestActions } from "@/components/admin/exercise-request-actions";
import { getAdminExerciseRequests, getAdminExercises } from "@/lib/data/admin";

/**
 * A-18 운동 요청 큐 (item-catalog F-11 D, D-229).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **요청 건수 순** — 많이 요청된 것이 시드의 구멍이다 | `FR-11-D-05`, D-229 |
 * | 같은 요청은 정규화로 **묶어서 한 번에** 처리 | `FR-11-D-05` |
 * | 승인 시 마스터 등재 + 요청자 알림 | `FR-11-D-04·06` |
 * | **반려 시 기존 운동의 alias 로 흡수** | `FR-11-D-07` |
 *
 * ## ⚠️ 반려로 끝내면 같은 요청이 다시 온다
 * 유저가 `벤치` 로 요청했고 마스터에 `바벨 벤치프레스` 가 있으면, 반려만 하면
 * **다음 유저가 또 `벤치` 로 요청한다.** alias 로 흡수해야 검색이 그것을 잡는다
 * (AC-11-D-07-1). 브랜드 요청(D-047)이 겪은 자리와 같다.
 *
 * ## ⚠️ 이 큐는 계측기다 (D-229)
 * 초기 마스터를 80~120건으로 잡은 것은(D-232) **나머지를 이 큐가 알려줄 것**이기
 * 때문이다. 큐가 비어 있는데 루틴이 안 만들어지면 그것은 다른 문제다.
 *
 * ## ⚠️ 운영에서는 AI 수집이 없다 (D-232, OI-104)
 * 승인할 때 분류를 **손으로** 채운다. 자극부위·장비·복합단일·밀기당기기 4개라
 * 불가능하지 않지만, 요청이 몰리면 병목이다.
 */
export default async function AdminExerciseRequestsPage() {
  // 건수 순 정렬·같은 요청 병합은 조회 계층에서 끝난다 (`FR-11-D-05`)
  const [rows, list] = await Promise.all([
    getAdminExerciseRequests(),
    // 반려 시 지정할 기존 운동 목록 — alias 흡수 대상이다 (`FR-11-D-07`)
    getAdminExercises({ size: 500 }),
  ]);

  return (
    <AdminPage
      id="A-18"
      title="운동 요청 큐"
      desc="요청 건수 순입니다. 이미 있는 운동을 다른 이름으로 요청한 경우 반려하면서 alias 로 흡수하세요 (FR-11-D-07)."
    >
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          대기 중인 요청이 없습니다
        </p>
      ) : (
        <Table head={["요청 운동명", "요청 건수", "최초 요청", "조치"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <Td className="font-semibold">{r.name}</Td>
              {/* 3건 이상이면 시드의 구멍이 분명하다 — 브랜드 큐와 같은 기준 */}
              <Td className={r.count >= 3 ? "font-bold text-warn" : ""}>{r.count}</Td>
              <Td className="whitespace-nowrap">
                {r.firstAt.toISOString().slice(0, 10)}
              </Td>
              <Td>
                <ExerciseRequestActions
                  requestId={r.id}
                  requestedName={r.name}
                  existing={list.rows.map((e) => ({ id: e.id, name: e.name }))}
                />
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        ⚠️ 승인하면 <b>검증됨</b>으로 등재됩니다 — 사람이 판단한 것이므로 A-05 검수 큐를
        늘리지 않습니다. 분류(자극부위 등)를 비워두면 근육맵이 칠해지지 않으니 A-17 에서
        채우세요.
      </p>
    </AdminPage>
  );
}
