"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Direction, LiveRef, SignalKind } from "@/lib/signal/lights";
import { cn } from "@/lib/utils";

/**
 * 실시간 대상(교차로·방위) 고르기.
 *
 * ## ⚠️ 이 화면이 없으면 실시간 연동을 **쓸 수가 없다**
 * 실시간 조회는 `itstId` 를 요구하는데 그 번호를 사람이 알 방법이 없다. 좌표로
 * 교차로까지는 찾히지만(포털의 「교차로 Map 정보」), **방위는 좌표에 없다** —
 * 한 교차로에 보행 신호가 8방위까지 있고 그중 내가 건너는 것이 어느 것인지는
 * 중심점 좌표로 갈리지 않는다.
 *
 * 그래서 두 단계다: ① 위치로 교차로를 좁히고 ② **지금 이 순간의 8방위 현시**를
 * 받아 눈앞의 신호와 대조해 방위를 고른다. 신호등 앞에 서 있는 사람만 할 수
 * 있는 판단이라, 코드나 환경변수가 아니라 화면에서 정해 DB 에 저장한다.
 *
 * ## ⚠️ ①은 **지도에서 핀으로** 고른다 (D-316)
 * 종전에는 `내 위치로 찾기` 버튼 하나였다. 그런데 **위치 권한을 거부하면 그
 * 경로가 통째로 막히고**, 허용해도 GPS 오차가 수십 m 라 교차로가 여럿인 곳에서
 * 엉뚱한 후보가 나온다. 무엇보다 **집앞 신호등을 집이 아닌 곳에서 등록할 수
 * 없었다** — 실제로 등록은 앉아서 하고 대조는 나가서 한다.
 *
 * 위치 버튼은 없어진 것이 아니라 **지도 안으로 들어갔다** — 지도를 내 위치로
 * 옮기는 보조 컨트롤이다. 거부해도 지도를 밀어 고르면 된다.
 */

/**
 * ⚠️ Leaflet 은 `window` 를 즉시 만져 SSR 에서 죽는다 — `ssr: false` 가 필수다.
 * 이 컴포넌트 자체는 `"use client"` 지만 그것만으로는 **서버 프리렌더를 막지
 * 못한다.**
 */
const MapPinPicker = dynamic(
  () => import("@/components/domain/map-pin-picker").then((m) => m.MapPinPicker),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" /> },
);

type Intersection = {
  itstId: string;
  name: string;
  engName: string | null;
  distanceM: number;
  /**
   * 이 좌표가 **실시간 개방 지역인가** (D-320).
   *
   * ⚠️ 목록에 있다고 실시간이 되는 것이 아니다 — 좌표는 서울·제주·울산 4,239건인데
   * 실시간은 울산 397건뿐이다. 고른 **뒤에야** 알면 유저는 이유를 모른 채 교차로만
   * 바꿔 본다
   */
  live?: boolean;
};
type Phase = {
  direction: Direction;
  state: "green" | "red" | "yellow" | "unknown";
  secondsRemaining: number | null;
};

const STATE_LABEL = {
  green: { key: "shortGreen", text: "text-sale" },
  red: { key: "shortRed", text: "text-destructive" },
  yellow: { key: "shortYellow", text: "text-warn" },
  unknown: { key: "shortUnknown", text: "text-muted-foreground" },
} as const;

