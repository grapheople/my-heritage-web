"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { WearShotCard } from "@/lib/data/wear-shot";

/**
 * 도감 착용샷 목록 — **반드시 클라이언트 컴포넌트여야 한다** (D-162, D-078 상속).
 *
 * ## ⚠️ 이 컴포넌트를 서버 컴포넌트로 바꾸면 D-078 이 깨진다
 * 도감 상세는 색인 대상이다. 이 목록이 서버 렌더 결과에 들어가면 크롤러가
 * 읽는다. **소유자 목록보다 강한 노출**이다 — 사진 · 방 이름 · 날짜가 함께
 * 나간다. 그러면 D-031 에서 수용한 절도 리스크가 검색엔진 규모로 커진다.
 *
 * ## ⚠️ 옛 `CodexOwners` 를 대체한다
 * "이 물건을 가진 사람" 목록 대신 **"이 물건을 쓰는 모습"** 을 보여준다
 * (D-162). 로그인 게이트·차단 제외·판매완료 제외는 **그대로 물려받는다** —
 * 이 섹션도 결국 누가 가졌는지를 드러내기 때문이다.
 */
type State =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "ready"; shots: WearShotCard[]; count: number }
  | { status: "error" };

export function CodexWearShots({ codexId }: { codexId: string }) {
  const t = useTranslations();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/codex/${codexId}/wear-shots`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) return setState({ status: "unauthorized" });
        if (!res.ok) return setState({ status: "error" });
        const data = (await res.json()) as {
          shots: WearShotCard[];
          count: number;
        };
        setState({ status: "ready", ...data });
      })
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [codexId]);

  return (
    <section className="border-t px-4 py-5 lg:px-0">
      <h2 className="text-base font-bold tracking-tight">
        {t("codex.wearTitle")}
        {state.status === "ready" && (
          <span className="ml-2 text-sm font-semibold text-muted-foreground">
            {formatNumber(state.count)}
          </span>
        )}
      </h2>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      )}

      {/* 비로그인 — 목록도 개수도 주지 않고 로그인 유도 (FR-07-A-07 과 같은 기준) */}
      {state.status === "unauthorized" && (
        <div className="mt-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            {t("codex.wearLoginRequired")}
          </p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-lg border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            {t("auth.login")}
          </Link>
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("error.generic")}
        </p>
      )}

      {state.status === "ready" && state.shots.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("codex.noWear")}
        </p>
      )}

      {state.status === "ready" && state.shots.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-3">
          {state.shots.map((s) => (
            <li key={s.id}>
              {/* 착용샷 자체 화면은 없다 — 아이템 상세로 보낸다 (D-148) */}
              <Link href={`/items/${s.itemId}`} className="group block">
                <span className="relative block aspect-square overflow-hidden rounded-md bg-muted">
                  {s.photoUrl && (
                    /* 저장본이 정방형이다 (D-129) — 잘리지 않는다 */
                    <Image
                      src={s.photoUrl}
                      alt=""
                      fill
                      sizes="(min-width:640px) 150px, 33vw"
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold group-hover:underline">
                  {s.roomName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {s.wornOn}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
