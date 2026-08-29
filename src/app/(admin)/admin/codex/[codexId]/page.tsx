import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionButton } from "@/components/admin/action-button";
import { CodexAliasEditor } from "@/components/admin/codex-alias-editor";
import { CodexEditForm } from "@/components/admin/codex-edit-form";
import { CodexKeyAliasEditor } from "@/components/admin/codex-key-alias-editor";
import { CodexResearchAgain } from "@/components/admin/codex-research-again";
import { CodexSubtypePicker } from "@/components/admin/codex-subtype";
import { AdminPage, Pill } from "@/components/admin/ui";
import { setCodexVerification } from "@/lib/actions/admin";
import { categoryLabelKo } from "@/lib/category-label";
import { botEnabled, claudeConfigured } from "@/lib/bot/guard";
import { categoryFields, matchingKeyFields } from "@/lib/bot/fields";
import { getAdminCodexDetail, getAdminSubtypes } from "@/lib/data/admin";

/**
 * 도감 상세 (A-04 하위, D-267).
 *
 * ## ⚠️ 흩어진 편집을 한자리로 모은다
 * 명칭은 목록 모달, 종류는 카테고리 상세 탭, alias 는 A-07 — **화면 네 곳**에
 * 흩어져 있었다. A-05 에서 "이게 맞나" 를 판단하려면 함께 봐야 한다.
 *
 * ## ⚠️ 고유값은 편집 대상이 아니다
 * `normalizedKey` 가 바뀌면 유일성 범위(`@@unique([scopeId, normalizedKey])`)와
 * `CodexMatchKey` 의 PRIMARY 행, **이미 연결된 유저 아이템의 매칭 의미**가 함께
 * 움직인다. 값이 틀렸으면 **병합(A-06)이 올바른 도구**다 — 옳은 도감으로
 * 흡수시키면 아이템도 함께 옮겨간다 (D-181).
 *
 * ## ⚠️ 재수집은 제안만 하고 검증을 건드리지 않는다
 * D-185 가 "조사분은 미검증" 을 이 기능의 핵심 판단으로 뒀다. 검증완료는
 * **사람이 따로 누른다** (D-269).
 */
