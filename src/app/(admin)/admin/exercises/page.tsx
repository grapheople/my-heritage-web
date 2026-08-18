import { AdminActionButton } from "@/components/admin/action-button";
import { AdminListControls } from "@/components/admin/list-controls";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import {
  ExerciseCreateForm,
  ExerciseEditForm,
  ExerciseResearchPanel,
  type ExerciseOptions,
} from "@/components/admin/exercise-forms";
import { botEnabled, claudeConfigured } from "@/lib/bot/guard";
import { deleteExercise, setExerciseActive } from "@/lib/actions/admin-exercise";
import { getAdminExercises } from "@/lib/data/admin";
import { parseListParams } from "@/lib/admin-list-params";
import { prisma } from "@/lib/prisma";

/**
 * A-17 운동 마스터 (item-catalog F-11, D-227·D-228·D-232).
 *
 * ## ⚠️ 운동 도감은 이 화면에서만 생긴다
 * 다른 카테고리의 도감은 **유저 등록**이 만든다 (D-032). 운동 카테고리는
 * `userCodexCreation = false` 라(D-231) 그 경로가 통째로 건너뛴다 — 여기서 넣지
 * 않으면 유저는 **루틴에 담을 것이 없다** (E-11-01).
 *
 * ## ⚠️ A-04(도감 등록)와 다른 화면인 이유
 * 도감 등록은 **매칭 키**(브랜드·고유번호)를 채우는 폼이다. 운동은 매칭 키가
 * 없고(`FR-10-A-02`) 채울 것이 **자극부위·장비**다 — 같은 폼에 넣으면 카테고리
 * 분기가 폼 안으로 들어온다.
 *
 * ## ⚠️ AI 수집은 로컬 전용, 수동 등록·수정은 운영에서도 (D-232)
 * `NODE_ENV=development` + `claude` CLI 를 요구한다 (`FR-11-B-09`). 운영에서는
 * 패널이 이유를 표시한 비활성 상태로 뜨고, 등록·수정 버튼은 그대로 동작한다
 * (`FR-11-B-10`) — 요청 큐 승인이 손 작업이 되는 대가다 (OI-104).
 */
