"use client";

import dynamic from "next/dynamic";
import { Bus, Plus, RefreshCw, Train, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HIDE_AFTER_SEC, STALE_AFTER_SEC } from "@/lib/transit/constants";
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
  routes?: { routeId: string; routeName: string; headsign?: string }[];
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
}: {
  initial: FavoriteView[];
  /** 서버가 목록을 만든 시각 (ISO) — 첫 카운트의 기준 */
  asOf: string;
  loggedIn: boolean;
}) {
  const t = useTranslations("transit");

  const [favorites, setFavorites] = useState(initial);
  const [nowMs, setNowMs] = useState(() => new Date(asOf).getTime());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<"BUS" | "SUBWAY" | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

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

  async function search(params: URLSearchParams) {
    setCandidates(null);
    const body = await call(`/api/transit/stops?${params}`);
    if (!body) return;
    const stops: Candidate[] = body.stops ?? [];
    setCandidates(stops);
    if (stops.length === 0) setMessage(t("searchNone"));
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
              const live = f.arrivals.filter((a) => {
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
                          "shrink-0 font-bold tabular-nums",
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
                    </li>
                  );
                })}
              </ul>
              );
            })()}
          </li>
        ))}
      </ul>

      {adding === null ? (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding("BUS")} disabled={busy}>
            <Plus aria-hidden className="size-4" />
            {t("addBus")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdding("SUBWAY")} disabled={busy}>
            <Plus aria-hidden className="size-4" />
            {t("addSubway")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {/*
            ⚠️ **종류마다 찾는 방법이 다르다.** 버스는 좌표로 찾는다 — 이름 검색이
            도시코드를 먼저 요구하는데 유저가 답할 수 없는 질문이다. 지하철은
            역명이 곧 조회 키다
          */}
          {adding === "BUS" ? (
            <MapPinPicker
              busy={busy}
              pickLabel={t("pickHere")}
              onPick={(c) =>
                void search(
                  new URLSearchParams({ kind: "BUS", lat: String(c.lat), lon: String(c.lon) }),
                )
              }
            />
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

          {candidates && candidates.length > 0 && (
            <ul className="space-y-1">
              {candidates.map((c) => {
                const routes = c.routes ?? [];
                return (
                  <li key={`${c.stopId}-${routes[0]?.routeId ?? ""}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void add(c, routes[0])}
                      className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">{c.stopName}</span>
                      {routes[0] && (
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {routes[0].routeName}
                          {routes[0].headsign ? ` · ${routes[0].headsign}` : ""}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(null);
              setCandidates(null);
              setMessage(null);
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}
