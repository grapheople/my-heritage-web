import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { WearShotCard } from "@/lib/data/wear-shot";

/**
 * 하루기록 그리드 (S-25, D-148).
 *
 * ⚠️ **아이템 진열과 같은 리듬**을 쓴다 (D-144 §4-1-1). "아이템 리스트와 같은
 * 방식"이라는 요구이므로 열 수·간격을 따로 만들지 않는다 — 다르면 같은
 * 서비스로 안 보인다.
 *
 * 카드에 **날짜**를 낸다. 하루기록은 "언제 썼는가"가 핵심 정보다.
 */
export function WearShotGrid({
  shots,
  showItemName = true,
}: {
  shots: WearShotCard[];
  /** 아이템 상세에서는 이름이 이미 위에 있다 */
  showItemName?: boolean;
}) {
  const t = useTranslations();

  return (
    <ul className="grid grid-cols-3 gap-3">
      {shots.map((s) => (
        <li key={s.id}>
          {/* 하루기록 상세로 (D-178). 예전에는 아이템 상세로 보냈다 (D-148) */}
          <Link href={`/wear/${s.id}`} className="block">
            <span className="relative block aspect-square overflow-hidden rounded-md border bg-muted">
              {s.photoUrl && (
                <Image
                  src={s.photoUrl}
                  alt=""
                  fill
                  sizes="(min-width:1024px) 224px, 33vw"
                  className="object-cover"
                />
              )}
            </span>
            <span className="mt-1.5 block text-xs font-semibold">{s.wornOn}</span>
            {showItemName && (
              <span className="block truncate text-xs text-muted-foreground">
                {s.itemName}
              </span>
            )}
            {s.note && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {s.note}
              </span>
            )}
          </Link>
        </li>
      ))}
      {shots.length === 0 && (
        <li className="col-span-full py-10 text-center text-sm text-muted-foreground">
          {t("wear.empty")}
        </li>
      )}
    </ul>
  );
}
