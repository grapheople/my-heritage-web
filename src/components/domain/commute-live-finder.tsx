"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Direction, LiveRef } from "@/lib/signal/lights";
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
}: {
  lightId: string;
  initial: LiveRef | null;
  onSaved: (target: LiveRef) => void;
}) {
  const t = useTranslations("commute");

  const [target, setTarget] = useState(initial);
  const [open, setOpen] = useState(initial === null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Intersection[] | null>(null);
  const [picked, setPicked] = useState<Intersection | null>(null);
  const [phases, setPhases] = useState<Phase[] | null>(null);

  const fail = (reason: string) => setMessage(t("findFailed", { reason }));

  async function search(params: URLSearchParams) {
    setBusy(true);
    setMessage(null);
    setPhases(null);
    setPicked(null);
    try {
      const res = await fetch(`/api/signal/intersections?${params}`);
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        return;
      }
      setCandidates(body.intersections ?? []);
      if ((body.intersections ?? []).length === 0) setMessage(t("findNone"));
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

  async function loadPhases(intersection: Intersection) {
    setBusy(true);
    setMessage(null);
    setPicked(intersection);
    try {
      const res = await fetch(
        `/api/signal/phases?itstId=${encodeURIComponent(intersection.itstId)}&kind=pedestrian`,
      );
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        setPicked(null);
        return;
      }
      const rows: Phase[] = body.phases ?? [];
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
        body: JSON.stringify({ itstId: picked.itstId, direction, kind: "pedestrian" }),
      });
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? String(res.status));
        return;
      }
      const saved: LiveRef = { itstId: picked.itstId, direction, kind: "pedestrian" };
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
    <section className="rounded-xl border p-4">
      <h2 className="text-sm font-bold">{t("findTitle")}</h2>

      {target && !open && (
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
          <p className="text-xs text-muted-foreground">{t("findIntro")}</p>

          <MapPinPicker busy={busy} onPick={searchByPin} pickLabel={t("mapPick")} />

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search(new URLSearchParams({ q: query.trim(), limit: "10" }));
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

          {candidates && candidates.length > 0 && !phases && (
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
                      {item.distanceM > 0 && (
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {t("distanceM", { meters: item.distanceM })}
                        </span>
                      )}
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
    </section>
  );
}
