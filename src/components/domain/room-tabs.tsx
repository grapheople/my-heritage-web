import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * 마이룸 하위 **2메뉴** — 아이템 / 기록 (D-130).
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
  active: "items" | "records";
  basePath?: string;
}) {
  const t = useTranslations();
  const href = (k: "items" | "records") =>
    k === "items" ? basePath : `${basePath}/${k}`;

  return (
    <nav className="sticky top-0 z-10 flex border-b bg-background lg:top-19 lg:h-fit lg:flex-col lg:self-start lg:rounded-lg lg:border">
      {(["items", "records"] as const).map((k) => (
        <Link
          key={k}
          href={href(k)}
          aria-current={k === active ? "page" : undefined}
          className={
            k === active
              ? "flex-1 border-b-2 border-foreground px-4 py-3 text-center text-sm font-bold lg:border-b-0 lg:bg-accent lg:text-left lg:shadow-[inset_3px_0_0_currentColor]"
              : "flex-1 px-4 py-3 text-center text-sm text-muted-foreground lg:text-left"
          }
        >
          {t(`myRoom.tab.${k}`)}
        </Link>
      ))}
    </nav>
  );
}
