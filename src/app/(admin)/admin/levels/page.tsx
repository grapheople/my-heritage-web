import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { getAdminLevels } from "@/lib/data/admin";
import { DAILY_EXP_CAP, EXP_RULES } from "@/lib/data/level";

const REASON: Record<string, string> = {
  login: "로그인", item: "아이템 등록", diary: "기록 쓰기",
};

/**
 * A-09 레벨 테이블 관리 (leveling F-02).
 *
 * ## ⚠️ 요구 경험치를 올릴 수 없다 (D-058 × D-061)
 * 레벨은 **하락하지 않는다** (D-058, FR-01-C-02). 그런데 테이블의 요구
 * 경험치를 올리면 **이미 그 레벨인 유저가 아래로 떨어진다** — 단조 증가가
 * 깨진다. 그래서 사실상 **읽기 전용에 가깝다.**
 *
 * 내릴 수는 있다 (유저 레벨이 오르기만 하므로). 올리려면 기존 유저를
 * 예외 처리하는 마이그레이션이 필요한데, 그건 결정 사항이다.
 *
 * ## 경험치 규칙은 코드 상수다
 * 로그인 10 · 아이템 30 · 기록 20, 각 1일 1회, 상한 60 (D-026).
 * 어드민이 바꾸지 않는다 — 바꾸면 이미 쌓인 경험치의 의미가 달라진다.
 *
 * ⚠️ 현재 seed 값은 **자리만 잡은 것**이다. 확정 곡선으로 교체해야 한다.
 */
export default async function AdminLevelsPage() {
  const levels = await getAdminLevels();
  return (
    <AdminPage
      id="A-09" title="레벨 테이블 관리"
      desc="레벨은 하락하지 않으므로(D-058) 요구 경험치를 올릴 수 없습니다."
    >
      <div className="mb-4 rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
        <b>요구 경험치를 올리면 기존 유저의 레벨이 떨어집니다.</b> 레벨 단조
        증가(D-058)가 깨지므로 상향은 막혀 있습니다. 내리는 것만 가능합니다.
        <br />
        현재 값은 <b>자리만 잡은 초안</b>이며 확정 곡선으로 교체해야 합니다.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold">레벨 테이블</h2>
          <Table head={["레벨", "누적 요구 경험치", "구간 폭", "조치"]}>
            {levels.map((l, i) => {
              const prev = i > 0 ? levels[i - 1].required : 0;
              return (
                <tr key={l.level}>
                  <Td className="font-semibold">Lv.{l.level}</Td>
                  <Td className="font-mono">{l.required.toLocaleString("en-US")}</Td>
                  <Td className="text-muted-foreground">
                    {i === 0 ? "—" : (l.required - prev).toLocaleString("en-US")}
                  </Td>
                  <Td>
                    <button
                      disabled={l.level === 1}
                      className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent disabled:opacity-40">
                      하향만 가능
                    </button>
                  </Td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Lv.10 도달 후에도 누적 경험치는 계속 쌓이고 표시됩니다 (D-057).
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold">경험치 규칙 (읽기 전용)</h2>
          <Table head={["사유", "경험치", "빈도"]}>
            {EXP_RULES.map((r) => (
              <tr key={r.reason}>
                <Td className="font-semibold">{REASON[r.key]}</Td>
                <Td className="font-mono">+{r.amount}</Td>
                <Td><Pill>1일 1회</Pill></Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold">1일 상한</Td>
              <Td className="font-mono">{DAILY_EXP_CAP}</Td>
              <Td>—</Td>
            </tr>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            코드 상수입니다. 어드민이 바꾸지 않습니다 — 바꾸면 이미 쌓인
            경험치의 의미가 달라집니다 (D-026).
            <br />
            1일 경계는 <b>유저 타임존</b> 기준이고, 운영 지표는 UTC 로
            집계합니다. 두 기준이 공존합니다 (D-056).
            <br />
            아이템·기록을 삭제해도 경험치를 회수하지 않습니다 (D-058).
          </p>
        </div>
      </div>
    </AdminPage>
  );
}
