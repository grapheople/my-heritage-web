import { prisma } from "@/lib/prisma";
import { auth } from "./config";

/**
 * 어드민 인가 (D-102).
 *
 * ## ⚠️ 유저 인증과 분리한다
 * 로그인 자체는 기존 소셜(D-021)을 그대로 쓴다. 다른 것은 **인가**다 —
 * 세션 이메일이 `AdminUser` 에 있고 `active` 일 때만 `/admin` 에 들어온다.
 *
 * `User.isAdmin` 플래그 방식은 D-102 에서 탈락했다: 유저 탈퇴(`deletedAt`)와
 * 어드민 권한이 한 행에 얽히고, 유저 조회마다 권한 필드가 따라다닌다.
 *
 * ## ⚠️ 비인가는 404 다
 * 403 을 내면 `/admin` 이 존재한다는 사실이 드러난다. 어드민 화면은 유저에게
 * 알릴 이유가 없다 — D-083 이 비공개 아이템의 **존재**를 감추라고 한 것과
 * 같은 기준이다.
 */
export type AdminActor = { id: string; email: string; name: string };

/**
 * 개발 우회로 — 어드민 계정이 하나도 없을 때만 작동한다.
 *
 * ⚠️ **계정이 한 건이라도 등록되면 자동으로 꺼진다.** 프로덕션에서는
 * `NODE_ENV` 조건에서 이미 걸린다. 유저 쪽 우회로(`viewer.ts`)와 같은 구조다 —
 * 그 우회로가 D-078·D-096 을 가려서 한 번 데인 적이 있으므로, 여기서도
 * **켜져 있는 조건을 좁게 잡는다.**
 */
async function devAdmin(): Promise<AdminActor | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const count = await prisma.adminUser.count({ where: { active: true } });
  if (count > 0) return null;
  return { id: "dev-admin", email: "dev@example.com", name: "개발용 어드민" };
}

/**
 * 개발용 어드민 사칭 — `DEV_ADMIN_EMAIL` (D-117).
 *
 * ## 왜 필요한가: 위 우회로만으로는 못 푸는 고리가 있다
 * 로컬을 원격 DB(Supabase)에 붙이면 어드민 계정이 **이미 있으므로** 위
 * 우회로는 꺼진다. 그런데 OAuth 자격증명이 없으면 로그인할 방법도 없다.
 * 결과적으로 `/admin` 이 닫히는데, **A-02 속성 조합은 어드민 화면에서만**
 * 만들 수 있고(D-097) 그게 없으면 아이템을 한 건도 등록할 수 없다.
 *
 * ## 세 겹으로 좁힌다
 * | 조건 | 이유 |
 * |---|---|
 * | `NODE_ENV === "development"` | 프로덕션에서는 존재하지 않는 경로다 |
 * | 환경변수를 **명시로** 넣어야 함 | 기본값 없음 — 실수로 켜지지 않는다 |
 * | **실재하고 `active` 인 행**이어야 함 | 아래 참조 |
 *
 * ⚠️ **가짜 액터를 만들지 않는다.** 어드민 조치는 `actorId` 를 남긴다
 * (D-102 가 행 삭제 대신 `active=false` 를 택한 이유이기도 하다). 사칭이
 * 없는 id 를 쓰면 감사 로그가 아무도 안 가리키게 되므로, 반드시 실제 행을
 * 찾아서 그 id 로 행동한다 — **누가 했는지가 원격 DB 에 정확히 남는다.**
 */
async function impersonatedAdmin(): Promise<AdminActor | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const email = process.env.DEV_ADMIN_EMAIL?.trim();
  if (!email) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, active: true },
  });
  if (!admin?.active) {
    // 조용히 실패하면 "왜 404 지?" 로 시간을 버린다
    console.warn(
      `[auth] DEV_ADMIN_EMAIL=${email} 에 해당하는 활성 어드민이 없습니다. ` +
        `\`pnpm admin:add ${email} "이름"\` 으로 등록하세요 (D-117).`,
    );
    return null;
  }
  console.warn(`[auth] ⚠️ 개발용 어드민 사칭: ${admin.email} (D-117)`);
  return { id: admin.id, email: admin.email, name: admin.name };
}

/** 현재 어드민. 아니면 `null` */
export async function getAdmin(): Promise<AdminActor | null> {
  // ⚠️ `auth()` 는 **요청 스코프**를 요구해서 스크립트에서 부르면 던진다.
  // 여기서 던지면 어드민 액션을 스크립트로 검증할 수 없고, **검증할 수 없는
  // 코드가 곧 미검증 위험**이다 — 개발 우회로가 D-078·D-096 을 가렸던 일이
  // 그렇게 생겼다. 스코프가 없으면 아래 개발 우회로로 떨어뜨린다.
  //
  // 프로덕션에서는 `devAdmin()` 이 `NODE_ENV` 에서 이미 막히므로 권한이
  // 열리지 않는다.
  let session = null;
  try {
    session = await auth();
  } catch {
    return (await impersonatedAdmin()) ?? devAdmin();
  }
  const email = session?.user?.email;
  if (email) {
    const admin = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, active: true },
    });
    // 퇴사·권한 회수는 행 삭제가 아니라 active=false 다 (D-102) —
    // 과거 조치 이력의 참조가 끊기면 안 되기 때문이다
    if (admin?.active) return { id: admin.id, email: admin.email, name: admin.name };
  }
  // 실제 세션이 우선한다. 사칭은 세션이 없을 때만 — 로그인한 사람의 신원을
  // 환경변수가 덮어쓰면 감사 로그가 거짓말을 한다
  return (await impersonatedAdmin()) ?? devAdmin();
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdmin()) !== null;
}
