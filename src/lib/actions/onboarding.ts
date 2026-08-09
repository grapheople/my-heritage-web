"use server";

import { getViewer } from "@/lib/auth/viewer";
import { fail, type ActionResult, revalidate } from "@/lib/actions/shared";
import { ROOM_NAME_MAX } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

/**
 * 가입 직후 프로필 설정 저장 (S-24, myroom F-09).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **방 이름만 필수** | D-123, FR-09-A-02 |
 * | 방 이름은 유일값이 아니다 | FR-05-A-06 |
 * | 나머지는 전부 비워둘 수 있다 | FR-09-B-02 |
 * | 저장 후 다시 강제하지 않는다 | FR-09-A-05 |
 *
 * ## ⚠️ 설정 화면의 `updateProfile` 과 나눠 둔 이유
 * 같은 필드를 쓰지만 **필수 판정이 다르다.** 여기서는 방 이름이 없으면 화면을
 * 벗어날 수 없고(FR-09-A-02), 설정 화면에서는 기존 이름을 지우려는 시도일
 * 뿐이다. 한 함수에 모으면 "온보딩인가"를 인자로 받게 되고, 그 분기가 곧
 * 규칙이 흐려지는 지점이 된다.
 */
export type OnboardingInput = {
  roomName: string;
  bio?: string;
  imageUrl?: string;
  /** 선호 카테고리 key. 0~6개 (FR-09-B-04) */
  preferredCategories: string[];
};

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.roomId) return fail({}, "로그인이 필요합니다");

  const name = input.roomName.trim();
  // 공백만 입력한 경우도 막는다 (FR-09-A-04)
  if (!name) return fail({ roomName: "방 이름을 입력해주세요" });
  if ([...name].length > ROOM_NAME_MAX) {
    return fail({ roomName: `방 이름은 ${ROOM_NAME_MAX}자까지예요` });
  }

  // ⚠️ **세션의 `roomId` 를 `where` 에 쓰지 않는다** (D-132). 그 값은 로그인
  // 시점 JWT 에 박혀 있어 낡을 수 있다 — 방이 지워졌거나 세션이 다른 DB 에서
  // 발급됐으면 "레코드를 찾을 수 없다"로 터진다. `Room.userId` 가 유일값이므로
  // 유저를 기준으로 찾는 것이 항상 맞다
  await prisma.room.update({
    where: { userId: viewer.userId },
    data: {
      name,
      bio: input.bio?.trim() || null,
      imageUrl: input.imageUrl || null,
    },
  });

  if (input.preferredCategories.length > 0) {
    await prisma.user.update({
      where: { id: viewer.userId },
      data: {
        preferredCategories: {
          connect: input.preferredCategories.map((key) => ({ key })),
        },
      },
    });
  }

  // 방 이름이 채워졌으므로 가드가 더 이상 잡지 않는다.
  // ⚠️ 세션 토큰의 `needsRoomName` 은 **재발급 전까지 옛 값**이라 그것만
  // 믿으면 계속 온보딩으로 돌아온다 — 가드가 DB 를 보는 이유다
  revalidate("/[locale]/me");
  revalidate("/[locale]");
  return { ok: true };
}
