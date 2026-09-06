import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { dateTileParts } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import type { DiaryEntry } from "@/lib/data/types";

/**
 * 기록(일기) 목록 — **세로 1열 카드 + 날짜(월) 헤더** (D-084).
 *
 * ⚠️ **진열(3열 그리드)과 다르게 만드는 것이 요구사항이다.** 진열은 공간이고
 * 기록은 시간축이다. 같은 느낌으로 만들면 둘 다 어색해진다.
 * 일기는 최대 1000자라 텍스트가 주인공이므로 정사각 격자에 맞지 않는다.
 *
 * 카드에는 첫 사진·본문 일부·작성일·연결 아이템 수를 낸다 (FR-04-A-04).
 * 본인 방에서는 비공개 일기를 표식과 함께 표시한다 (FR-04-A-02).
 *
 * ## ⚠️ 사진이 없으면 **날짜 타일**이 그 자리를 대신한다 (D-308)
 * 사진은 필수가 아닌데(FR-01-A-06) 자리를 비우면 카드마다 본문 시작점이
 * 달라져 목록이 들쭉날쭉해진다. 타일은 **사진과 같은 크기·같은 자리**를
 * 차지해 왼쪽 라인을 맞춘다.
 *
 * 날짜를 고른 이유는 이 화면이 **이미 시간축**이기 때문이다 (D-084) — 월
 * 헤더가 그렇게 말한다. 없는 이미지를 지어내는 대신 이 목록이 이미 쓰는
 * 언어로 빈자리를 채운다.
 */
/**
 * 사진 자리를 대신하는 날짜 타일 (D-308).
 *
 * ⚠️ **사진보다 조용해야 한다.** `bg-muted` 에 회색 글자다 — 타일이 사진 카드보다
 * 눈에 띄면 사진 없는 일기가 오히려 강조된다.
 */
function DateTile({ ymd, locale }: { ymd: string; locale: Locale }) {
  const { head, day, weekday } = dateTileParts(ymd, locale);
  return (
    <span className="flex size-18 shrink-0 flex-col items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <span className="text-[10px] leading-none">{head}</span>
      <span className="text-xl leading-tight font-bold">{day}</span>
      <span className="text-[10px] leading-none">{weekday}</span>
    </span>
  );
}

export function DiaryList({
  diaries,
  isOwner,
}: {
  diaries: DiaryEntry[];
  isOwner: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  // 월 단위로 먼저 묶는다 — 렌더 중 외부 변수를 바꾸지 않는다
  const groups: { month: string; entries: DiaryEntry[] }[] = [];
  for (const d of diaries) {
    const month = d.createdAt.slice(0, 7); // YYYY-MM
    const last = groups.at(-1);
    if (last?.month === month) last.entries.push(d);
    else groups.push({ month, entries: [d] });
  }

  return (
    <div>
      {groups.map((g) => (
        <section key={g.month}>
          {/* 날짜(월) 헤더 — 시간축임을 드러낸다 (D-084) */}
          <h3 className="sticky top-0 z-10 bg-muted/60 px-4 py-2 text-sm font-bold text-muted-foreground backdrop-blur lg:px-3">
            {g.month.replace("-", ". ")}.
          </h3>
          {g.entries.map((d) => (
            <Link
              key={d.id}
              href={`/diaries/${d.id}`}
              className="flex gap-3 border-b px-4 py-4 hover:bg-accent lg:px-3"
            >
              {/* 첫 사진. 없으면 날짜 타일이 같은 자리를 채운다 (D-308) */}
              {d.photos.length > 0 ? (
                <span className="relative size-18 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <Image src={d.photos[0]} alt="" fill sizes="72px" className="object-cover" />
                </span>
              ) : (
                <DateTile ymd={d.createdAt} locale={locale} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* ⚠️ 타일이 있으면 날짜를 두 번 쓰지 않는다 — 바로 옆에서 같은 값이 반복된다 */}
                  {d.photos.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {d.createdAt}
                    </span>
                  )}
                  {isOwner && d.visibility === "PRIVATE" && (
                    <StatusBadge variant="private" />
                  )}
                </div>
                {/* 본문 일부. 번역하지 않는다 */}
                <p className="mt-1 line-clamp-2 text-sm leading-snug">{d.body}</p>
                <p className="mt-1.5 flex gap-2 text-xs text-muted-foreground">
                  {d.photos.length > 0 && (
                    <span>{t("diary.photoCount", { count: d.photos.length })}</span>
                  )}
                  {d.items.length > 0 && (
                    <span>{t("diary.itemCount", { count: d.items.length })}</span>
                  )}
                </p>
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
