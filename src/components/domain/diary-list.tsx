import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "./status-badge";
import type { DiaryEntry } from "@/lib/dev-fixture";

/**
 * 기록(일기) 목록 — **세로 1열 카드 + 날짜(월) 헤더** (D-084).
 *
 * ⚠️ **진열(3열 그리드)과 다르게 만드는 것이 요구사항이다.** 진열은 공간이고
 * 기록은 시간축이다. 같은 느낌으로 만들면 둘 다 어색해진다.
 * 일기는 최대 1000자라 텍스트가 주인공이므로 정사각 격자에 맞지 않는다.
 *
 * 카드에는 첫 사진·본문 일부·작성일·연결 아이템 수를 낸다 (FR-04-A-04).
 * 본인 방에서는 비공개 일기를 표식과 함께 표시한다 (FR-04-A-02).
 */
export function DiaryList({
  diaries,
  isOwner,
}: {
  diaries: DiaryEntry[];
  isOwner: boolean;
}) {
  const t = useTranslations();

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
              {/* 첫 사진. 없으면 자리를 비운다 — 사진은 필수가 아니다 (FR-01-A-06) */}
              {d.photoCount > 0 && (
                <span className="size-18 shrink-0 rounded-md border bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {d.createdAt}
                  </span>
                  {isOwner && d.visibility === "PRIVATE" && (
                    <StatusBadge variant="private" />
                  )}
                </div>
                {/* 본문 일부. 번역하지 않는다 */}
                <p className="mt-1 line-clamp-2 text-sm leading-snug">{d.body}</p>
                <p className="mt-1.5 flex gap-2 text-xs text-muted-foreground">
                  {d.photoCount > 0 && (
                    <span>{t("diary.photoCount", { count: d.photoCount })}</span>
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
