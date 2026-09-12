"use client";

import dynamic from "next/dynamic";
import { Bus, Eye, EyeOff, Plus, RefreshCw, Train, TrafficCone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HIDE_AFTER_SEC, STALE_AFTER_SEC } from "@/lib/transit/constants";
import { CommuteLiveFinder } from "@/components/domain/commute-live-finder";
import type { LiveRef } from "@/lib/signal/lights";
import type { FavoriteView } from "@/lib/transit/favorites";
import { cn } from "@/lib/utils";

/**
 * 출근길 **버스·지하철 도착 카운트** (D-321).
 *
 * ## ⚠️ 카운트다운의 기준은 **받은 시각**이다
 * 포털이 주는 값은 "받은 시각 기준 남은 초" 다. `predictSec` 를 그대로 세면
 * 페이지를 오래 열어둔 만큼 틀린다 — 5분 전에 받은 "3분 뒤 도착" 은 이미 지난
 * 차다. `fetchedAt` 부터 흐른 시간을 뺀다.
 *
 * ## ⚠️ 서버 시각으로 시작한다
 * `useState(() => Date.now())` 로 시작하면 서버 렌더와 클라이언트 렌더의 숫자가
 * 달라 **hydration 오류**가 난다 — 신호등에서 실제로 겪었다(50 vs 49). 서버가
 * 내려준 `asOf` 를 그대로 첫 값으로 쓴다.
 *
 * ## ⚠️ 초마다 서버에 묻지 않는다
 * 카운트다운은 브라우저가 스스로 센다. 포털은 **유저가 누를 때**만 부른다 —
 * 하루 호출 상한이 있어서다.
 */

/** 지도 핀 — Leaflet 은 `window` 를 즉시 만져 SSR 에서 죽는다 (D-316) */
const MapPinPicker = dynamic(
  () => import("@/components/domain/map-pin-picker").then((m) => m.MapPinPicker),
  {
    ssr: false,
    loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />,
  },
);

type Candidate = {
  kind: "BUS" | "SUBWAY";
  stopId: string;
  stopName: string;
  cityCode?: string;
  lat?: number;
  lon?: number;
  /** 핀에서 얼마나 떨어졌나 — 길 건너편 정류장을 가르는 유일한 단서다 */
  distanceM?: number;
  routes?: { routeId: string; routeName: string; headsign?: string }[];
};

/** 정류장을 지나는 노선 (D-323) */
type RouteAtStop = {
  routeId: string;
  routeName: string;
  routeType?: string;
  startName?: string;
  endName?: string;
};

/** `mm:ss` — 분이 0이면 초만 */
function clock(sec: number): string {
  if (sec <= 0) return "0";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}

