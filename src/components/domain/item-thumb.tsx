import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { MuscleMap } from "./muscle-map";
import { StatusBadge } from "./status-badge";

/**
 * 진열 카드 1장.
 *
 * ⚠️ **대표 사진 · 아이템 명칭 · 배지만 표시한다.** 카테고리·브랜드는 넣지 않는다
 * (D-074) — 카테고리는 섹션 헤더에 이미 있고 브랜드는 명칭에 포함된다(D-073).
 * 3열 그리드의 정보량 예산 때문이다.
 *
 * 아이템 명칭은 **저장하지 않는 파생값**이다 (D-073, M-14). 여기서 조립하지 않고
 * 이미 파생된 값을 받는다.
 */
export type ItemThumbData = {
  id: string;
  /** 파생된 아이템 명칭 (D-073) */
  name: string;
  /**
   * 대표 사진. 아이템은 사진 1장 이상이 필수이므로(D-037) 실데이터에서는 항상 있다.
   * 비어 있으면 결정적 그라디언트로 대체한다 — 스토리지가 붙기 전(OI-47)
   * 개발용 경로다.
   */
  photoUrl?: string;
  /** 판매중 배지 (D-046) */
  onSale?: boolean;
  /** 비공개 배지 — 본인 방에서만 (FR-01-B-01) */
  isPrivate?: boolean;
  /**
   * 자극부위 (`targetMuscle` 옵션 키). **사진이 없을 때 대표 이미지가 된다**
   * (D-222·D-224, `FR-07-A-14`·`FR-10-D-04`).
   *
   * ⚠️ 운동이 아닌 카테고리는 비어 있고, 그쪽은 사진이 필수라(D-037) 이
   * 값이 쓰일 일이 없다. **빈 배열이어도 운동이면 빈 실루엣을 그린다** —
   * 그것이 "종목을 추가하세요" 상태다 (E-10-01)
   */
  muscles?: readonly string[];
  /** 운동 카테고리인가. 대체 이미지의 **종류를 카테고리가 정한다** */
  categoryKey?: string;
};

/** id에서 결정적 색상을 만든다 — 매 렌더 같은 그림이어야 SSR/CSR이 어긋나지 않는다 */
function swatch(id: string): string {
  let n = 2166136261;
  for (const ch of id) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  const h = Math.abs(n) % 360;
  return `linear-gradient(140deg, hsl(${h} 42% 34%), hsl(${(h + 38) % 360} 52% 62%))`;
}

export function ItemThumb({
  item,
  /** 떠난 아이템 — 그레이스케일 (D-023, D-086) */
  parted = false,
}: {
  item: ItemThumbData;
  parted?: boolean;
}) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="group block"
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-md border bg-muted",
          parted && "grayscale opacity-55",
        )}
      >
        {item.photoUrl ? (
          <Image
            src={item.photoUrl}
            alt={item.name}
            fill
            sizes="(min-width:1024px) 224px, (min-width:640px) 25vw, 33vw"
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : item.categoryKey === "workout" ? (
          /*
            ⚠️ **운동은 사진이 없을 수 있다** (D-224). 그때 대표 이미지는
            **근육맵**이다 — 그라디언트를 쓰지 않는다. 그 경로는 주석이
            "스토리지 붙기 전 개발용"이라고 못박고 있고, 루틴 카드가 전부
            의미 없는 색 블록이 되면 방이 죽는다 (D-222·D-223).

            자극부위가 비어 있어도 **빈 실루엣**이 그려진다 — 그것이
            "종목을 추가하세요" 상태다 (E-10-01)
          */
          <div className="absolute inset-0 flex items-center justify-center p-2.5">
            <MuscleMap muscles={item.muscles ?? []} className="h-full w-full" />
          </div>
        ) : (
          /* 사진 자리. D-079("색은 아이템이 담당한다")를 눈으로 검증하려면
             무채색 블록이 아니라 실제 사진처럼 컬러여야 한다 */
          <div
            aria-hidden
            className="absolute inset-0 transition-transform group-hover:scale-[1.03]"
            style={{ background: swatch(item.id) }}
          />
        )}
        {(item.onSale || item.isPrivate) && (
          <div className="absolute top-1.5 left-1.5 flex gap-1">
            {item.onSale && <StatusBadge variant="sale" />}
            {item.isPrivate && <StatusBadge variant="private" />}
          </div>
        )}
      </div>
      {/* 명칭이 길면 2줄 말줄임 (FR-01-A-12) */}
      <p
        className={cn(
          "mt-1.5 line-clamp-2 text-xs leading-snug font-semibold",
          parted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {item.name}
      </p>
          </Link>
  );
}
