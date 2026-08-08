import Link from "next/link";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { ReportActions } from "@/components/admin/report-actions";
import { getAdminReports } from "@/lib/data/admin";

const REASON_LABEL: Record<string, string> = {
  fake: "가품·모조품", stolen: "도난품", weapon: "무기·위험물",
  drug: "의약품·마약류", alcohol: "주류·담배", nonphysical: "실물 없는 상품",
  phishing: "사기·피싱 링크", inappropriate: "부적절한 콘텐츠", wrongInfo: "정보 오류",
};
const TARGET_LABEL: Record<string, string> = {
  item: "아이템", diary: "기록", room: "방", codex: "도감", link: "외부 링크",
};

/**
 * A-08 신고 처리 (market F-05).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **누적 신고가 많으면 상단에** | FR-05-A-07 |
 * | 어드민이 아이템·기록을 **비공개 처리**할 수단 | FR-05-A-05 |
 * | 조치 이력(조치자·일시·사유) 보존 | FR-05-A-06 |
 * | **제재 화면으로 이동하는 경로** | FR-05-A-09, D-064 |
 * | 신고자에게 인앱 결과 통지 | FR-05-A-08 → `Notification`(D-087) |
 *
 * ⚠️ **경고만 하고 콘텐츠를 잊는 문제**가 열려 있다 (OI-37) — 경고 단계와
 * 콘텐츠 조치가 연동되지 않아 위반물이 남을 수 있다. 지금은 두 액션을
 * 나란히 두는 것으로만 완화한다.
 */
export default async function AdminReportsPage() {
  // 누적 건수 내림차순, 미처리 우선 (FR-05-A-07)
  const rows = [...(await getAdminReports())].sort(
    (a, b) =>
      Number(b.status === "PENDING") - Number(a.status === "PENDING") ||
      b.count - a.count,
  );

  return (
    <AdminPage
      id="A-08" title="신고 처리"
      desc="접수해도 콘텐츠는 자동으로 숨겨지지 않습니다 (FR-05-A-04). 조치는 여기서 합니다."
    >
      <Table head={["대상", "내용", "사유", "누적", "상태", "접수일", "조치"]}>
        {rows.map((r) => (
          <tr key={r.id} className={r.status === "PENDING" ? "" : "text-muted-foreground"}>
            <Td><Pill>{TARGET_LABEL[r.target]}</Pill></Td>
            <Td className="max-w-[280px] truncate">{r.targetName}</Td>
            <Td>{REASON_LABEL[r.reason]}</Td>
            <Td className={r.count >= 3 ? "font-bold text-warn" : ""}>{r.count}</Td>
            <Td>
              {r.status === "PENDING"
                ? <Pill tone="warn">미처리</Pill>
                : <Pill tone="sale">처리됨</Pill>}
            </Td>
            <Td className="whitespace-nowrap">{r.createdAt}</Td>
            <Td>
              {r.status === "PENDING" && (
                <span className="flex items-start gap-2 whitespace-nowrap">
                  <ReportActions reportId={r.id} />
                  {/* 유저 제재로 이동 (FR-05-A-09, D-064) */}
                  <Link href="/admin/sanctions"
                    className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                    제재 →
                  </Link>
                </span>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        ⚠️ 경고 단계와 콘텐츠 조치가 자동으로 연동되지 않습니다. 경고만 하고
        콘텐츠를 두면 위반물이 남습니다 (OI-37).
      </p>
    </AdminPage>
  );
}