export function CommuteLiveFinder({
  lightId,
  initial,
  onSaved,
  /**
   * **다른 화면 안에 끼워 넣을 때** (D-328).
   *
   * ⚠️ 자기 테두리·제목을 그대로 두면 「정류장·역 추가」 패널 안에 **카드 속 카드**가
   * 생긴다. 입구와 종류 선택은 감싸는 쪽이 이미 하고 있으므로 여기서는 본문만 낸다.
   */
  embedded,
}: {
  lightId: string;
  initial: LiveRef | null;
  onSaved: (target: LiveRef) => void;
  embedded?: boolean;
}) {
  const t = useTranslations("commute");

  const [target, setTarget] = useState(initial);
  /** 끼워 넣은 경우 감싸는 쪽이 이미 "추가" 를 눌러 들어온 것이라 늘 열려 있다 */
  const [open, setOpen] = useState(embedded || initial === null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Intersection[] | null>(null);
  const [picked, setPicked] = useState<Intersection | null>(null);
  const [phases, setPhases] = useState<Phase[] | null>(null);
  /** 요청한 종별이 비었을 때 **이 교차로가 실제로 주는** 종별 (2026-09-12) */
  const [altKinds, setAltKinds] = useState<SignalKind[] | null>(null);
  /**
   * 지도를 **펼쳤는가** (D-327).
   *
   * ⚠️ `open` 만 보고 지도를 그리면, 실시간 대상이 정해지지 않은 유저에게는
   * **`/commute` 를 열자마자 지도가 떠 있다** — `open` 의 초기값이 `initial === null`
   * 이기 때문이다. 찾을 생각이 없는 사람에게도 256px 이 깔리고, 그 아래 주기
   * 측정·신호 카드가 밀린다. **누를 때만** 펼친다.
   */
  const [mapOpen, setMapOpen] = useState(false);
  /** 끼워 넣었을 때는 바깥 테두리를 쓰지 않는다 (위 `embedded` 주석) */
  const Shell = embedded ? "div" : "section";
  /**
   * ⚠️ **대조에 쓴 종별을 저장에도 써야 한다.** 예전에는 저장이 `"pedestrian"` 로
   * 박혀 있어, 직진 신호로 방위를 맞춰도 DB 에는 보행으로 들어갔다 — 이후 실시간
   * 조회가 **영원히 빈 필드를 읽는다.**
   */
  const [pickedKind, setPickedKind] = useState<SignalKind>("pedestrian");

  /**
   * 지금이 **위치를 찾는 단계인가** (D-326).
   *
   * ⚠️ 후보·현시·다른 종별 중 무엇이라도 떠 있으면 찾기는 끝난 것이다. 지도를
   * 계속 띄우면 그 아래로 목록이 밀려 모바일에서는 스크롤해야 보인다.
   */
  const searching =
    /*
      ⚠️ **빈 결과는 "찾기가 끝난 것" 이 아니다.** `search()` 는 결과가 없어도
      `[]` 를 넣으므로 `!== null` 로 판정하면 **근처에 교차로가 없을 때 지도가
      사라진다** — 유저는 다른 곳을 찍어볼 수단을 잃는다.
    */
    (candidates === null || candidates.length === 0) && phases === null && altKinds === null;

  const fail = (reason: string) => setMessage(t("findFailed", { reason }));

  async function search(params: URLSearchParams) {
    setBusy(true);
    setMessage(null);
    setPhases(null);
    setPicked(null);
    setAltKinds(null);
    try {
      const res = await fetch(`/api/signal/intersections?${params}`);
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        return;
      }
      const rows: Intersection[] = body.intersections ?? [];
      setCandidates(rows);
      /*
        ⚠️ **비어 있을 때만 안내하면 늦다.** 후보가 5건 나와도 전부 실시간 밖이면
        유저는 하나를 고르고 나서야 "개방 대상이 아니다" 를 본다 — 그러면 다른
        교차로를 골라 보게 되고, 몇 번을 반복해도 결과는 같다. 좌표 목록은
        서울·제주·울산 4,239건인데 실시간은 울산 397건뿐이라 **대부분이 이 경우**다
        (D-320)
      */
      if (rows.length === 0) setMessage(t("findNone"));
      else if (rows.every((r) => !r.live)) setMessage(t("findNoLiveHere"));
    } catch {
      fail("network");
    } finally {
      setBusy(false);
    }
  }

  /** 지도 핀이 가리키는 좌표로 주변 교차로를 찾는다 (D-316) */
  function searchByPin(coords: { lat: number; lon: number }) {
    void search(
      new URLSearchParams({
        lat: String(coords.lat),
        lon: String(coords.lon),
        limit: "5",
      }),
    );
  }

  /**
   * 교차로의 8방위 현시를 받는다.
   *
   * ## ⚠️ 보행 신호가 없는 교차로가 있다
   * 예전에는 `kind=pedestrian` 로 **고정**이었다. 그런데 울산 교차로는 보행 필드를
   * 가지고 있으면서 값이 비어 있어, 8방위가 전부 "알 수 없음" 인 표가 나왔다 —
   * 화면은 방위 버튼 8개를 띄우지만 **어느 것이 눈앞 신호인지 대조할 수가 없어**
   * 거기서 멈춘다. 서버가 "이 교차로가 값을 주는 종별" 을 함께 내려주므로
   * 그것으로 다시 부를 수 있게 한다 (2026-09-12).
   */
  async function loadPhases(intersection: Intersection, kind: SignalKind = "pedestrian") {
    setBusy(true);
    setMessage(null);
    setAltKinds(null);
    setPicked(intersection);
    try {
      const res = await fetch(
        `/api/signal/phases?itstId=${encodeURIComponent(intersection.itstId)}&kind=${kind}`,
      );
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        // ⚠️ **고른 교차로를 버리지 않는다.** 다른 종별로 다시 부를 것이기 때문이다
        const kinds: SignalKind[] = (body.kinds ?? []).filter((k: SignalKind) => k !== kind);
        if (kinds.length > 0) setAltKinds(kinds);
        else setPicked(null);
        return;
      }
      const rows: Phase[] = body.phases ?? [];
      setPickedKind(kind);
      setPhases(rows);
      // 전부 같은 상태면 대조가 불가능하다 — 기다렸다 다시 받아야 한다
      if (rows.length > 1 && new Set(rows.map((r) => r.state)).size === 1) {
        setMessage(t("findAllSame"));
      }
    } catch {
      fail("network");
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  async function save(direction: Direction) {
    if (!picked) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/signal/live?id=${encodeURIComponent(lightId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itstId: picked.itstId, direction, kind: pickedKind }),
      });
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        return;
      }
      const saved: LiveRef = { itstId: picked.itstId, direction, kind: pickedKind };
      setTarget(saved);
      setOpen(false);
      setCandidates(null);
      setPhases(null);
      setMessage(
        t("findSaved", { name: picked.name, direction: t(`directions.${direction}`) }),
      );
      onSaved(saved);
    } catch {
      fail("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell className={embedded ? "space-y-2" : "rounded-xl border p-4"}>
      {!embedded && <h2 className="text-sm font-bold">{t("findTitle")}</h2>}

      {!embedded && target && !open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("findCurrent", {
              name: target.itstId,
              direction: t(`directions.${target.direction}`),
            })}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            {t("findReset")}
          </Button>
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-3">
          {/*
            ⚠️ **지도는 위치를 찾는 동안에만 낸다.**
            후보가 나온 뒤에도 계속 떠 있으면 256px 짜리 지도가 화면 위쪽을
            차지해, 정작 골라야 할 **교차로 목록과 방위 버튼이 아래로 밀린다** —
            모바일에서는 스크롤해야 보인다. 찾기가 끝나면 자리를 비운다.
          */}
          {searching ? (
            <>
              <p className="text-xs text-muted-foreground">{t("findIntro")}</p>

              {mapOpen ? (
                <MapPinPicker busy={busy} onPick={searchByPin} pickLabel={t("mapPick")} />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setMapOpen(true)}
                >
                  <MapPin aria-hidden className="size-4" />
                  {t("findOnMap")}
                </Button>
              )}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) {
                    void search(new URLSearchParams({ q: query.trim(), limit: "10" }));
                  }
                }}
              >
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("findSearchPlaceholder")}
                  aria-label={t("findSearchPlaceholder")}
                />
                <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
                  {t("findSearch")}
                </Button>
              </form>
            </>
          ) : (
            /* ⚠️ 되돌아올 길을 남긴다 — 지도를 감추기만 하면 다른 교차로를 고르려고
               화면 전체를 닫았다 다시 열어야 한다 */
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCandidates(null);
                setPhases(null);
                setPicked(null);
                setAltKinds(null);
                setMessage(null);
                // 다시 찾을 때는 지도부터 — 그것이 이 버튼을 누른 이유다
                setMapOpen(true);
              }}
            >
              {t("findAgain")}
            </Button>
          )}

          {altKinds && altKinds.length > 0 && picked && (
            <div>
              <p className="text-xs font-medium">{t("findPickKind")}</p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {altKinds.map((kind) => (
                  <li key={kind}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadPhases(picked, kind)}
                      className="min-h-11 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
                    >
                      {t(`kinds.${kind}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {candidates && candidates.length > 0 && !phases && !altKinds && (
            <div>
              <p className="text-xs font-medium">{t("findPickIntersection")}</p>
              <ul className="mt-2 space-y-1">
                {candidates.map((item) => (
                  <li key={item.itstId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadPhases(item)}
                      className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {/* ⚠️ 실시간이 **되는 쪽**에만 배지를 단다. 안 되는 쪽에 경고를
                            달면 목록 대부분이 경고로 덮여 신호가 죽는다 */}
                        {item.live && (
                          <span className="rounded bg-sale/10 px-1.5 py-0.5 font-medium text-sale">
                            {t("liveBadge")}
                          </span>
                        )}
                        {item.distanceM > 0 && t("distanceM", { meters: item.distanceM })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phases && picked && (
            <div>
              <p className="text-xs font-medium">{t("findPickDirection")}</p>
              <ul className="mt-2 grid grid-cols-2 gap-1">
                {phases.map((phase) => {
                  const label = STATE_LABEL[phase.state];
                  return (
                    <li key={phase.direction}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save(phase.direction)}
                        className="flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{t(`directions.${phase.direction}`)}</span>
                        <span className={cn("text-xs font-medium", label.text)}>
                          {t(label.key)}
                          {phase.secondsRemaining !== null && ` ${phase.secondsRemaining}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </Shell>
  );
}
