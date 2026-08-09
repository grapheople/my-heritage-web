"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 정방형 크롭 가이드 (D-129).
 *
 * ## ⚠️ 이 화면이 없으면 서버가 **가운데를 잘라버린다**
 * 저장은 항상 정방형이다 (`lib/storage.ts`). 화면이 없으면 유저는 자기 사진의
 * 어디가 남는지 모른 채 올리고, 시계 문자판이 잘린 뒤에야 알게 된다.
 * **자르는 것 자체보다 어디가 잘리는지 모르는 것이 문제다.**
 *
 * ## ⚠️ 서버 크롭을 대체하지 않는다
 * 여기서 이미 정방형으로 만들어 보내므로 서버의 `fit: "cover"` 는 아무 일도
 * 하지 않는다. 그래도 서버 크롭을 남겨둔다 — 요청을 직접 보내는 경로가 있고,
 * 화면만 믿으면 우회된다. EXIF 제거를 서버에서만 하는 것과 같은 이유다.
 *
 * ## ⚠️ HEIC 는 브라우저가 못 읽는다
 * iPhone 기본 촬영본이 HEIC 다 — **가장 흔한 입력인데 미리보기가 안 된다.**
 * 그때는 크롭을 건너뛰고 원본을 그대로 보낸다. 서버가 가운데를 자른다.
 * 여기서 막으면 아이폰 유저가 사진을 못 올린다.
 */
/**
 * 미리보기 한 변의 **최대**값. 실제 값은 화면 폭에 맞춰 줄어든다.
 *
 * ⚠️ **고정값으로 두면 좁은 기기에서 미리보기가 거짓말을 한다.** 320px 폭
 * 기기에서는 팝업 안쪽이 256px 라 280px 상자가 잘리는데, 저장은 잘리지 않은
 * 기준으로 이뤄져 **보이는 것과 저장되는 것이 달라진다.** 크롭 UI 의 존재
 * 이유가 "보이는 것이 저장된다"이므로 이건 그냥 버그다.
 */
const MAX_VIEW = 280;
/** 출력 한 변. 서버가 다시 줄이므로 넉넉하면 된다 */
const OUT = 1600;

/** 최대 확대 배율 (슬라이더 오른쪽 끝) */
const MAX_ZOOM = 3;

