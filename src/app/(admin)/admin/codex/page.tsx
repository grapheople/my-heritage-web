import Link from "next/link";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { CodexEditForm } from "@/components/admin/codex-edit-form";
import { setCodexVerification } from "@/lib/actions/admin";
import { AdminListControls } from "@/components/admin/list-controls";
import { parseListParams } from "@/lib/admin-list-params";
import { adminCategoryOptions } from "@/lib/admin-categories";
import { getAdminCodexPage } from "@/lib/data/admin";

/**
 * A-04 도감 **전체 검색** (codex F-04).
 *
 * ## ⚠️ 등록·자료 조사는 여기 없다 (D-248)
 * 카테고리 상세 `도감` 탭(`/admin/categories/[key]/codex`)으로 옮겼다 —
 * 거기서는 **카테고리가 이미 정해져 있어** 등록 폼의 카테고리 선택 단계가
 * 사라진다.
 *
 * 이 화면은 **전 카테고리를 횡단해 찾는** 자리로 남는다. 카테고리를 모르는
 * 상태에서 명칭·고유값으로 찾는 경로가 없어지면 안 되기 때문이다.
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
  const [list, categories] = await Promise.all([
    getAdminCodexPage(params),
    adminCategoryOptions(),
  ]);
  const codex = list.rows;

  return (
    <AdminPage
      id="A-04" title="도감 전체 검색"
      desc="전 카테고리 도감을 검색합니다. 등록·자료 조사는 카테고리 상세의 도감 탭에서 합니다 (D-248)."
    >

      <AdminListControls
        categories={categories}
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
      />

      <Table head={["명칭 (원문)", "카테고리", "고유값", "검증", "보유자", "조치"]}>
        {codex.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">
              {/* D-267 — 도감 상세 진입점. alias·키·종류·병합이 한자리에 있다 */}
              <Link
                href={`/admin/codex/${c.id}`}
                className="underline underline-offset-2 hover:text-primary"
              >
                {c.displayName}
              </Link>
            </Td>
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
