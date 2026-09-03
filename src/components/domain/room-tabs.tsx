import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * 마이룸 하위 **3메뉴** — 아이템 / 하루기록 / 기록 (D-130, D-148).
 *
 * ⚠️ **하루기록을 메인 탭(4개)에 넣지 않았다.** D-081·D-089 가 메인 4개를
 * 확정했고 하단 탭바가 4열이다. 하루기록은 **방 안의 기록**이므로 여기가 맞다 —
 * "아이템 리스트와 같은 방식"이라는 요구도 방 진열을 뜻한다.
 *
 * ⚠️ **프로필 탭을 뺐다.** 초안은 3메뉴였는데(프로필/아이템/기록) 프로필에
 * 담을 것이 **헤더(`RoomProfile`)에 이미 전부 있다** — 방 이름·사진·소개·
 * 레벨·아이템 수. 탭을 만들면 같은 정보가 두 곳에 나오고, 실제로 그 페이지가
 * 없어서 **누르면 404** 였다.
 *
 * `lg`에서 좌측 사이드 세로 배열로 바뀐다 (D-089, design-system.md §5-3).
 */
export function RoomTabs({
  active,
  /** 본인 방은 `/me`, 타인 방은 `/rooms/{id}` */
  basePath = "/me",
}: {
  active: "items" | "wear" | "records";
  basePath?: string;
}) {
  const t = useTranslations();
  const href = (k: "items" | "wear" | "records") =>
    k === "items" ? basePath : `${basePath}/${k}`;

  // ⚠️ `lg` 에서 세로 사이드바로 바뀌던 변형을 제거했다 (D-156). 콘텐츠가
  // 500px 로 고정돼 옆에 탭을 세울 자리가 없다
  return (
    <nav className="sticky top-0 z-10 flex border-b bg-background">
      {(["items", "wear", "records"] as const).map((k) => (
        <Link
          key={k}
          href={href(k)}
          aria-current={k === active ? "page" : undefined}
          className={
            k === active
              ? "flex-1 border-b-2 border-foreground px-4 py-3 text-center text-sm font-bold"
              : "flex-1 px-4 py-3 text-center text-sm text-muted-foreground"
          }
        >
          {t(`myRoom.tab.${k}`)}
        </Link>
      ))}
    </nav>
  );
}
