import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminInviteForm } from "@/components/admin/invite-form";
import { setAdminActive } from "@/lib/actions/admin";
import { getAdmin } from "@/lib/auth/admin";
import { getAdminUsers } from "@/lib/data/admin";

/**
 * A-14 어드민 계정 관리 (D-104).
 *
 * ## ⚠️ 이 화면은 권한 상승 경로다
 * D-102 에서 만들지 않기로 했던 이유가 그것이다. D-104 로 뒤집으면서
 * **잠금 방지와 권한 이력**을 함께 넣었다.
 *
 * | 안전장치 | 왜 |
 * |---|---|
 * | 자기 자신 비활성화 금지 | 실수로 자기를 끄면 즉시 잠긴다 |
 * | 마지막 활성 어드민 비활성화 금지 | 전원이 꺼지면 **아무도 들어올 수 없다** |
 * | `invitedBy` 기록 | 누가 누구에게 권한을 줬는지 남는다 |
 * | 삭제 없음 | 지우면 그 사람의 과거 조치가 가리킬 곳이 사라진다 |
 *
 * ## 비밀번호가 없다
 * 로그인은 기존 소셜(D-021)을 쓴다. **이메일만 등록하면 되고**, 어드민
 * 비밀번호 관리가 통째로 없다 — 유출·재설정·만료 정책이 전부 불필요하다.
 */
export default async function AdminAdminsPage() {
  const [admins, me] = await Promise.all([getAdminUsers(), getAdmin()]);
  const activeCount = admins.filter((a) => a.active).length;

  return (
    <AdminPage
      id="A-14"
      title="어드민 계정 관리"
      desc="소셜 로그인 이메일로 대조합니다. 삭제는 없고 권한 회수만 됩니다 (D-102·D-104)."
    >
      <AdminInviteForm />

      <div className="mt-6">
        <Table head={["이름", "이메일", "상태", "초대한 사람", "등록일", "조치"]}>
          {admins.map((a) => {
            const isMe = a.id === me?.id;
            // 마지막 한 명을 끄면 아무도 들어올 수 없다 (D-104)
            const isLast = a.active && activeCount === 1;
            return (
              <tr key={a.id} className={a.active ? "" : "text-muted-foreground"}>
                <Td className="font-semibold">
                  {a.name}
                  {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(나)</span>}
                </Td>
                <Td className="font-mono text-xs">{a.email}</Td>
                <Td>
                  {a.active ? (
                    <Pill tone="sale">활성</Pill>
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      <Pill>회수됨</Pill>
                      {a.deactivatedAt && (
                        <span className="text-xs">
                          {a.deactivatedAt} · {a.deactivatedBy}
                        </span>
                      )}
                    </span>
                  )}
                </Td>
                <Td>{a.invitedBy}</Td>
                <Td className="whitespace-nowrap">{a.createdAt}</Td>
                <Td>
                  {a.active && (isMe || isLast) ? (
                    <span className="text-xs text-muted-foreground">
                      {isMe ? "자기 자신은 회수 불가" : "마지막 어드민"}
                    </span>
                  ) : (
                    <AdminActionButton
                      label={a.active ? "권한 회수" : "권한 복구"}
                      tone={a.active ? "danger" : "default"}
                      confirm={
                        a.active
                          ? `${a.name} 님이 즉시 어드민 화면에 들어올 수 없게 됩니다. 과거 조치 이력은 남습니다.`
                          : undefined
                      }
                      action={setAdminActive.bind(null, a.id, !a.active)}
                    />
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </div>

      <section className="mt-6 rounded-lg border border-warn bg-warn-bg p-4 text-sm">
        <h2 className="font-bold text-warn">최초 어드민은 이 화면으로 만들 수 없습니다</h2>
        <p className="mt-1 text-muted-foreground">
          어드민이 0명이면 이 화면 자체에 들어올 수 없습니다. 최초 1명은
          서버에서 <code className="font-mono text-xs">pnpm admin:add &lt;이메일&gt; &lt;이름&gt;</code>{" "}
          으로 넣습니다. 결함이 아니라 부트스트랩의 성질입니다 (D-104).
        </p>
        <p className="mt-2 text-muted-foreground">
          <b className="text-foreground">삭제는 제공하지 않습니다.</b> 지우면 그 사람이 한
          제재·검증·신고 처리의 조치자 기록이 가리킬 곳이 사라집니다 (FR-07-A-05).
        </p>
      </section>
    </AdminPage>
  );
}
