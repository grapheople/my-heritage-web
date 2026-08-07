import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * 마이룸 하위 3메뉴 — 프로필 / 아이템 / 기록 (myroom-service §1-4).
 * `lg`에서 좌측 사이드 세로 배열로 바뀐다 (D-089, design-system.md §5-3).
 */
export function RoomTabs({
  active,
  /** 본인 방은 `/me`, 타인 방은 `/rooms/{id}` */
  basePath = "/me",
}: {
  active: "profile" | "items" | "records";
  basePath?: string;
}) {
  const t = useTranslations();
  const href = (k: "profile" | "items" | "records") =>
    k === "items" ? basePath : `${basePath}/${k}`;

  return (
    <nav className="sticky top-0 z-10 flex border-b bg-background lg:top-19 lg:h-fit lg:flex-col lg:self-start lg:rounded-lg lg:border">
      {(["profile", "items", "records"] as const).map((k) => (
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
