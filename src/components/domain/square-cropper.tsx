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
const VIEW = 280;
/** 출력 한 변. 서버가 다시 줄이므로 넉넉하면 된다 */
const OUT = 1600;

type Loaded = { bitmap: ImageBitmap; baseScale: number };

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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dead = false;
    createImageBitmap(file)
      .then((bitmap) => {
        if (dead) return bitmap.close();
        // 짧은 변이 뷰포트를 채우는 배율 — 처음부터 빈 곳이 없어야 한다
        const baseScale = VIEW / Math.min(bitmap.width, bitmap.height);
        setLoaded({ bitmap, baseScale });
        setZoom(1);
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

  /** 이동 가능 범위 — 사진 밖의 빈 영역이 보이지 않게 가둔다 */
  const clamp = useCallback(
    (next: { x: number; y: number }, z: number, l: Loaded) => {
      const w = l.bitmap.width * l.baseScale * z;
      const h = l.bitmap.height * l.baseScale * z;
      const mx = Math.max(0, (w - VIEW) / 2);
      const my = Math.max(0, (h - VIEW) / 2);
      return {
        x: Math.min(mx, Math.max(-mx, next.x)),
        y: Math.min(my, Math.max(-my, next.y)),
      };
    },
    [],
  );

  // 미리보기 그리기
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !loaded) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { bitmap, baseScale } = loaded;
    const w = bitmap.width * baseScale * zoom;
    const h = bitmap.height * baseScale * zoom;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(
      bitmap,
      (VIEW - w) / 2 + offset.x,
      (VIEW - h) / 2 + offset.y,
      w,
      h,
    );
  }, [loaded, zoom, offset]);

  function confirm() {
    if (!loaded) return;
    const { bitmap, baseScale } = loaded;
    const out = document.createElement("canvas");
    out.width = OUT;
    out.height = OUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // 화면 좌표를 그대로 출력 크기로 확대한다 — 보이는 것이 저장된다
    const k = OUT / VIEW;
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
      <p className="text-sm text-muted-foreground">
        사진은 <b>정사각형</b>으로 저장돼요. 끌어서 위치를 맞춰주세요.
      </p>

      <div
        className="relative mt-3 touch-none overflow-hidden rounded-lg bg-muted"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !loaded) return;
          setOffset(
            clamp(
              { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y },
              zoom,
              loaded,
            ),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <canvas ref={canvasRef} width={VIEW} height={VIEW} />
        {/* 가이드 — 잘리는 경계가 어디인지 보여준다 */}
        <div className="pointer-events-none absolute inset-0 border-2 border-background/80" />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="border border-background/25" />
          ))}
        </div>
        {!loaded && (
          <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            불러오는 중…
          </span>
        )}
      </div>

      <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        확대
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => {
            const z = Number(e.target.value);
            setZoom(z);
            if (loaded) setOffset((o) => clamp(o, z, loaded));
          }}
          className="flex-1"
        />
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!loaded}
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
