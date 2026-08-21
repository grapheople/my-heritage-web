import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/domain/delete-button";
import { deleteWearShot } from "@/lib/actions/wear-shot";
import { CommentSection } from "@/components/domain/comment-section";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getWearShotDetail } from "@/lib/data/comment";

/**
 * S-27 착용샷 상세 (D-178).
 *
 * ## ⚠️ D-148 을 뒤집는다
 * D-148 은 "착용샷 자체 화면은 없다 — 아이템 상세로 보낸다"였다. **댓글이 붙으면서
 * 착용샷 하나가 대화의 단위**가 되었고, 그러면 고유 주소가 있어야 한다 —
 * 알림에서 그 착용샷으로 보낼 곳도 필요하다 (FR-08-A-06).
 *
 * ## ⚠️ 색인하지 않는다
 * **사진 + 방 이름 + 날짜**다. 방 상세(S-02·S-03)가 `noindex` 인데 이걸 색인하면
 * "누가 무엇을 쓰는지"가 검색에 열린다 (D-078·D-031). 이 저장소는 **기본값이
 * noindex** 이므로 여기서 켜지 않는 것으로 충분하다 — `robots` 를 건드리지 않는다.
 *
 * ## 공개 판정은 물려받는다
 * 착용샷은 아이템의 공개 판정을(D-148), 댓글은 그 착용샷을 물려받는다. 조회 계층이
 * 판정하고 화면은 없으면 404 다 (D-083 — 없는 것과 볼 수 없는 것을 구분하지 않는다).
 */
export default async function WearShotPage({
  params,
}: PageProps<"/[locale]/wear/[wearShotId]">) {
  const { wearShotId } = await params;
  const t = await getTranslations();
  const viewer = await getViewer();

  const shot = await getWearShotDetail(wearShotId, viewer);
  if (!shot) notFound();

  // ⚠️ 루틴의 샷은 `인증샷`이다 (D-244). 조회가 낸 `isRoutine` 을 그대로 쓴다
  const shotNoun = t(shot.isRoutine ? "wear.shotNounRoutine" : "wear.shotNoun");

  return (
    <div>
      {/* 저장본이 정방형이다 (D-129) — 컨테이너도 정방형이라 잘리지 않는다 (D-131) */}
      <div className="relative aspect-square w-full overflow-hidden border-b bg-muted">
        {shot.photoUrl && (
          <Image
            src={shot.photoUrl}
            alt=""
            fill
            sizes="(min-width:640px) 500px, 100vw"
            className="object-cover"
            priority
          />
        )}
      </div>

      <header className="px-4 py-4 lg:px-0">
        <p className="text-sm text-muted-foreground">{shot.wornOn}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/items/${shot.itemId}`}
            className="text-lg font-bold tracking-tight hover:underline"
          >
            {shot.itemName}
          </Link>
          <Link
            href={`/rooms/${shot.roomId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {shot.roomName}
          </Link>
        </div>
        {/* 줄바꿈을 살리고 마크다운은 해석하지 않는다 (D-055 와 같은 기준) */}
        {shot.note && (
          <p className="mt-3 whitespace-pre-wrap text-sm">{shot.note}</p>
        )}
      </header>

      <CommentSection
        wearShotId={shot.id}
        comments={shot.comments}
        loggedIn={viewer !== null}
      />

      {/* 착용샷 수정은 아이템 상세에서 한다 (D-148 — 하루 1장 판정이 거기 있다) */}
      {shot.owner && (
        <section className="flex items-center gap-4 border-t px-4 py-4 lg:px-0">
          <Link
            href={`/items/${shot.itemId}`}
            className="text-sm text-muted-foreground underline"
          >
            {t(shot.isRoutine ? "wear.goToItemRoutine" : "wear.goToItem")}
          </Link>
          {/*
            ⚠️ **삭제 진입점이 없었다** (D-180). `deleteWearShot` 은 처음부터
            있었는데 부르는 화면이 없었다 — 하루 1장 제약(D-148) 때문에 잘못 올린
            착용샷을 **그날 안에는 지울 수도 바꿀 수도 없는** 상태였다
          */}
          <DeleteButton
            action={deleteWearShot.bind(null, shot.id)}
            confirmText={t("wear.deleteWearShotConfirm", { shot: shotNoun })}
            label={t("wear.deleteWearShot", { shot: shotNoun })}
            redirectTo="/me/wear"
          />
        </section>
      )}
    </div>
  );
}
