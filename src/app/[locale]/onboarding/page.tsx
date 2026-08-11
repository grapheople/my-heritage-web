import { getTranslations } from "next-intl/server";
import { CATEGORY_KEYS } from "@/lib/categories";
import { redirect } from "@/i18n/navigation";
import { ROOM_NAME_MAX } from "@/lib/profile";
import { getViewer, needsOnboarding } from "@/lib/auth/viewer";
import { OnboardingForm } from "@/components/domain/onboarding-form";

/**
 * S-24 가입 직후 프로필 설정 (myroom F-09).
 *
 * ## ⚠️ `(user)` 그룹 **밖**이다
 * 탭바를 붙이지 않는다. 탭을 누를 수 있으면 방 이름 없이 빠져나가는 길이
 * 생기고, 그러면 빈 이름 방이 피드에 나간다 (FR-09-A-02). 로그인 화면(S-13)이
 * 같은 이유로 이 그룹 밖에 있다.
 *
 * ## ⚠️ 이미 이름이 있으면 다시 묻지 않는다 (FR-09-A-05)
 * 직접 URL 로 들어와도 방으로 돌려보낸다. 매번 "프로필을 완성하세요"가 뜨면
 * 잔소리가 된다.
 */
export default async function OnboardingPage({
  params,
}: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: "/login", locale });
    return null;
  }
  if (!(await needsOnboarding(viewer))) {
    redirect({ href: "/me", locale });
    return null;
  }

  // 카테고리 이름은 메시지 번들에 있다 (`category.*`) — 유저 언어로 넘긴다
  const t = await getTranslations();
  const labels = Object.fromEntries(
    CATEGORY_KEYS.map(
      (k) => [k, t(`category.${k}`)],
    ),
  );

  return <OnboardingForm roomNameMax={ROOM_NAME_MAX} categoryLabels={labels} />;
}