export function SquareCropper({
  file,
  onDone,
  onCancel,
  index,
  total,
}: {
  file: File;
  /** 크롭 결과. 미리보기 불가 형식이면 원본 그대로 넘어온다 */
  onDone: (blob: Blob) => void;
  onCancel: () => void;
  index: number;
  total: number;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  /**
   * 슬라이더 위치 `-1 ~ 1`. **0이 가운데이자 기본값**이다.
   *
   * | 위치 | 배율 | 보이는 것 |
   * |---|---|---|
   * | `-1` | 사진 전체가 들어가는 배율 | 사진 전부 + 위아래(또는 좌우) 여백 |
   * | `0` | 짧은 변이 꽉 차는 배율 | 여백 없음. 긴 쪽이 잘린다 |
   * | `+1` | 3배 | 확대 |
   *
   * ⚠️ **배율을 슬라이더 값으로 직접 쓰면 가운데가 기본값이 되지 않는다.**
   * 축소 범위(1→0.56 같은 값)와 확대 범위(1→3)의 폭이 다르기 때문이다.
   * 위치를 따로 두고 양쪽을 각각 선형으로 매핑한다.
   */
  const [slider, setSlider] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(MAX_VIEW);

  // 실제로 그릴 수 있는 폭을 재서 쓴다 — 위 주석 참조
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setView(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let dead = false;
    createImageBitmap(file)
      .then((bm) => {
        if (dead) return bm.close();
        setBitmap(bm);
        setSlider(0);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => {
        // HEIC 등 — 위 주석 참조. 막지 않고 원본을 그대로 보낸다
        if (!dead) setUnsupported(true);
      });
    return () => {
      dead = true;
    };
  }, [file]);

  /**
   * 짧은 변이 뷰포트를 채우는 배율 — 처음부터 빈 곳이 없어야 한다.
   *
   * ⚠️ 디코드와 분리해 둔다. 한 값으로 묶으면 **화면 폭이 바뀔 때마다 이미지를
   * 다시 디코드**하고 유저가 맞춘 위치까지 초기화된다.
   */
  const baseScale = bitmap
    ? view / Math.min(bitmap.width, bitmap.height)
    : 1;

  /**
   * 사진 전체가 들어가는 배율 (슬라이더 왼쪽 끝).
   *
   * `baseScale` 이 짧은 변 기준이므로, 긴 변까지 넣으려면 **짧은 변 ÷ 긴 변**
   * 만큼 더 줄이면 된다. 정사각형 원본이면 1이라 축소 구간이 없다 — 이미
   * 전체가 보이므로 맞다
   */
  const minZoom = bitmap
    ? Math.min(bitmap.width, bitmap.height) / Math.max(bitmap.width, bitmap.height)
    : 1;

  const zoom =
    slider < 0 ? 1 + slider * (1 - minZoom) : 1 + slider * (MAX_ZOOM - 1);

  /** 이동 가능 범위 — 사진 밖의 빈 영역이 보이지 않게 가둔다 */
  const clamp = useCallback(
    (next: { x: number; y: number }, z: number, bm: ImageBitmap, scale: number) => {
      const w = bm.width * scale * z;
      const h = bm.height * scale * z;
      const mx = Math.max(0, (w - view) / 2);
      const my = Math.max(0, (h - view) / 2);
      return {
        x: Math.min(mx, Math.max(-mx, next.x)),
        y: Math.min(my, Math.max(-my, next.y)),
      };
    },
    [view],
  );

  // 미리보기 그리기
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !bitmap) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = bitmap.width * baseScale * zoom;
    const h = bitmap.height * baseScale * zoom;
    ctx.clearRect(0, 0, view, view);
    ctx.drawImage(
      bitmap,
      (view - w) / 2 + offset.x,
      (view - h) / 2 + offset.y,
      w,
      h,
    );
  }, [bitmap, baseScale, zoom, offset, view]);

  function confirm() {
    if (!bitmap) return;
    const out = document.createElement("canvas");
    out.width = OUT;
    out.height = OUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // 화면 좌표를 그대로 출력 크기로 확대한다 — 보이는 것이 저장된다
    const k = OUT / view;
    const w = bitmap.width * baseScale * zoom * k;
    const h = bitmap.height * baseScale * zoom * k;
    ctx.drawImage(
      bitmap,
      (OUT - w) / 2 + offset.x * k,
      (OUT - h) / 2 + offset.y * k,
      w,
      h,
    );
    out.toBlob(
      (blob) => {
        // 인코딩 실패는 사실상 없지만, 실패해도 원본으로 넘긴다
        onDone(blob ?? file);
      },
      "image/webp",
      0.92,
    );
  }

  if (unsupported) {
    return (
      <Shell index={index} total={total} onCancel={onCancel}>
        <p className="text-sm">
          이 사진 형식은 미리보기를 만들 수 없어요. 그대로 올리면{" "}
          <b>가운데를 기준으로 정사각형</b>이 됩니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onDone(file)}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            그대로 올리기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2.5 text-sm"
          >
            취소
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell index={index} total={total} onCancel={onCancel}>
      <p className="text-center text-sm text-muted-foreground">
        사진은 <b>정사각형</b>으로 저장돼요. 끌어서 위치를 맞춰주세요.
      </p>

      <div
        // ⚠️ `mx-auto` 가 없으면 고정 폭(280px) 블록이라 팝업 안에서 **왼쪽에
        // 붙는다.** 아래 슬라이더·버튼은 전체 폭이라 크롭 상자만 어긋나 보였다
        ref={boxRef}
        className="relative mx-auto mt-3 aspect-square w-full touch-none overflow-hidden rounded-lg bg-muted"
        style={{ maxWidth: MAX_VIEW }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !bitmap) return;
          setOffset(
            clamp(
              { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y },
              zoom,
              bitmap,
              baseScale,
            ),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <canvas ref={canvasRef} width={view} height={view} />
        {/* 가이드 — 잘리는 경계가 어디인지 보여준다 */}
        <div className="pointer-events-none absolute inset-0 border-2 border-background/80" />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="border border-background/25" />
          ))}
        </div>
        {!bitmap && (
          <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            불러오는 중…
          </span>
        )}
      </div>

      <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden>축소</span>
        <input
          type="range"
          aria-label="사진 크기"
          min={-1}
          max={1}
          step={0.01}
          value={slider}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSlider(v);
            const z = v < 0 ? 1 + v * (1 - minZoom) : 1 + v * (MAX_ZOOM - 1);
            // 축소하면 이동 범위가 줄어든다. 사진이 뷰포트보다 작아지면
            // 범위가 0이 되어 **자동으로 가운데**에 놓인다
            if (bitmap) setOffset((o) => clamp(o, z, bitmap, baseScale));
          }}
          className="flex-1"
        />
        <span aria-hidden>확대</span>
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!bitmap}
          onClick={confirm}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {total > 1 ? `이 사진 쓰기 (${index + 1}/${total})` : "사용하기"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-4 py-2.5 text-sm"
        >
          건너뛰기
        </button>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  index,
  total,
  onCancel,
}: {
  children: React.ReactNode;
  index: number;
  total: number;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="사진 자르기"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="w-full max-w-sm rounded-xl bg-background p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">사진 자르기</h2>
          {total > 1 && (
            <span className="text-xs text-muted-foreground">
              {index + 1} / {total}
            </span>
          )}
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
