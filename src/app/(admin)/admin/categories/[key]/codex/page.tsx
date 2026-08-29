import Link from "next/link";
import { AdminActionButton } from "@/components/admin/action-button";
import { CodexCreateForm } from "@/components/admin/codex-create-form";
import { CodexEditForm } from "@/components/admin/codex-edit-form";
import { CodexResearchPanel } from "@/components/admin/codex-research-panel";
import { AdminListControls } from "@/components/admin/list-controls";
import { Pill, Table, Td } from "@/components/admin/ui";
import { setCodexVerification } from "@/lib/actions/admin";
import { parseListParams } from "@/lib/admin-list-params";
import { botEnabled, claudeConfigured } from "@/lib/bot/guard";
import { getAdminCodexPage, getCodexKeyForms } from "@/lib/data/admin";

/**
 * 카테고리 상세 — 도감 (A-04 카테고리분 흡수, codex F-04 · D-246 · D-248).
 *
 * ⚠️ **운영자가 직접 등록한 도감은 바로 `검증됨` 상태다** (FR-04-A-02).
 * 유저 등록분은 `미검증`으로 시작한다 (D-033) — 검증 배지가 신뢰 신호이므로
 * 출처에 따라 초기 상태가 갈린다.
 *
 * ## ⚠️ 카테고리 셀렉트를 주지 않는다
 * `AdminListControls.categories` 는 optional 이다. 카테고리가 URL 로 고정된
 * 화면에서 셀렉트를 또 주면 **고른 값과 URL 이 어긋난다.**
 *
 * ## ⚠️ 등록 폼도 이 카테고리로 고정한다
 * `CodexCreateForm` 은 `forms` 에서 카테고리 셀렉트를 만든다. 이 카테고리
 * 것만 넘겨 고정한다 — 상세에서는 카테고리가 이미 정해져 있어 선택 단계가
 * 사라지는 것이 D-248 의 실질 이득이다.
 *
 * 도감 명칭은 **원문 1개 고정**이고 번역하지 않는다 (D-009).
 */
export default async function CategoryCodexPage({
  params,
  searchParams,
}: PageProps<"/admin/categories/[key]/codex">) {
  const { key } = await params;
  const listParams = parseListParams(await searchParams);
  const [list, keyForms] = await Promise.all([
    // ⚠️ URL 의 카테고리가 이긴다 — 쿼리의 category 는 덮어쓴다
    getAdminCodexPage({ ...listParams, category: key }),
    getCodexKeyForms(),
  ]);
  // 카테고리당 항상 1건이다 (`getCodexKeyForms` 가 전 카테고리를 낸다)
  const myForms = keyForms.filter((f) => f.categoryKey === key);

  /*
    자료 조사는 **로컬 전용**이다 (D-146·D-185) — 프로덕션 런타임에는 `claude`
    바이너리가 없다. 버튼을 숨기지 않고 이유를 붙여 비활성으로 둔다: 숨기면
    프로덕션 어드민이 "이 기능이 있는지"조차 알 수 없다
  */
  const researchEnabled = botEnabled() && claudeConfigured();
  const researchReason = !botEnabled()
    ? "자료 조사는 로컬 개발 모드에서만 동작합니다"
    : "로컬 claude CLI 를 찾을 수 없습니다 (CLAUDE_CLI_PATH)";

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          운영자가 직접 등록한 도감은 바로 검증됨입니다 (FR-04-A-02). 자료 조사로 등록한
          도감은 미검증입니다.
        </p>
        <CodexCreateForm forms={myForms} />
      </div>

      {/*
        ⚠️ 조사 결과가 식별 값 칼럼만큼 넓은 표라서(자전거는 3칸) 좁은 칸에
        두면 읽을 수 없다 — 본문 위에 둔다
      */}
      <div className="mb-4">
        <CodexResearchPanel
          forms={myForms}
          enabled={researchEnabled}
          disabledReason={researchReason}
        />
      </div>

      {/* categories 를 넘기지 않는다 — 카테고리는 URL 로 고정됐다 */}
      <AdminListControls
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
      />

      <Table head={["명칭 (원문)", "고유값", "검증", "보유자", "조치"]}>
        {list.rows.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.displayName}</Td>
            <Td className="font-mono text-xs">{c.uniqueId}</Td>
            <Td>{c.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}</Td>
            <Td>{c.ownerCount}</Td>
            <Td>
              <span className="flex items-start gap-2 whitespace-nowrap">
                <AdminActionButton
                  label={c.verified ? "미검증으로" : "검증됨으로"}
                  tone={c.verified ? "default" : "primary"}
                  // 되돌리면 검증 일시·검증자를 지운다 (FR-04-B-03·04)
                  confirm={c.verified ? "검증 일시와 검증자 기록이 지워집니다." : undefined}
                  action={setCodexVerification.bind(null, c.id, !c.verified)}
                />
                <CodexEditForm
                  codexId={c.id}
                  displayName={c.displayName}
                  uniqueId={c.uniqueId}
                  verified={c.verified}
                />
                <Link
                  href="/admin/codex/aliases"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  alias
                </Link>
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        도감 명칭은 원문 1개 고정이며 번역하지 않습니다 (D-009). 설명은 검증본만 3개
        언어이고, 미검증본은 유저가 쓴 원문을 그대로 노출합니다 (FR-07-A-05).
      </p>
    </>
  );
}
