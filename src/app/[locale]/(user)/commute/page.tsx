import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommuteSignal } from "@/components/domain/commute-signal";
import { CommuteTransit } from "@/components/domain/commute-transit";
import { getViewer } from "@/lib/auth/viewer";
import { getLights } from "@/lib/signal/lights";
import { readLiveTarget } from "@/lib/signal/live-target";
import { isFailure, resolveSignal } from "@/lib/signal/resolve";
import { listFavorites } from "@/lib/transit/favorites";

/**
 * 출근길 — 집앞 신호등 잔여시간 (`/api/signal`).
 *
 * ## ⚠️ 기획에 아직 없는 화면이다
 * IA·화면 목록은 **정책 층이라 기획이 SoT** 다 (CLAUDE.md SoT 3층). 이 화면은
 * 코드에 먼저 들어왔으므로 `myroom-service/02-planning-spec.md` 의 화면 목록과
 * §1-1 메뉴에 등록하고 D-번호를 받아야 한다.
 *
 * ## ⚠️ 색인하지 않는다
 * `[locale]/layout.tsx` 의 기본 noindex 를 그대로 둔다. 집앞 신호등은 개인
 * 도구이고, 색인 대상은 도감·마켓·판매중 공개 아이템뿐이다 (D-078).
 *
 * ## 렌더 전략
 * 서버에서 한 번 계산해 내려보내고(첫 화면에 숫자가 이미 있다), 그 뒤 카운트다운은
 * **클라이언트가 스스로 센다** — 초마다 서버에 묻지 않는다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commute");
  return { title: t("title") };
}

/** 남은 초는 요청 시각에 따라 달라진다 — 정적으로 굳으면 지나간 숫자가 나간다 */
export const dynamic = "force-dynamic";

export default async function CommutePage() {
  const t = await getTranslations("commute");

  /*
    등록부의 **첫 신호등**을 보여준다. 지금은 집앞 하나뿐이고, 여러 개가 되면
    선택 UI 가 필요하다 — 그때 기획에서 화면을 정하는 편이 낫다. 여기서 임의로
    탭을 만들면 그 임시 결정이 그대로 굳는다.
  */
  const light = getLights()[0];
  const result = light ? await resolveSignal(light) : null;
  const viewer = await getViewer();
  /*
    ⚠️ 실시간 대상은 **DB 우선**이다 (`SignalLightLive`). 설정 파일만 보면,
    화면에서 교차로를 고른 뒤에도 동기화 버튼이 안 나온다.
  */
  const liveTarget = light ? await readLiveTarget(light.id, light.live) : null;

  /*
    ⚠️ **서버에서 한 번 읽어 내려보낸다** (D-321). 클라이언트가 마운트 후 부르면
    첫 화면이 빈 카드였다가 채워져 고장처럼 보인다. 담아둔 것이 없으면 조회
    한 번으로 끝난다.

    ⚠️ `asOf` 를 **함께** 내려보낸다. 카운트다운이 `Date.now()` 로 시작하면 서버와
    클라이언트의 첫 숫자가 달라 hydration 오류가 난다 — 신호등에서 실제로 겪었다.
  */
  const favorites = viewer ? await listFavorites(viewer.userId) : [];
  const asOf = new Date().toISOString();

  if (!result || isFailure(result)) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-medium">{t("loadFailed")}</p>
        {result && (
          // 설정 문제라 개발자가 읽을 문장이다 — 번역하지 않고 그대로 낸다
          <p className="mt-2 text-xs text-muted-foreground">
            {result.error} — {result.hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommuteSignal
        initial={result}
        /** 실시간 대상이 정해져 있지 않으면 맞출 것이 없다 — 버튼 대신 찾기를 낸다 */
        syncable={liveTarget !== null}
        liveTarget={liveTarget}
        loggedIn={viewer !== null}
      />
      <div className="px-4 pb-10">
        <CommuteTransit initial={favorites} asOf={asOf} loggedIn={viewer !== null} />
      </div>
    </div>
  );
}
