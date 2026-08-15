import Link from "next/link";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { CodexCreateForm } from "@/components/admin/codex-create-form";
import { CodexEditForm } from "@/components/admin/codex-edit-form";
import { CodexResearchPanel } from "@/components/admin/codex-research-panel";
import { botEnabled, claudeConfigured } from "@/lib/bot/guard";
import { setCodexVerification } from "@/lib/actions/admin";
import { AdminListControls } from "@/components/admin/list-controls";
import { parseListParams } from "@/lib/admin-list-params";
import { adminCategoryOptions } from "@/lib/admin-categories";
import { getAdminCodexPage, getCodexKeyForms } from "@/lib/data/admin";

/**
 * A-04 도감 목록 · 직접 등록 · 편집 (codex F-04).
 *
 * ⚠️ **운영자가 직접 등록한 도감은 바로 `검증됨` 상태다** (FR-04-A-02).
 * 유저 등록분은 `미검증`으로 시작한다 (D-033) — 검증 배지가 신뢰 신호이므로
 * 출처에 따라 초기 상태가 갈린다.
 *
 * 도감 명칭은 **원문 1개 고정**이고 번역하지 않는다 (D-009).
 * 설명은 검증본만 3개 언어다 (FR-07-A-05) — A-05 검증 큐에서 입력한다.
 */
export default async function AdminCodexPage({
  searchParams,
}: PageProps<"/admin/codex">) {
  const params = parseListParams(await searchParams);
  const [list, keyForms, categories] = await Promise.all([
    getAdminCodexPage(params),
    getCodexKeyForms(),
    adminCategoryOptions(),
  ]);
  const codex = list.rows;
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
    <AdminPage
      id="A-04" title="도감 목록"
      desc="운영자가 직접 등록한 도감은 바로 검증됨 상태입니다 (FR-04-A-02). 자료 조사로 등록한 도감은 미검증입니다."
      action={<CodexCreateForm forms={keyForms} />}
    >
      {/*
        ⚠️ 헤더 `action` 슬롯이 아니라 **본문 위**에 둔다. 조사 결과가 식별 값
        칼럼만큼 넓은 표라서(자전거는 3칸) 헤더의 좁은 칸에서는 읽을 수 없다
      */}
      <div className="mb-4">
        <CodexResearchPanel
          forms={keyForms}
          enabled={researchEnabled}
          disabledReason={researchReason}
        />
      </div>

      <AdminListControls
        categories={categories}
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
      />

      <Table head={["명칭 (원문)", "카테고리", "고유값", "검증", "보유자", "조치"]}>
        {codex.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.displayName}</Td>
            <Td>{c.categoryLabel}</Td>
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
                <Link href="/admin/codex/aliases"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent">alias</Link>
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        도감 명칭은 원문 1개 고정이며 번역하지 않습니다 (D-009). 설명은 검증본만
        3개 언어이고, 미검증본은 유저가 쓴 원문을 그대로 노출합니다 (FR-07-A-05).
      </p>
    </AdminPage>
  );
}
