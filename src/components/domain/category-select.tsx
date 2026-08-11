"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setCategory } from "@/lib/actions/category";

/**
 * 카테고리 전환 드롭다운 — NEW · 검색 · 마켓 공용 (D-137, D-138).
 *
 * ## ⚠️ `전체` 가 없다
 * 카테고리는 필터가 아니라 **축**이다. 항상 하나가 선택돼 있다.
 *
 * ## ⚠️ 칩이 아니라 드롭다운인 이유
 * 6개를 칩으로 깔면 **상단 한 줄을 통째로 먹는다** — 첫 화면에서 아이템이
 * 밀려난다 (OI-20 과 같은 문제). 축은 자주 바꾸는 값이 아니므로 접어둔다.
 *
 * 선택은 **URL 과 쿠키 양쪽**에 남긴다. URL 은 공유·뒤로가기·색인을 위해,
 * 쿠키는 다음 방문에 같은 카테고리로 들어오기 위해 (D-137).
 *
 * ## ⚠️ 모바일 탭 영역을 확보한다 (D-177)
 * 초판은 `appearance-none bg-transparent` 만 걸린 **맨 텍스트**였다 — 패딩도
 * 높이도 없어 **탭 영역이 글자 높이(약 20px)** 뿐이었다. 모바일에서 누르기
 * 어려웠다. `h-11`(44px)로 모바일 최소 탭 영역을 주고 `lg` 에서 36px 로 줄인다
 * — 데스크톱은 포인터가 정확하고 이 컨트롤은 화면 구석에 있다 (D-141).
 *
 * 테두리·모서리는 **입력 필드와 같은 값**을 쓴다 (`rounded-md`, design-system §4-2).
 * 그림자는 쓰지 않는다 (§4-3).
 */
export function CategorySelect({
  keys,
  active,
}: {
  keys: string[];
  active: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  return (
    <label className="relative flex h-11 shrink-0 items-center rounded-md border pr-2 text-sm lg:h-9">
      <span className="sr-only">{t("category.label")}</span>
      <select
        value={active}
        onChange={(e) => {
          const key = e.target.value;
          // 다른 조건(검색어·정렬·언어권)은 유지한다
          const p = new URLSearchParams(window.location.search);
          p.set("category", key);
          startTransition(async () => {
            await setCategory(key);
            router.push(`${pathname}?${p.toString()}`);
          });
        }}
        // 탭 영역이 라벨 전체가 되게 `select` 를 채운다 — 테두리 안쪽을 눌러도 열린다
        className="h-full appearance-none bg-transparent pl-3 pr-5 text-sm font-bold outline-none"
      >
        {keys.map((key) => (
          <option key={key} value={key}>
            {t(`category.${key}`)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5"
      />
    </label>
  );
}
