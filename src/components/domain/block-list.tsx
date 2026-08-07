"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * S-19 차단 관리 (D-051).
 *
 * ⚠️ **차단은 양방향이다** (FR-05-B-02) — 1건이 양쪽 가시성을 모두 막는다.
 * NEW 피드·검색·마켓·도감 소유자 목록 **전부**에 필터가 걸린다 (FR-05-B-03).
 * 한 곳이라도 빠지면 상호 비가시가 깨진다.
 *
 * **차단 사실을 상대에게 알리지 않는다** (FR-05-B-04) — 알리면 보복·추적의
 * 실마리가 된다. 차단은 처벌 요청(신고)이 아니라 접촉 회피 수단이다.
 *
 * 그 결과 **도감 보유자 수가 유저마다 다르게 보인다** (FR-05-B-06) —
 * 의도된 동작이다 (E-07-07).
 */
export function BlockList({
  blocks,
}: {
  blocks: { roomId: string; roomName: string; blockedAt: string }[];
}) {
  const t = useTranslations();
  const [unblocked, setUnblocked] = useState<string[]>([]);

  const active = blocks.filter((b) => !unblocked.includes(b.roomId));

  if (active.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("settings.noBlocks")}
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {active.map((b) => (
        <li key={b.roomId} className="flex items-center gap-3 py-3">
          <span className="size-9 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1">
            {/* 방 이름은 유저가 쓴 것 — 번역하지 않는다 */}
            <p className="truncate text-sm font-semibold">{b.roomName}</p>
            <p className="text-xs text-muted-foreground">
              {t("settings.blockedAt", { date: b.blockedAt })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUnblocked((prev) => [...prev, b.roomId])}
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t("settings.unblock")}
          </button>
        </li>
      ))}
    </ul>
  );
}