export default async function AdminExercisesPage({
  searchParams,
}: PageProps<"/admin/exercises">) {
  const params = parseListParams(await searchParams);
  const [list, options] = await Promise.all([
    getAdminExercises(params),
    exerciseOptions(),
  ]);

  const enabled = botEnabled() && claudeConfigured();
  const disabledReason = !botEnabled()
    ? "운영 환경입니다"
    : !claudeConfigured()
      ? "claude CLI 를 찾을 수 없습니다"
      : undefined;

  const label = (opts: { key: string; label: string }[], key: string | null) =>
    key ? (opts.find((o) => o.key === key)?.label ?? key) : "—";

  return (
    <AdminPage
      id="A-17"
      title="운동 마스터"
      desc="루틴이 담는 운동입니다. 운동은 아이템이 아니라 어드민 데이터이고, 운동 카테고리의 도감이 곧 이 목록입니다 (D-227·D-228)."
      action={<ExerciseCreateForm options={options} />}
    >
      <AdminListControls
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
      />

      <div className="mt-4">
        <ExerciseResearchPanel
          enabled={enabled}
          disabledReason={disabledReason}
          options={options}
        />
      </div>

      {/*
        ⚠️ **조건부 경고다** (D-183). 늘 켜져 있는 경고는 읽히지 않는다.
        자극부위가 없으면 근육맵이 아무것도 칠하지 못해 루틴 카드가 빈 실루엣이
        된다 — AI 수집분에서 생기기 쉬운 상태다
      */}
      {list.missingMusclesTotal > 0 && (
        <p className="mt-4 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          자극부위가 비어 있는 운동 <b>{list.missingMusclesTotal}건</b> — 그 운동이 담긴
          루틴은 근육맵이 빈 실루엣으로 뜹니다 (FR-10-D-01)
        </p>
      )}

      <div className="mt-4">
        <Table
          head={[
            "운동명",
            "자극부위",
            "장비",
            "복합/단일",
            "밀기/당기기",
            "검수",
            "사용",
            "상태",
            "",
          ]}
        >
          {list.rows.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <Td>
                <div className="font-semibold">{e.name}</div>
                {/* alias 를 함께 보여준다 — 요청 큐 처리에서 이 값으로 찾는다 (D-192) */}
                {e.aliases.length > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    alias: {e.aliases.join(", ")}
                  </div>
                )}
                <ExerciseEditForm
                  exerciseId={e.id}
                  name={e.name}
                  fields={{
                    targetMuscles: e.targetMuscles,
                    equipmentType: e.equipmentType ?? "",
                    mechanic: e.mechanic ?? "",
                    forceType: e.forceType ?? "",
                    referenceUrl: e.referenceUrl ?? "",
                  }}
                  options={options}
                />
              </Td>
              <Td>
                {e.targetMuscles.length === 0 ? (
                  // 빈 값을 **드러낸다** — 빈칸이면 무엇이 문제인지 알 수 없다
                  <Pill tone="warn">없음</Pill>
                ) : (
                  e.targetMuscles.map((m) => label(options.muscles, m)).join(", ")
                )}
              </Td>
              <Td>{label(options.equipment, e.equipmentType)}</Td>
              <Td>{label(options.mechanics, e.mechanic)}</Td>
              <Td>{label(options.forces, e.forceType)}</Td>
              <Td>
                {e.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}
              </Td>
              <Td>{e.usage > 0 ? `${e.usage}개 루틴` : "0"}</Td>
              <Td>{e.active ? <Pill tone="sale">활성</Pill> : <Pill>비활성</Pill>}</Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <AdminActionButton
                    action={setExerciseActive.bind(null, e.id, !e.active)}
                    label={e.active ? "비활성화" : "활성화"}
                    confirm={
                      e.active
                        ? "비활성화하면 새로 담을 수 없습니다. 이미 담긴 루틴에서는 유지됩니다 (FR-10-B-08)"
                        : undefined
                    }
                  />
                  {/*
                    ⚠️ **사용 중이면 삭제 버튼을 아예 주지 않는다** (`FR-11-A-08`).
                    눌러서 실패하는 버튼은 어드민에게 "왜 안 되지"를 남긴다
                  */}
                  {e.usage === 0 && (
                    <AdminActionButton
                      action={deleteExercise.bind(null, e.id)}
                      label="삭제"
                      tone="danger"
                      confirm="이 운동과 도감을 함께 지웁니다. 되돌릴 수 없습니다"
                    />
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </div>
    </AdminPage>
  );
}

/**
 * 분류 선택지 — **DB 에서 읽는다** (D-227 `FR-11-A-05`).
 *
 * ⚠️ 화면에 하드코딩하면 어드민이 A-04 에서 선택지를 고쳐도 이 폼만 옛 목록으로
 * 남는다. 라벨은 **ko** 를 쓴다 — 어드민 UI 는 ko 단일이다 (D-030).
 */
async function exerciseOptions(): Promise<ExerciseOptions> {
  const rows = await prisma.attributeOption.findMany({
    where: {
      attributeDefinition: {
        key: { in: ["targetMuscle", "equipmentType", "mechanic", "forceType"] },
      },
      active: true,
    },
    orderBy: { displayOrder: "asc" },
    select: { key: true, labelKo: true, attributeDefinition: { select: { key: true } } },
  });
  const pick = (attr: string) =>
    rows
      .filter((r) => r.attributeDefinition.key === attr)
      .map((r) => ({ key: r.key, label: r.labelKo || r.key }));
  return {
    muscles: pick("targetMuscle"),
    equipment: pick("equipmentType"),
    mechanics: pick("mechanic"),
    forces: pick("forceType"),
  };
}