export default async function AdminCodexDetailPage({
  params,
}: PageProps<"/admin/codex/[codexId]">) {
  const { codexId } = await params;
  const c = await getAdminCodexDetail(codexId);
  if (!c) notFound();

  const [categoryLabel, allSubtypes] = await Promise.all([
    categoryLabelKo(c.categoryKey),
    getAdminSubtypes(),
  ]);
  const subtypes = allSubtypes
    .filter((s) => s.categoryKey === c.categoryKey && s.active)
    .map((s) => ({ key: s.key, label: s.labels.ko }));

  /*
    현재 식별 값을 라벨과 함께 낸다 — 재수집 제안과 나란히 비교하기 위해서다.
    ⚠️ 라벨은 A-03 설정에서 온다. 화면에 박으면 매칭 키를 바꾼 순간 어긋난다
  */
  const fields = await categoryFields(c.categoryKey, c.subtypeKey ?? undefined);
  const keyFields = matchingKeyFields(fields);
  const primary = c.matchKeys.find((k) => k.kind === "PRIMARY")?.value ?? c.normalizedKey;
  const parts = primary.split("");
  const currentKeys = keyFields.map((f, i) => ({
    key: f.key,
    label: f.label,
    value: parts[i] ?? "",
  }));

  /*
    자료 조사는 **로컬 전용**이다 (D-146·D-185) — 프로덕션 런타임에 `claude`
    바이너리가 없다. 숨기지 않고 이유를 붙여 비활성으로 둔다
  */
  const researchEnabled = botEnabled() && claudeConfigured() && keyFields.length > 0;
  const researchReason = !botEnabled()
    ? "자료 조사는 로컬 개발 모드에서만 동작합니다"
    : !claudeConfigured()
      ? "로컬 claude CLI 를 찾을 수 없습니다 (CLAUDE_CLI_PATH)"
      : "이 카테고리는 매칭 키가 없어 재조사할 수 없습니다 (A-03)";

  return (
    <AdminPage
      id="A-04"
      title={c.displayName}
      desc={`${categoryLabel}${c.subtypeLabel ? ` · ${c.subtypeLabel}` : ""} · 보유자 ${c.ownerCount}명`}
      action={
        <AdminActionButton
          label={c.verified ? "미검증으로" : "검증완료"}
          tone={c.verified ? "default" : "primary"}
          // 되돌리면 검증 일시·검증자를 지운다 (FR-04-B-03·04)
          confirm={c.verified ? "검증 일시와 검증자 기록이 지워집니다." : undefined}
          action={setCodexVerification.bind(null, c.id, !c.verified)}
        />
      }
    >
      {/* ── 병합 상태 — 먼저 알려야 나머지 편집이 헛수고가 안 된다 ── */}
      {c.mergedInto && (
        <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
          <b>이 도감은 병합되어 흡수됐습니다.</b> 살아남은 도감은{" "}
          <Link href={`/admin/codex/${c.mergedInto.id}`} className="underline">
            {c.mergedInto.displayName}
          </Link>{" "}
          입니다 — 여기서 고쳐도 유저에게 보이지 않습니다. 되돌리기는{" "}
          <Link href="/admin/codex/merge" className="underline">
            병합 큐 (A-06)
          </Link>
          에서 합니다.
        </div>
      )}

      {/* ── 기본 정보 ── */}
      <section>
        <h2 className="text-sm font-bold">기본</h2>
        <dl className="mt-3 grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">카테고리</dt>
            <dd>{categoryLabel}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">종류</dt>
            <dd>
              {subtypes.length > 0 ? (
                <CodexSubtypePicker
                  codexId={c.id}
                  current={c.subtypeKey}
                  subtypes={subtypes}
                />
              ) : (
                <span className="text-muted-foreground">— 이 카테고리는 종류가 없습니다</span>
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">검증</dt>
            <dd>
              {c.verified ? <Pill tone="sale">검증됨</Pill> : <Pill tone="warn">미검증</Pill>}
              {c.verified && c.verifiedBy && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.verifiedBy} · {c.verifiedAt?.toISOString().slice(0, 10)}
                </span>
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">보유자</dt>
            <dd>{c.ownerCount}명</dd>
          </div>
        </dl>

        {/*
          ⚠️ 고유값은 **읽기 전용**이다 (D-267). 바꾸면 유일성 범위·매칭 키·
          이미 연결된 아이템의 매칭 의미가 함께 움직인다
        */}
        <div className="mt-3 rounded-lg border border-dashed p-4">
          <p className="text-xs font-semibold">식별 값 (읽기 전용)</p>
          <table className="mt-2 text-sm">
            <tbody>
              {currentKeys.map((k) => (
                <tr key={k.key}>
                  <td className="py-0.5 pr-4 text-xs text-muted-foreground">{k.label}</td>
                  <td className="py-0.5 font-mono text-xs">{k.value || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            식별 값은 여기서 고치지 않습니다. 바꾸면 이미 이 도감에 연결된 아이템의
            매칭 의미가 달라집니다 — 값이 틀렸다면{" "}
            <Link href="/admin/codex/merge" className="underline">
              병합 (A-06)
            </Link>
            으로 옳은 도감에 흡수시키세요.
          </p>
        </div>
      </section>

      {/* ── 재수집 ── */}
      <section className="mt-8">
        <h2 className="text-sm font-bold">재수집</h2>
        <div className="mt-3 rounded-lg border p-4">
          <CodexResearchAgain
            codexId={c.id}
            currentName={c.displayName}
            currentKeys={currentKeys}
            enabled={researchEnabled}
            disabledReason={researchReason}
          />
        </div>
      </section>

      {/* ── 명칭·설명 ── */}
      <section className="mt-8">
        <h2 className="text-sm font-bold">명칭 · 설명</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          도감 명칭은 <b>원문 1개 고정</b>이며 번역하지 않습니다 (D-009). 설명은{" "}
          <b>검증본만 3개 언어</b>이고, 미검증본의 설명 자리는 <b>유저가 쓴 원문</b>
          입니다 (FR-07-A-05) — 어드민 문장을 넣으면 유저가 쓴 것으로 읽힙니다.
        </p>
        <CodexEditForm
          codexId={c.id}
          displayName={c.displayName}
          uniqueId={c.uniqueId}
          verified={c.verified}
        />
        {!c.verified && c.userDescription && (
          <div className="mt-3 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold">유저가 쓴 설명 (읽기 전용)</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{c.userDescription}</p>
          </div>
        )}
      </section>

      {/* ── alias ── */}
      <section className="mt-8">
        <h2 className="text-sm font-bold">alias</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          <b>언어 alias</b> 는 검색용입니다 — 한국 유저가 &ldquo;롤렉스&rdquo;로 찾아도
          나오게 합니다 (D-047). <b>키 alias</b> 는 매칭용이라 등록 시 도감 연결에
          직접 쓰입니다 (D-192·D-197).
        </p>
        <div className="flex flex-wrap gap-2">
          <CodexAliasEditor
            codexId={c.id}
            displayName={c.displayName}
            initial={c.aliasesByLang}
          />
          <CodexKeyAliasEditor
            codexId={c.id}
            displayName={c.displayName}
            normalizedKey={c.normalizedKey}
            initial={c.matchKeys
              .filter((k) => k.kind === "ALIAS")
              .map((k) => ({
                id: k.id,
                value: k.value,
                source: k.source,
                active: k.approved,
              }))}
          />
        </div>

        <div className="mt-3 rounded-lg border p-4">
          <p className="text-xs font-semibold">매칭에 쓰이는 값 {c.matchKeys.length}건</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.matchKeys.map((k) => (
              <span key={k.id} className="flex items-center gap-1">
                <Pill tone={k.kind === "PRIMARY" ? "sale" : "muted"}>{k.value}</Pill>
                {/* AI 제안은 승인돼야 매칭에 쓰인다 (FR-06-C-05) */}
                {!k.approved && <Pill tone="warn">승인 대기</Pill>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 병합 이력 ── */}
      {c.mergedFrom.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold">흡수한 도감 {c.mergedFrom.length}건</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.mergedFrom.map((m) => (
              <Link
                key={m.id}
                href={`/admin/codex/${m.id}`}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
              >
                {m.displayName}
              </Link>
            ))}
          </div>
        </section>
      )}
    </AdminPage>
  );
}
