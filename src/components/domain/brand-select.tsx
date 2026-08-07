"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { DEV_BRANDS } from "@/lib/dev-fixture";
import { cn } from "@/lib/utils";

/**
 * 브랜드 선택 (D-043 · D-047).
 *
 * ⚠️ **자유 텍스트가 아니라 마스터 select 다.** 자유 텍스트면
 * `Snow Peak`·`스노우피크`·`スノーピーク`가 각각 다른 브랜드가 되어
 * **도감이 언어별로 쪼개진다** (D-043).
 *
 * **alias 로도 찾을 수 있어야 한다** (D-047) — 한국 유저가 "롤렉스"로 검색해도
 * `Rolex`가 나와야 한다. 안 그러면 브랜드가 없는 것으로 오인하고 추가 요청을
 * 보낸다.
 *
 * ⚠️ **브랜드 시드 290건 + alias 약 900건이 아직 없다.** 지금은 5건짜리
 * 픽스처라 실제 등록 완주율을 검증할 수 없다 (PM 액션 대기).
 */
export function BrandSelect({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");

  const nq = q.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
  const list = nq
    ? DEV_BRANDS.filter(
        (b) =>
          b.name.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "").includes(nq) ||
          b.aliases.some((a) =>
            a.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "").includes(nq),
          ),
      )
    : DEV_BRANDS;

  if (value) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        {/* 브랜드명은 원문 고정 — 번역하지 않는다 (D-009) */}
        <span className="rounded-md border px-3 py-2 text-sm font-semibold">{value}</span>
        <button type="button" onClick={() => onChange("")}
          className="text-sm text-muted-foreground underline">
          {t("common.edit")}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("mt-1.5 rounded-md border", invalid && "border-destructive")}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("reg.brandSearch")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
      <ul className="max-h-44 overflow-y-auto">
        {list.map((b) => (
          <li key={b.name}>
            <button type="button" onClick={() => onChange(b.name)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent">
              {b.name}
              {/* alias 로 매칭됐으면 어떤 별칭인지 보여준다 (D-047) */}
              {nq && !b.name.toLowerCase().includes(nq) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {b.aliases.find((a) =>
                    a.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "").includes(nq),
                  )}
                </span>
              )}
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("brand.none")}
          </li>
        )}
      </ul>
      {/* 없으면 추가 요청 (S-17, D-046) */}
      <div className="border-t px-3 py-2">
        <Link href="/brands/request" className="text-sm underline">
          {t("brand.requestTitle")} →
        </Link>
      </div>
    </div>
  );
}
