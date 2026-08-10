"use client";

import { useEffect, useState } from "react";

/**
 * 어드민용 브랜드 선택 (D-151).
 *
 * ## ⚠️ 유저 폼의 `BrandSelect` 를 어드민에서 쓸 수 없다
 * 그 컴포넌트는 `useTranslations` 를 쓰는데, **어드민은 `[locale]` 라우트 밖에
 * 있어 `NextIntlClientProvider` 가 없다** — 렌더 시점에 터진다. 어드민은
 * **ko 단일 언어**이므로(D-030) 문구를 코드에 두는 것이 맞다.
 *
 * ## ⚠️ 마스터에 있는 이름만 보낸다
 * 아이템 등록은 마스터에 없는 브랜드를 받지 않는다 (D-043). 타이핑으로 두면
 * "목록에서 브랜드를 선택해주세요" 로 계속 막힌다 — 실제로 그 실패가 났다 (D-150).
 */
type Brand = { id: string; name: string };

export function AdminBrandPicker({
  value,
  onChange,
  category,
}: {
  value: string;
  onChange: (name: string) => void;
  /** 카테고리별 브랜드 마스터 (D-044) */
  category: string;
}) {
  /**
   * ⚠️ **어느 카테고리의 목록인지 함께 담는다.** effect 에서 `setLoading(true)`
   * 처럼 동기로 상태를 바꾸면 계단식 렌더가 된다
   * (`react-hooks/set-state-in-effect`). 카테고리가 바뀌었는지는 **렌더 중에
   * 비교**한다 — `BrandSelect` 와 같은 방식이다.
   */
  const [loaded, setLoaded] = useState<{
    category: string;
    brands: Brand[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/brands?category=${encodeURIComponent(category)}`)
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((d: { brands?: Brand[]; error?: string }) => {
        if (alive) {
          setLoaded({ category, brands: d.brands ?? [], error: d.error });
        }
      })
      .catch(() => {
        if (alive) {
          setLoaded({ category, brands: [], error: "브랜드를 불러오지 못했습니다" });
        }
      });
    return () => {
      alive = false;
    };
  }, [category]);

  // 카테고리가 바뀌면 이전 목록은 쓰지 않는다
  const ready = loaded?.category === category ? loaded : null;
  const brands = ready?.brands ?? [];

  /**
   * ⚠️ 선택된 값이 지금 목록에 없으면 **빈 값으로 취급한다.** 카테고리를 바꿨을
   * 때 이전 브랜드가 남으면 등록에서 "목록에서 선택해주세요"로 막힌다 (D-043).
   * effect 에서 `onChange("")` 를 부르면 부모 상태를 계단식으로 바꾸므로 하지 않는다
   */
  const selected = brands.some((b) => b.name === value) ? value : "";

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      disabled={!ready || brands.length === 0}
      className="w-52 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
    >
      <option value="">
        {!ready
          ? "불러오는 중…"
          : ready.error
            ? ready.error
            : brands.length === 0
              ? "브랜드 없음"
              : "선택 안 함"}
      </option>
      {brands.map((b) => (
        <option key={b.id} value={b.name}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
