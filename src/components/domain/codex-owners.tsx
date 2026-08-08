"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { CodexOwner } from "@/lib/data/types";

/**
 * 도감 소유자 목록 — **반드시 클라이언트 컴포넌트여야 한다** (D-078, FR-07-A-08).
 *
 * ⚠️ **이 컴포넌트를 서버 컴포넌트로 바꾸면 D-078 이 깨진다.**
 * 도감 상세는 색인 대상이고, 소유자 목록이 서버 렌더 결과에 들어가면
 * 크롤러가 읽는다. 그러면 검색엔진에 "고가 시계 보유자 목록"이 색인되고
 * D-031 에서 수용한 절도 리스크가 검색엔진 규모로 커진다.
 *
 * 노출 항목은 **방 이름·프로필 이미지·레벨뿐**이다 (FR-07-B-03).
 * 구매처·구매일·구매가는 노출하지 않는다 (FR-07-B-04).
 */
type State =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "ready"; owners: CodexOwner[]; count: number }
  | { status: "error" };

export function CodexOwners({ codexId }: { codexId: string }) {
  const t = useTranslations();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/codex/${codexId}/owners`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) return setState({ status: "unauthorized" });
        if (!res.ok) return setState({ status: "error" });
        const data = (await res.json()) as { owners: CodexOwner[]; count: number };
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
        {t("codex.ownersTitle")}
        {state.status === "ready" && (
          <span className="ml-2 text-sm font-semibold text-muted-foreground">
            {formatNumber(state.count)}
          </span>
        )}
      </h2>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {/* 비로그인 — 목록도 개수도 주지 않고 로그인 유도 (FR-07-A-07) */}
      {state.status === "unauthorized" && (
        <div className="mt-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            {t("codex.ownersLoginRequired")}
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
        <p className="mt-3 text-sm text-muted-foreground">{t("error.generic")}</p>
      )}

      {/* 연결된 공개 아이템 0건 (FR-07-A-06) */}
      {state.status === "ready" && state.owners.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{t("codex.noOwners")}</p>
      )}

      {state.status === "ready" && state.owners.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {state.owners.map((o) => (
            <li key={o.roomId}>
              <Link
                href={`/rooms/${o.roomId}`}
                className="flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 hover:bg-accent"
              >
                <span className="size-7 rounded-full bg-muted" />
                <span className="text-sm font-semibold">{o.roomName}</span>
                <span className="text-xs text-muted-foreground">
                  {t("myRoom.level", { level: o.level })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
