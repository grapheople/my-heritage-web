import Link from "next/link";
import { AdminPage, Pill, Table, Td, TriLingualField } from "@/components/admin/ui";
import { AdminActionButton } from "@/components/admin/action-button";
import { setCodexVerification } from "@/lib/actions/admin";
import { getAdminCodex } from "@/lib/data/admin";

/**
 * A-05 도감 검증 큐 (codex F-04, D-033).
 *
 * 유저가 등록한 도감은 **미검증으로 시작한다.** 검증 배지가 유저에게 신뢰
 * 신호로 보이므로 운영자가 확인한 것만 `검증됨`이 된다.
 *
 * ⚠️ **자동 생성에 보너스 경험치를 주지 않는다** (D-033, FR-01-A-05) —
 * 주면 도감을 양산하는 어뷰징이 생기고 미검증 도감이 폭증한다.
 *
 * 검증 시 **설명을 3개 언어로 입력**한다 (D-010) — 검증본은 번역해서 보여주고
 * 미검증본은 원문 그대로 두기 때문이다 (FR-07-A-05).
 */
export default async function AdminCodexVerificationPage() {
  const queue = await getAdminCodex({ unverifiedOnly: true });
  return (
    <AdminPage
      id="A-05" title="도감 검증 큐"
      desc="유저 등록분은 미검증으로 시작합니다. 검증하면 설명이 3개 언어로 번역돼 보입니다."
    >
      <Table head={["명칭 (원문)", "고유값", "보유자", "조치"]}>
        {queue.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">
              {/*
                D-267 — 상세로 간다. 검증 판단에는 alias·키·종류가 함께 필요한데
                목록에는 없다 — 이 큐가 그것 때문에 판단하기 어려웠다
              */}
              <Link
                href={`/admin/codex/${c.id}`}
                className="underline underline-offset-2 hover:text-primary"
              >
                {c.displayName}
              </Link>{" "}
              <Pill tone="warn">미검증</Pill>
            </Td>
            <Td className="font-mono text-xs">{c.uniqueId}</Td>
            <Td>{c.ownerCount}</Td>
            <Td>
              <span className="flex gap-2 whitespace-nowrap">
                <AdminActionButton
                  label="검증됨으로"
                  tone="primary"
                  action={setCodexVerification.bind(null, c.id, true)}
                />
                {/* 삭제 버튼을 두지 않는다 — 도감은 연결된 아이템이 있어
                    지울 수 없다. 중복이면 병합(A-06)이 맞다 (D-016) */}
                <Link
                  href="/admin/codex/merge"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  병합으로 →
                </Link>
              </span>
            </Td>
          </tr>
        ))}
        {queue.length === 0 && (
          <tr><Td className="py-8 text-center text-muted-foreground">검증 대기 중인 도감이 없습니다</Td></tr>
        )}
      </Table>

      <section className="mt-8 rounded-lg border p-4">
        <h2 className="text-sm font-bold">검증 시 입력</h2>
        <div className="mt-4">
          <TriLingualField label="도감 설명" name="desc"
            values={{ ko: "세라믹 베젤을 처음 적용한…", ja: "セラミックベゼルを初採用した…", en: "The first Submariner Date with…" }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          검증하면 설명이 유저 언어로 번역돼 보입니다. 미검증 상태에서는 원문
          그대로 노출됩니다 — 운영자가 확인하지 않은 내용을 서비스가 보증하는
          것처럼 보이지 않게 하기 위해서입니다 (FR-07-A-05).
        </p>
      </section>
    </AdminPage>
  );
}
