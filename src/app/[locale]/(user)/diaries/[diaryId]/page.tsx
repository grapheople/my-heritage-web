import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/domain/delete-button";
import { deleteDiary } from "@/lib/actions/diary";
import { DiaryBody } from "@/components/domain/diary-body";
import { StatusBadge } from "@/components/domain/status-badge";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getDiary } from "@/lib/data/diary";

/**
 * S-07 일기 상세.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 비공개 일기는 소유자에게만 | D-019, FR-03-A-03 |
 * | **방이 비공개면 공개 일기도 타인에게 안 보인다** | D-019, FR-03-A-04 |
 * | 본문은 플레인 텍스트. URL 자동 링크화 없음 | D-055, FR-01-B-01~04 |
 * | 검색 대상이 아니다 | D-020, FR-03-A-06 → noindex |
 *
 * ## ⚠️ FR-02-A-08 — 비공개 아이템에 연결된 공개 일기
 *
 * **일기는 계속 노출하되 아이템 링크만 비활성화한다.** 이것이 D-083(권한 없는
 * 아이템은 렌더하지 않는다)의 **유일한 예외**다 — 일기 자체는 공개이므로
 * 감출 근거가 없고, 아이템으로 가는 경로만 막으면 된다.
 *
 * 타인에게는 아예 렌더하지 않고(D-083), **소유자에게만** 비활성 상태로 보인다.
 */
export default async function DiaryDetailPage({
  params,
}: PageProps<"/[locale]/diaries/[diaryId]">) {
  const { diaryId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  // 공개 판정(Room AND Diary)·차단은 조회 계층에서 끝난다 (D-019, FR-03-A-03·04)
  const diary = await getDiary(diaryId, viewer);
  if (!diary) notFound();

  const isOwner = viewer?.roomId === diary.roomId;

  return (
    <article>
      <header className="border-b px-4 py-5 lg:px-0">
        <div className="flex items-center gap-1.5">
          <time className="text-sm text-muted-foreground">{diary.createdAt}</time>
          {isOwner && diary.visibility === "PRIVATE" && (
            <StatusBadge variant="private" />
          )}
        </div>
        <Link
          href={`/rooms/${diary.roomId}`}
          className="mt-2 inline-flex items-center gap-2 hover:underline"
        >
          <span className="size-7 rounded-full bg-muted" />
          <span className="text-sm font-semibold">{diary.roomName}</span>
        </Link>
      </header>

      {/* 사진 — 최대 10장, 없을 수 있다 (FR-01-A-05·06) */}
      {diary.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-1 border-b p-1">
          {diary.photos.map((url) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-sm bg-muted">
              {/* 일기 사진에는 캡션이 없다 — alt 를 비워 스크린리더가 건너뛰게 한다 */}
              <Image src={url} alt="" fill sizes="(min-width:1024px) 186px, 50vw" className="object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-5 lg:px-0">
        <DiaryBody text={diary.body} />
      </div>

      {/* 연결된 아이템 (D-054) */}
      {diary.items.length > 0 && (
        <section className="border-t px-4 py-5 lg:px-0">
          <h2 className="text-sm font-bold">{t("diary.linkedItems")}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {diary.items.map((item) => {
              const itemVisible = item.visibility === "PUBLIC";

              // 타인에게는 렌더하지 않는다 (D-083, FR-01-B-06)
              if (!itemVisible && !isOwner) return null;

              // 소유자 + 비공개 아이템 → 링크 비활성 (FR-02-A-08)
              if (!itemVisible) {
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground"
                  >
                    {item.name}
                    <StatusBadge variant="private" />
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="block rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="border-t px-4 py-4 lg:px-0">
        {isOwner ? (
          <div className="flex items-center gap-4">
            <Link
              href={`/diaries/${diary.id}/edit`}
              className="text-sm font-semibold underline"
            >
              {t("common.edit")}
            </Link>
            {/*
              ⚠️ **삭제 진입점이 없었다** (D-180). `deleteDiary` 액션은 처음부터
              있었는데 부르는 화면이 한 곳도 없어 **유저가 자기 기록을 지울 수
              없었다.** 사진·아이템 연결은 Cascade 로 함께 지워지고 아이템은 남는다 (M-03)
            */}
            <DeleteButton
              action={deleteDiary.bind(null, diary.id)}
              confirmText={t("diary.deleteConfirm")}
              label={t("diary.delete")}
              // 지운 화면에 남으면 404 다 — 기록 목록으로 보낸다
              redirectTo="/me/records"
            />
          </div>
        ) : (
          /* 일기는 신고 대상이다 (FR-01-C-06, D-029) */
          <Link
            href={`/report?target=diary&id=${diary.id}`}
            className="text-xs text-muted-foreground underline"
          >
            {t("report.reportThis")}
          </Link>
        )}
      </section>
    </article>
  );
}