export function CommuteTransit({
  initial,
  asOf,
  loggedIn,
  lightId,
  liveTarget,
  onSignalSaved,
}: {
  initial: FavoriteView[];
  /** 서버가 목록을 만든 시각 (ISO) — 첫 카운트의 기준 */
  asOf: string;
  loggedIn: boolean;
  /**
   * 신호등 찾기를 **같은 입구에 끼워 넣는다** (D-328).
   *
   * ⚠️ 저장 대상이 다르다 — 버스·지하철은 유저별 `TransitFavorite`, 신호등은
   * 전역 `SignalLightLive`(OI-121)다. 그래서 **목록에는 섞지 않고 입구만** 합친다.
   * 담은 결과가 서로 다른 곳에 보이는 것은 그 차이가 실제로 있기 때문이다.
   */
  lightId: string;
  liveTarget: LiveRef | null;
  onSignalSaved: (target: LiveRef) => void;
}) {
  const t = useTranslations("transit");

  const [favorites, setFavorites] = useState(initial);
  const [nowMs, setNowMs] = useState(() => new Date(asOf).getTime());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<"BUS" | "SUBWAY" | "SIGNAL" | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  /**
   * 목록에서 고른 정류장 — **아직 확정 전**이다 (D-323).
   *
   * ⚠️ 버스 정류장은 **상행·하행 이름이 같다.** 고르는 즉시 담아버리면 길 건너편을
   * 담아놓고도 모른다. 고르면 **지도가 그리로 옮겨가 점을 찍고**, 유저가 눈으로
   * 확인한 뒤 확정한다.
   */
  const [chosen, setChosen] = useState<Candidate | null>(null);
  /** 확정한 정류장의 경유노선 — `null` 은 아직 안 받음, `[]` 는 포털에 없음 */
  const [routes, setRoutes] = useState<RouteAtStop[] | null>(null);
  /**
   * 보임·숨김 탭 (D-324).
   *
   * ⚠️ 숨긴 것을 **지우지 않는** 이유가 이 탭이다 — 되돌릴 자리가 없으면
   * 잘못 숨겼을 때 정류장을 다시 찾아 담아야 한다.
   */
  const [tab, setTab] = useState<"visible" | "hidden">("visible");

  useEffect(() => {
    // 250ms 로 돈다 — 초 경계가 눈에 띄게 늦지 않을 만큼만 촘촘하다
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  /*
    ⚠️ **낡은 스냅샷을 그대로 세면 거짓말이 된다.** 어제 담아둔 정류장을 오늘 열면
    카운트다운이 한참 음수가 되고 화면은 그것을 "곧 도착" 으로 띄운다 — 오지 않을
    차를 기다리게 하는 가장 나쁜 실패다. 열 때 한 번만 다시 받는다.

    ⚠️ **열 때마다 무조건 부르지는 않는다.** 포털에 하루 한도가 있어서, 45초 안의
    값이면 저장된 것으로 충분하다.
  */
  const autoRefreshed = useRef(false);
  useEffect(() => {
    if (autoRefreshed.current || initial.length === 0) return;
    const newest = Math.max(
      0,
      ...initial.flatMap((f) => f.arrivals.map((a) => new Date(a.fetchedAt).getTime())),
    );
    const stale = newest === 0 || Date.now() - newest > STALE_AFTER_SEC * 1000;
    if (!stale) return;
    autoRefreshed.current = true;
    void call("/api/transit/refresh", { method: "POST" });
    // 최초 1회만 — `call` 은 매 렌더 새로 만들어지므로 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const hiddenCount = favorites.reduce((n, f) => n + f.hiddenRoutes.length, 0);

  const fail = (reason: string) => setMessage(t("failed", { reason }));

  async function call(input: RequestInfo, init?: RequestInit) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(input, init);
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        return null;
      }
      if (body.favorites) setFavorites(body.favorites);
      return body;
    } catch {
      fail("network");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function resetPick() {
    setChosen(null);
    setRoutes(null);
  }

  async function search(params: URLSearchParams) {
    setCandidates(null);
    resetPick();
    const body = await call(`/api/transit/stops?${params}`);
    if (!body) return;
    const stops: Candidate[] = body.stops ?? [];
    setCandidates(stops);
    if (stops.length === 0) setMessage(t("searchNone"));
  }

  /** 정류장 확정 → 경유노선 목록 (D-323 3~4단계) */
  async function confirmStop(c: Candidate) {
    if (c.kind === "SUBWAY") {
      // 지하철은 역 검색이 이미 호선·방향을 줬다 — 한 번 더 물을 것이 없다
      await add(c, c.routes?.[0]);
      return;
    }
    const body = await call(
      `/api/transit/routes?kind=BUS&stopId=${encodeURIComponent(c.stopId)}&cityCode=${encodeURIComponent(c.cityCode ?? "")}`,
    );
    // 실패해도 **정류장 전체로 담는 길은 남긴다** — 빈 배열이 그 상태다
    setRoutes((body?.routes as RouteAtStop[]) ?? []);
  }

  function setHidden(favoriteId: string, routeId: string, routeName: string, hidden: boolean) {
    void call("/api/transit/favorites", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: favoriteId, routeId, routeName, hidden }),
    });
  }

  async function add(c: Candidate, route?: { routeId: string; routeName: string; headsign?: string }) {
    const body = await call("/api/transit/favorites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: c.kind,
        stopId: c.stopId,
        stopName: c.stopName,
        cityCode: c.cityCode,
        lat: c.lat,
        lon: c.lon,
        routeId: route?.routeId,
        routeName: route?.routeName,
        headsign: route?.headsign,
      }),
    });
    if (!body) return;
    setAdding(null);
    setCandidates(null);
    setQuery("");
    resetPick();
    // 담자마자 숫자가 보여야 한다 — 빈 카드가 먼저 뜨면 고장으로 읽힌다
    await call(`/api/transit/refresh?id=${encodeURIComponent(body.id)}`, { method: "POST" });
  }

  if (!loggedIn) {
    return (
      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-bold">{t("title")}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{t("loginToUse")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{t("title")}</h2>
        {favorites.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void call("/api/transit/refresh", { method: "POST" })}
            aria-label={t("refresh")}
            className="grid size-9 place-items-center rounded-md hover:bg-accent disabled:opacity-40"
          >
            <RefreshCw aria-hidden className={cn("size-4", busy && "animate-spin")} />
          </button>
        )}
      </div>

      {favorites.length === 0 && !adding && (
        <p className="mt-2 text-xs text-muted-foreground">{t("intro")}</p>
      )}

      {/* ⚠️ 숨긴 것이 하나도 없으면 탭이 **의미 없는 선택지**다 — 그때는 내지 않는다 */}
      {hiddenCount > 0 && (
        <div role="tablist" aria-label={t("title")} className="mt-3 flex gap-1 rounded-lg bg-muted p-1">
          {(["visible", "hidden"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "min-h-9 flex-1 rounded-md px-3 text-xs font-medium",
                tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "visible" ? t("tabVisible") : t("tabHidden", { count: hiddenCount })}
            </button>
          ))}
        </div>
      )}

      {tab === "hidden" ? (
        /* ── 숨김 탭 — 되돌리기만 한다 ── */
        <ul className="mt-3 space-y-2">
          {favorites
            .filter((f) => f.hiddenRoutes.length > 0)
            .map((f) => (
              <li key={f.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{f.stopName}</p>
                <ul className="mt-2 space-y-1">
                  {f.hiddenRoutes.map((h) => (
                    <li key={h.routeId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{h.routeName}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setHidden(f.id, h.routeId, h.routeName, false)}
                        className="flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent disabled:opacity-40"
                      >
                        <Eye aria-hidden className="size-3.5" />
                        {t("unhide")}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      ) : (
      <ul className="mt-3 space-y-2">
        {favorites.map((f) => (
          <li key={f.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {f.kind === "BUS" ? (
                    <Bus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Train aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{f.stopName}</span>
                </p>
                {f.routeName && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {f.routeName}
                    {f.headsign ? ` · ${f.headsign}` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void call(`/api/transit/favorites?id=${encodeURIComponent(f.id)}`, {
                    method: "DELETE",
                  })
                }
                aria-label={t("remove")}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-40"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            {(() => {
              /*
                ⚠️ **한참 지난 행은 버린다.** 스냅샷이 낡으면 전부 음수가 되는데,
                그것을 "곧 도착" 으로 띄우면 오지 않을 차를 기다리게 된다.
              */
              const hidden = new Set(f.hiddenRoutes.map((h) => h.routeId));
              const live = f.arrivals.filter((a) => {
                // ⚠️ 숨김은 **화면에서** 거른다 — 서버가 빼면 숨김 탭이 보여줄 것이 없다
                if (hidden.has(a.routeId)) return false;
                const age = Math.floor((nowMs - new Date(a.fetchedAt).getTime()) / 1000);
                /*
                  ⚠️ 초를 주지 않는 노선(정거장 수만 오는 신분당선 등)은 **시간으로
                  지났는지 판정할 수 없다.** 스냅샷 자체가 낡았는지로 가른다 —
                  아니면 영영 안 사라지거나, 멀쩡한 행이 곧바로 숨는다
                */
                if (a.predictSec === null) return age < STALE_AFTER_SEC * 4;
                return a.predictSec - age > -HIDE_AFTER_SEC;
              });
              return live.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("noArrival")}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {live.map((a) => {
                  /*
                    ⚠️ **받은 시각부터 흐른 만큼 뺀다.** 이것이 이 화면의 핵심이다 —
                    저장된 `predictSec` 를 그대로 쓰면 페이지를 열어둔 시간만큼 틀린다
                  */
                  const elapsed = Math.floor((nowMs - new Date(a.fetchedAt).getTime()) / 1000);
                  const left = a.predictSec === null ? null : a.predictSec - elapsed;
                  const soon = left !== null && left > 0 && left <= 60;
                  return (
                    <li
                      key={`${a.routeId}-${a.seq}`}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-muted-foreground">
                        {a.routeName}
                        {/*
                          ⚠️ **행마다 종점이 다르다.** 1호선 상행 하나에 광운대·연천·
                          의정부·청량리가 섞인다 — 어디까지 가는 차인지가 탈지 말지를
                          가른다 (D-325). 정류장 이름줄의 종점은 방향 요약이라 여기
                          한 번 더 나와도 같은 말이 아니다
                        */}
                        {a.headsign ? ` · ${a.headsign}` : ""}
                        {a.seq > 1 ? ` · ${t("next")}` : ""}
                        {/*
                          ⚠️ 초가 없는 노선은 정거장 수가 **본문**이라 오른쪽에 크게
                          띄운다 — 여기 한 번 더 적으면 같은 말이 두 번 나온다
                        */}
                        {left !== null && a.stopsLeft !== null && a.stopsLeft !== undefined
                          ? ` · ${t("stopsLeft", { count: a.stopsLeft })}`
                          : ""}
                      </span>
                      <span
                        className={cn(
                          "ml-auto shrink-0 font-bold tabular-nums",
                          left !== null && left <= 0 && "text-muted-foreground",
                          soon && "text-sale",
                        )}
                      >
                        {left === null
                          ? /*
                               ⚠️ **초를 주지 않는 노선이 있다** (신분당선 등). 카운트다운
                               대신 정거장 수를 낸다 — 초가 없다고 행을 버리면 그 노선이
                               통째로 사라진다 (2026-09-12)
                             */
                            t("stopsLeft", { count: a.stopsLeft ?? 0 })
                          : left <= 0
                            ? t("arrived")
                            : t("inSeconds", { time: clock(left) })}
                      </span>
                      {/* ⚠️ 지우기가 아니라 **숨기기**다 — 되돌릴 수 있어야 한다 */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setHidden(f.id, a.routeId, a.routeName, true)}
                        aria-label={t("hideRoute", { name: a.routeName })}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
                      >
                        <EyeOff aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              );
            })()}
          </li>
        ))}
      </ul>
      )}

      {adding === null ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setAdding("BUS")}
          disabled={busy}
        >
          <Plus aria-hidden className="size-4" />
          {t("addStop")}
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          {/*
            ⚠️ **입구는 하나지만 검색창은 합치지 않는다** (D-326).
            버스는 좌표로 찾는다 — 이름 검색이 도시코드를 먼저 요구하는데 유저가
            답할 수 없는 질문이다. 지하철은 역명이 곧 조회 키이고 좌표로는 못
            찾는다. 한 입력창으로 묶으면 **입력에 따라 되기도 하고 안 되기도 하는**
            검색이 된다 — 유저는 무엇이 문제인지 알 수 없다. 종류를 먼저 고르게
            하고 그에 맞는 방법만 낸다.
          */}
          <div role="tablist" aria-label={t("addStop")} className="flex gap-1 rounded-lg bg-muted p-1">
            {(["BUS", "SUBWAY", "SIGNAL"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={adding === k}
                disabled={busy}
                onClick={() => {
                  if (adding === k) return;
                  // ⚠️ 종류를 바꾸면 이전 후보·선택을 지운다 — 버스 정류장을 고른 채
                  //    지하철 목록이 뜨면 담기가 엉뚱한 값을 보낸다
                  setAdding(k);
                  setCandidates(null);
                  setQuery("");
                  resetPick();
                  setMessage(null);
                }}
                className={cn(
                  "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium",
                  adding === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "BUS" ? (
                  <Bus aria-hidden className="size-3.5" />
                ) : k === "SUBWAY" ? (
                  <Train aria-hidden className="size-3.5" />
                ) : (
                  <TrafficCone aria-hidden className="size-3.5" />
                )}
                {k === "BUS" ? t("kindBus") : k === "SUBWAY" ? t("kindSubway") : t("kindSignal")}
              </button>
            ))}
          </div>

          {/*
            ⚠️ **노선을 고르는 단계에서는 지도를 내린다** (D-327). 정류장은 이미
            확정됐고 지도는 할 일이 없는데, 256px 이 남아 노선 목록을 아래로
            밀어낸다 — 정류장을 고를 때(상행·하행 확인)만 필요하다.
          */}
          {adding === "SIGNAL" ? (
            /*
              ⚠️ **신호등은 흐름 전체가 다르다** — 교차로를 고른 뒤 8방위 현시를
              받아 눈앞 신호와 대조해야 한다(D-317). 그 판단은 신호등 앞에 선
              사람만 할 수 있어 정류장 고르기와 단계가 겹치지 않는다. 그래서 이
              탭에서는 **기존 찾기 컴포넌트를 그대로** 낸다 — 다시 구현하면 두 벌이
              갈린다.
            */
            <CommuteLiveFinder
              embedded
              lightId={lightId}
              initial={liveTarget}
              onSaved={(target) => {
                onSignalSaved(target);
                setAdding(null);
              }}
            />
          ) : adding === "BUS" ? (
            /* ⚠️ **조건을 `adding` 과 합치지 않는다.** `adding === "BUS" && routes === null`
               로 쓰면 노선 단계에서 else 로 떨어져 **지하철 이름 검색창**이 뜬다 */
            routes === null && (
            <MapPinPicker
              busy={busy}
              pickLabel={t("pickHere")}
              /* ⚠️ 목록에서 고른 정류장을 지도에 찍는다 — 상행·하행을 가르는 단서다 */
              focus={chosen?.lat !== undefined && chosen?.lon !== undefined
                ? { lat: chosen.lat, lon: chosen.lon }
                : null}
              hidePick={chosen !== null}
              onPick={(c) =>
                void search(
                  new URLSearchParams({ kind: "BUS", lat: String(c.lat), lon: String(c.lon) }),
                )
              }
            />
            )
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) {
                  void search(new URLSearchParams({ kind: "SUBWAY", q: query.trim() }));
                }
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("stationPlaceholder")}
                aria-label={t("stationPlaceholder")}
              />
              <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
                {t("search")}
              </Button>
            </form>
          )}

          {/* ── 2단계: 정류장 목록. 고르면 **담지 않고** 지도에 표시만 한다 ── */}
          {candidates && candidates.length > 0 && routes === null && (
            <ul className="space-y-1">
              {candidates.map((c) => {
                const r0 = c.routes?.[0];
                const picked = chosen?.stopId === c.stopId && chosen?.routes?.[0]?.routeId === r0?.routeId;
                return (
                  <li key={`${c.stopId}-${r0?.routeId ?? ""}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setChosen(c)}
                      aria-pressed={picked}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent",
                        picked && "bg-accent ring-1 ring-primary",
                      )}
                    >
                      <span className="truncate">{c.stopName}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {r0
                          ? `${r0.routeName}${r0.headsign ? ` · ${r0.headsign}` : ""}`
                          : c.distanceM !== undefined
                            ? t("distanceM", { meters: c.distanceM })
                            : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── 3단계: 지도에서 확인하고 확정 ── */}
          {chosen && routes === null && (
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void confirmStop(chosen)}
            >
              {t("confirmStop", { name: chosen.stopName })}
            </Button>
          )}

          {/* ── 4~5단계: 노선 고르기 ── */}
          {chosen && routes !== null && (
            <div className="space-y-2">
              <p className="text-xs font-medium">{t("pickRoute", { name: chosen.stopName })}</p>
              {routes.length === 0 && (
                /* ⚠️ 포털에 그 정류장 노선이 없는 경우가 있다 — 막지 않고 전체로 담는다 */
                <p className="text-xs text-muted-foreground">{t("noRoute")}</p>
              )}
              <ul className="space-y-1">
                {routes.map((r) => (
                  <li key={r.routeId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void add(chosen, {
                          routeId: r.routeId,
                          routeName: r.routeName,
                          // 기점→종점이 방향을 말해 준다 — 같은 번호가 양방향으로 선다
                          headsign: r.endName,
                        })
                      }
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{r.routeName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {r.startName && r.endName ? `${r.startName} → ${r.endName}` : (r.routeType ?? "")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void add(chosen)}
              >
                {t("addWholeStop")}
              </Button>
            </div>
          )}

          {/* ⚠️ 한 번에 처음으로 보내지 않는다 — 노선까지 갔다가 정류장을 다시
              고르고 싶을 때 지도부터 다시 잡는 것은 과하다 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (routes !== null) return setRoutes(null);
              if (chosen !== null) return setChosen(null);
              setAdding(null);
              setCandidates(null);
              setMessage(null);
            }}
          >
            {routes !== null || chosen !== null ? t("back") : t("cancel")}
          </Button>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}
