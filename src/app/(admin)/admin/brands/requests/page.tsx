import { AdminPage, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { resolveBrandRequest } from "@/lib/actions/admin";
import { getAdminBrandRequests } from "@/lib/data/admin";

const CAT: Record<string, string> = {
  watch: "시계", shoes: "신발", bicycle: "자전거",
  apparel: "옷", camping: "캠핑", deskterior: "데스크테리어",
};

/**
 * A-12 브랜드 요청 큐 (item-catalog F-09, D-046).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **요청 건수 순으로 정렬** | FR-09-B-01 |
 * | 승인 시 마스터 등재 + 카테고리 연결 | FR-09-B-02 |
 * | 승인 시 **원문 표기를 어드민이 교정** | FR-09-B-03, D-043 |
 * | 승인 완료 시 요청자에게 알림 → 도감 연결 유도 | FR-09-B-04 → `Notification`(D-087) |
 *
 * ⚠️ **기존 브랜드의 alias 로 흡수하는 선택지가 필요하다.** 유저가 "롤렉스"로
 * 요청했는데 `Rolex` 가 이미 있으면, 새 브랜드를 만들 게 아니라 alias 로
 * 넣어야 한다 (D-047). 새로 만들면 같은 브랜드가 2개가 된다.
 */
export default async function AdminBrandRequestsPage() {
  // 건수 순 정렬·같은 요청 병합은 조회 계층에서 끝난다 (FR-09-A-06·B-01)
  const rows = await getAdminBrandRequests();
  return (
    <AdminPage
      id="A-12" title="브랜드 요청 큐"
      desc="요청 건수 순입니다. 승인 시 원문 표기를 교정할 수 있습니다 (FR-09-B-03)."
    >
      <Table head={["요청 브랜드명", "카테고리", "요청 건수", "최초 요청", "조치"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="font-semibold">{r.name}</Td>
            <Td>{CAT[r.category]}</Td>
            <Td className={r.count >= 3 ? "font-bold text-warn" : ""}>{r.count}</Td>
            <Td className="whitespace-nowrap">{r.requestedAt}</Td>
            <Td>
              <span className="flex items-start gap-2 whitespace-nowrap">
                <AdminActionButton
                  label="승인"
                  tone="primary"
                  // ⚠️ 승인 후 A-11 에서 **alias 를 반드시 넣어야 한다** (D-047).
                  // 없으면 유저가 "롤렉스"로 검색해 못 찾고 또 요청을 보낸다
                  confirm="마스터에 등재됩니다. 승인 후 A-11 에서 alias 를 넣으세요."
                  action={resolveBrandRequest.bind(null, { requestId: r.id, approve: true })}
                />
                <AdminActionButton
                  label="반려"
                  action={resolveBrandRequest.bind(null, {
                    requestId: r.id,
                    approve: false,
                    note: "마스터 등재 기준 미달",
                  })}
                />
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-muted-foreground">
        ⚠️ 이미 있는 브랜드를 다른 표기로 요청한 경우 <b>새로 만들지 말고 alias 로
        흡수</b>하세요. 새로 만들면 같은 브랜드가 2개가 되어 도감이 갈라집니다 (D-047).
      </p>
    </AdminPage>
  );
}
