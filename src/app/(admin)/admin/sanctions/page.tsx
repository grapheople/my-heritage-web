import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { liftSanction } from "@/lib/actions/admin";
import { SanctionForm } from "@/components/admin/sanction-form";
import {
  getAdminSanctions,
  resolveReportTargetUser,
  searchSanctionTargets,
} from "@/lib/data/admin";

const LEVEL: Record<string, { label: string; tone: "muted" | "warn" | "danger" }> = {
  WARNING: { label: "경고", tone: "muted" },
  SUSPENDED: { label: "일시 정지", tone: "warn" },
  BANNED: { label: "영구 정지", tone: "danger" },
};
/**
 * 제재 사유 라벨 — 어드민은 **ko 단일**이다 (D-030).
 * 유저 화면(S-21)은 같은 enum 을 3개 언어 i18n 리소스로 번역한다 (D-103).
 */
const REASON: Record<string, string> = {
  FAKE: "위조품", STOLEN: "도난품", WEAPON: "무기류",
  DRUG: "의약품·마약류", ALCOHOL: "주류", NON_PHYSICAL: "실물 없는 상품",
  PHISHING: "사기·피싱 링크", INAPPROPRIATE: "부적절한 콘텐츠",
  WRONG_INFO: "정보 오류", REPEATED: "반복 위반", OTHER: "기타",
};

/**
 * A-10 유저·방 제재 (myroom-service F-07, D-064~D-067).
 *
 * ## ⚠️ 제재 이전 공개 상태를 반드시 보존한다 (D-065, FR-07-B-03)
 *
 * 제재로 방을 비공개 전환한 뒤 해제하면서 **무조건 공개로 되돌리면 원래
 * 비공개였던 방이 노출된다.** `previousRoomVisibility` 에 저장해둔 값으로
 * 복원한다. 강제 전환값으로 원본을 덮어쓰면 안 된다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 3단계 — 경고 / 일시 정지 / 영구 정지 | D-064 |
 * | **경고 누적 자동 승격 없음** — 어드민 판단 | FR-07-A-06 |
 * | 정지 유저도 로그인 허용 | D-066, FR-07-C-01 |
 * | 콘텐츠를 삭제하지 않는다. 이력 보존 | D-065 |
 * | 판매중 아이템에 별도 로직 없음 — 공개 판정으로 자연히 빠진다 | FR-07-B-05 |
 */
export default async function AdminSanctionsPage({
  searchParams,
}: PageProps<"/admin/sanctions">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  // 신고 처리에서 넘어온 경우 대상을 미리 고른다 (FR-05-A-09)
  const reportTarget =
    typeof sp.targetType === "string" && typeof sp.targetId === "string"
      ? await resolveReportTargetUser(sp.targetType, sp.targetId)
      : null;

  const [sanctions, targets, preselectList] = await Promise.all([
    getAdminSanctions(),
    searchSanctionTargets(q),
    reportTarget ? searchSanctionTargets(reportTarget.roomName) : Promise.resolve([]),
  ]);
  const preselected = preselectList.find((t) => t.userId === reportTarget?.userId);

  return (
    <AdminPage
      id="A-10" title="유저·방 제재"
      desc="경고 / 일시 정지 / 영구 정지. 콘텐츠는 삭제하지 않고 이력을 남깁니다 (D-065)."

    >
      <SanctionForm targets={targets} query={q} preselected={preselected} />

      <div className="mt-6">
      <Table head={["방", "단계", "사유", "기간", "제재 이전 공개 상태", "적용일", "조치"]}>
        {sanctions.map((s) => {
          const lv = LEVEL[s.level];
          return (
            <tr key={s.id}>
              <Td className="font-semibold">{s.roomName}</Td>
              <Td><Pill tone={lv.tone}>{lv.label}</Pill></Td>
              <Td>
                {REASON[s.reasonCode] ?? s.reasonCode}
                {s.detail && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.detail}</span>
                )}
              </Td>
              <Td className="whitespace-nowrap">{s.until ?? "기한 없음"}</Td>
              {/* ⚠️ 해제 시 이 값으로 복원한다 (D-065) */}
              <Td>
                <Pill tone={s.previousRoomVisibility === "PUBLIC" ? "sale" : "muted"}>
                  {s.previousRoomVisibility === "PUBLIC" ? "공개" : "비공개"}
                </Pill>
              </Td>
              <Td className="whitespace-nowrap">{s.issuedAt}</Td>
              <Td>
                {s.lifted ? (
                  <span className="text-xs text-muted-foreground">해제됨</span>
                ) : (
                  <AdminActionButton
                    label="해제"
                    // ⚠️ 방 공개 상태를 **제재 이전 값으로** 복원한다 (D-065, M-12).
                    // 무조건 공개로 돌리면 원래 비공개였던 방이 열린다
                    confirm={`해제하면 방이 ${s.previousRoomVisibility === "PUBLIC" ? "공개" : "비공개"}로 복원됩니다.`}
                    action={liftSanction.bind(null, s.id)}
                  />
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
      </div>

      <section className="mt-6 rounded-lg border border-warn bg-warn-bg p-4">
        <h2 className="text-sm font-bold text-warn">해제 시 주의</h2>
        <p className="mt-1 text-sm text-warn">
          제재를 해제할 때 방 공개 상태는 <b>제재 이전 값</b>으로 되돌립니다.
          무조건 공개로 되돌리면 원래 비공개였던 방이 노출됩니다 (D-065).
        </p>
      </section>

      <p className="mt-3 text-xs text-muted-foreground">
        경고 누적으로 자동 승격하지 않습니다 — 임계값이 신고 사유의 경중을
        구분하지 못하기 때문입니다 (FR-07-A-06). 어드민이 판단합니다.
      </p>
    </AdminPage>
  );
}
