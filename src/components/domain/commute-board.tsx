"use client";

import { useState } from "react";
import { CommuteSignal } from "@/components/domain/commute-signal";
import { CommuteTransit } from "@/components/domain/commute-transit";
import type { LiveRef } from "@/lib/signal/lights";
import type { FavoriteView } from "@/lib/transit/favorites";
import type { SignalAnswer } from "@/lib/signal/resolve";

/**
 * 출근길 화면 — 신호등 카드 + 버스·지하철 도착 (D-328).
 *
 * ## ⚠️ 왜 감싸는 컴포넌트가 필요한가
 * 신호등 **찾기**를 「정류장·역 추가」 안으로 옮기면서, 저장 결과를 **두 컴포넌트가
 * 함께** 알아야 하게 됐다:
 *
 * - 대상을 고르는 곳 → `CommuteTransit` 의 신호등 탭
 * - 대상이 있어야 「지금 신호와 맞추기」가 뜨는 곳 → `CommuteSignal`
 *
 * 페이지는 서버 컴포넌트라 그 상태를 들 수 없다. 얇은 클라이언트 한 겹을 두고
 * **여기서만** 들고 있는다 — 두 곳이 각자 상태를 두면 한쪽만 갱신돼, 대상을
 * 정했는데 동기화 버튼이 안 나오는 상태가 된다.
 *
 * ## ⚠️ 목록은 섞지 않는다
 * 입구는 합쳤지만 **저장 대상이 다르다** — 버스·지하철은 유저별
 * `TransitFavorite`, 신호등은 전역 `SignalLightLive`(OI-121)다. 담은 결과가
 * 서로 다른 자리에 보이는 것은 그 차이가 실제로 있기 때문이다.
 */
export function CommuteBoard({
  signal,
  lightId,
  liveTarget,
  favorites,
  asOf,
  loggedIn,
}: {
  signal: SignalAnswer;
  lightId: string;
  liveTarget: LiveRef | null;
  favorites: FavoriteView[];
  asOf: string;
  loggedIn: boolean;
}) {
  const [target, setTarget] = useState(liveTarget);

  return (
    <div className="space-y-4">
      <CommuteSignal
        initial={signal}
        /** 실시간 대상이 정해져 있지 않으면 맞출 것이 없다 */
        syncable={target !== null}
        loggedIn={loggedIn}
      />
      <div className="px-4 pb-10">
        <CommuteTransit
          initial={favorites}
          asOf={asOf}
          loggedIn={loggedIn}
          lightId={lightId}
          liveTarget={target}
          onSignalSaved={setTarget}
        />
      </div>
    </div>
  );
}
