import { AdminPage, StatCard } from "@/components/admin/ui";
import { getAdminQueues } from "@/lib/data/admin";

/**
 * A-13 운영 대시보드 (D-072).
 *
 * ## 무엇을 넣고 무엇을 뺐는가
 * **운영 큐 상태만** 넣는다. 유저 행동 지표(도감 히트율·비공개 비율·판매중
 * 비율 등 20여 개)는 **이벤트 로깅 스키마만 정의하고 외부 분석 도구에 맡긴다**
 * (D-072) — 지표 20개를 화면으로 만드는 것은 어드민 화면 12개를 만드는 것과
 * 비슷한 부피이고, 기간·세그먼트 분해 유연성이 없다.
 *
 * 이 화면이 없으면 "관측만"이라고 적어둔 큐 5종을 **볼 곳이 없다.**
 */
export default async function AdminDashboardPage() {
  const q = await getAdminQueues();
  return (
    <AdminPage
      id="A-13"
      title="운영 대시보드"
      desc="처리 대기 중인 큐만 봅니다. 유저 행동 지표는 외부 분석 도구에서 봅니다 (D-072)."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="병합 후보" value={q.mergeCandidates} href="/admin/codex/merge" warn />
        <StatCard label="미검증 도감" value={q.unverifiedCodex} href="/admin/codex/verification" warn />
        <StatCard label="미처리 신고" value={q.pendingReports} href="/admin/reports" warn />
        <StatCard label="브랜드 요청" value={q.pendingBrandRequests} href="/admin/brands/requests" warn />
        <StatCard label="제재 중" value={q.activeSanctions} href="/admin/sanctions" />
      </div>

      <section className="mt-8 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-bold">여기 없는 지표</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          도감 히트율 · 아이템 비공개 비율 · 판매중 비율 등 유저 행동 지표는
          이벤트 로깅으로 수집해 외부 도구에서 봅니다. 로깅 스키마는 아직
          정의되지 않았습니다 (OI-33).
        </p>
      </section>
    </AdminPage>
  );
}
