import type { Route } from "next";
import Link from "next/link";
import { AdminListControls } from "@/components/admin/list-controls";
import { AdminPage, Pill, Table, Td } from "@/components/admin/ui";
import { parseListParams } from "@/lib/admin-list-params";
import { getAdminUsersPage } from "@/lib/data/admin";

/**
 * A-16 유저 조회 (D-220).
 *
 * ## ⚠️ 이 서비스에는 **닉네임이 없다**
 * `User` 에 표시 이름 필드가 없다. 유저가 화면에 드러나는 이름은 `Room.name`
 * 하나뿐이고 **유일값도 아니다** (FR-05-A-06). 그래서 이름으로 찾으면 **동명이
 * 여럿 나올 수 있고**, 그것을 가르는 값은 **유저 ID** 뿐이다 — 그래서 ID 를
 * 숨기지 않고 열로 낸다.
 *
 * ## ⚠️ 조회 전용이다 — 조치는 A-10 이 한다
 * 제재는 `issueSanction` 하나만 지나가야 한다(D-104 계열의 이유). 여기서
 * 제재 버튼을 또 만들면 **부과 규칙이 두 곳**이 되고, 사유 코드·기간·방
 * 비공개 전환 같은 분기가 갈린다. 대신 **대상을 들고 A-10 으로 넘긴다** —
 * A-08 신고 처리가 이미 쓰는 `targetType`·`targetId` 링크와 같은 방식이다
 * (FR-05-A-09). 안 넘기면 어드민이 방 이름을 다시 찾아야 하고, **그러다
 * 엉뚱한 유저를 제재한다.**
 *
 * ## ⚠️ 탈퇴·비공개·봇을 숨기지 않고 **드러낸다**
 * 숨은 계정을 못 찾는 것과 탈퇴 계정을 정상으로 오인하는 것은 둘 다 사고다.
 */
export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const params = parseListParams(await searchParams);
  const list = await getAdminUsersPage(params);

  return (
    <AdminPage
      id="A-16"
      title="유저 조회"
      desc="방 이름 · 유저 ID · 이메일로 찾습니다. 이 서비스에 닉네임은 없고 방 이름이 그 자리인데, 유일값이 아니라 동명이 나올 수 있습니다 (FR-05-A-06)."
    >
      {/*
        ⚠️ 카테고리를 넘기지 않는다 — 유저에는 카테고리 축이 없다. 빈 선택을
        두면 어드민이 "왜 안 걸리지"를 묻게 된다
      */}
      <AdminListControls
        total={list.total}
        filtered={list.filtered}
        loadLimit={list.loadLimit}
        placeholder="방 이름 · 유저 ID · 이메일 검색"
      />

      <Table
        head={["방 이름", "유저 ID", "이메일", "상태", "활동", "가입일", "조치"]}
      >
        {list.rows.map((u) => (
          <tr key={u.id}>
            <Td className="font-semibold">
              {u.roomName ? (
                u.roomId ? (
                  // 실제 방을 확인해야 판단이 되는 문의가 많다 (신고·제재 검토)
                  <Link
                    href={`/ko/rooms/${u.roomId}` as Route}
                    className="underline underline-offset-2"
                  >
                    {u.roomName}
                  </Link>
                ) : (
                  u.roomName
                )
              ) : (
                /*
                  ⚠️ **방이 없는 유저가 실재한다** — 가입 직후 방 이름을 정하기
                  전 상태다. `Room` 기준으로 조회했다면 이 유저는 어드민에게
                  아예 안 보인다
                */
                <span className="text-muted-foreground">(방 없음)</span>
              )}
            </Td>

            {/* ⚠️ 동명 방을 가르는 유일한 값이다. 로그·문의에 이 값이 실려 온다 */}
            <Td className="font-mono text-xs text-muted-foreground">{u.id}</Td>

            <Td className="text-muted-foreground">
              {/* Apple 릴레이 이메일일 수 있다 — 연락 수단으로 신뢰하지 않는다 (FR-05-A-04) */}
              {u.email ?? <span className="opacity-60">없음</span>}
            </Td>

            <Td className="flex flex-wrap gap-1">
              {u.deletedAt && <Pill tone="danger">탈퇴 {u.deletedAt}</Pill>}
              {u.activeSanctions > 0 && <Pill tone="warn">제재중</Pill>}
              {u.isBot && <Pill>봇</Pill>}
              {u.visibility === "PRIVATE" && <Pill>방 비공개</Pill>}
              {!u.deletedAt && u.activeSanctions === 0 && !u.isBot && (
                <Pill tone="sale">정상</Pill>
              )}
            </Td>

            <Td className="text-xs text-muted-foreground">
              아이템 {u.itemCount} · 기록 {u.diaryCount} · 팔로워 {u.followerCount}
            </Td>

            <Td className="text-xs text-muted-foreground">{u.joinedAt}</Td>

            <Td>
              {/*
                ⚠️ **부과는 A-10 이 한다.** 여기서는 대상만 실어 보낸다 —
                제재 규칙이 두 곳에 생기면 사유 코드·기간·방 비공개 전환이 갈린다
              */}
              {u.roomId ? (
                <Link
                  href={
                    `/admin/sanctions?targetType=ROOM&targetId=${u.roomId}` as Route
                  }
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  제재 (A-10)
                </Link>
              ) : (
                // 제재 대상 해석이 방을 거친다 — 방이 없으면 넘길 것이 없다
                <span className="text-xs text-muted-foreground">방 없음</span>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </AdminPage>
  );
}
