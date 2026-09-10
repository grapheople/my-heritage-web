"use client";

import "leaflet/dist/leaflet.css";
import { Crosshair, LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { Button } from "@/components/ui/button";

/**
 * 지도에서 **핀으로 좌표를 고른다** (D-316).
 *
 * ## ⚠️ 핀을 끌지 않는다 — 지도를 움직인다
 * 핀은 화면 정중앙에 **고정**이고 지도가 그 아래로 움직인다. 모바일에서 작은
 * 마커를 손가락으로 정확히 끄는 것은 어렵고, 끄는 순간 **손가락이 목표 지점을
 * 가린다.** 지도를 미는 방식은 목표가 항상 보인다 — 지도 앱들이 위치를 고를 때
 * 쓰는 방식이 이것이다.
 *
 * ## ⚠️ Leaflet 마커를 쓰지 않는 이유가 하나 더 있다
 * Leaflet 기본 마커는 이미지 경로를 번들러가 못 찾아 **아이콘이 깨지는 것이
 * 고전적인 함정**이다. 핀을 DOM 오버레이로 그리면 그 문제가 원천적으로 없다.
 *
 * ## ⚠️ 서버에서 불러오면 터진다
 * Leaflet 은 `window` 를 즉시 만진다. 그래서 **effect 안에서 동적 import** 한다 —
 * 모듈 최상단에서 `import L from "leaflet"` 하면 SSR 에서 죽는다.
 *
 * ## ⚠️ 타일 출처를 지운다
 * OSM 타일은 **저작자 표시가 이용 조건**이다. `attribution` 을 비우면 안 된다.
 */
export function MapPinPicker({
  center,
  onPick,
  busy,
  pickLabel,
}: {
  /** 초기 중심. 없으면 서울시청 — 이 기능이 서울시 신호 데이터를 쓴다 */
  center?: { lat: number; lon: number };
  onPick: (coords: { lat: number; lon: number }) => void;
  busy?: boolean;
  pickLabel: string;
}) {
  const t = useTranslations("commute");
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    // ⚠️ 동적 import — 위 주석 참조. 최상단 import 는 SSR 에서 죽는다
    void import("leaflet").then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return;
      map = L.map(boxRef.current, {
        center: [center?.lat ?? 37.5665, center?.lon ?? 126.978],
        zoom: center ? 18 : 15,
        // 핀이 정중앙에 고정이라 더블클릭 확대가 핀 위치를 바꾼다 — 끈다
        doubleClickZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // ⚠️ 이용 조건이다. 지우지 말 것
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      // 언마운트 후 남으면 다음 마운트에서 "Map container is already initialized" 로 터진다
      mapRef.current?.remove();
      mapRef.current = null;
      map = null;
    };
    // 최초 1회만 만든다 — center 가 바뀌면 아래 `locate` 처럼 이동만 시킨다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
        setLocating(false);
      },
      // ⚠️ 거부해도 **막다른 길이 아니다** — 지도를 밀어서 고르면 된다.
      // 그래서 오류를 띄우지 않고 버튼만 원상복귀시킨다
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border">
        <div ref={boxRef} className="h-64 w-full" />

        {/* 핀 — 지도 위에 겹치되 **클릭을 가로채지 않는다** (지도를 밀어야 한다) */}
        <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center">
          <Crosshair aria-hidden className="size-8 -translate-y-1 text-destructive drop-shadow" />
        </div>

        {/* 현재 위치로 이동 — 옛 '내 위치로 찾기' 버튼이 여기로 들어왔다 */}
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label={t("mapLocate")}
          className="absolute right-2 top-2 z-[400] grid size-10 place-items-center rounded-md border bg-background/90 hover:bg-accent disabled:opacity-40"
        >
          <LocateFixed aria-hidden className="size-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">{t("mapHint")}</p>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy || !ready}
        onClick={() => {
          const c = mapRef.current?.getCenter();
          if (c) onPick({ lat: c.lat, lon: c.lng });
        }}
      >
        {pickLabel}
      </Button>
    </div>
  );
}
