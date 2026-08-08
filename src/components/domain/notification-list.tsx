"use client";

import { AlertTriangle, Bell, Layers, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { markNotificationRead } from "@/lib/actions/settings";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { NotificationItem, NotificationKind } from "@/lib/data/types";

/**
 * S-22 알림함 목록 (D-087).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 최신순 | FR-08-A-04 |
 * | 열면 읽음 처리 | FR-08-A-05 |
 * | 관련 화면으로 이동 | FR-08-A-06 |
 * | **알림별 on/off 설정 없음** | FR-08-A-08 |
 * | 문구는 3개 언어 | FR-08-A-09 |
 *
 * ⚠️ **본문을 서버에 완성된 문장으로 저장하지 않는다.** 치환값(`params`)만
 * 저장하고 문구는 i18n 리소스로 만든다 — 완성 문장을 저장하면 유저가 언어를
 * 바꿔도 옛 언어로 남는다 (FR-08-A-09, D-003).
 */
const ICON: Record<NotificationKind, typeof Bell> = {
  BRAND_REQUEST_RESULT: Tag,
  REPORT_RESULT: Bell,
  SANCTION: AlertTriangle,
  CODEX_MERGED: Layers,
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const t = useTranslations();
  const [read, setRead] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  return (
    <ul className="divide-y">
      {items.map((n) => {
        const isRead = n.read || read.includes(n.id);
        const Icon = ICON[n.type];
        const body = t(`notif.${n.type}`, n.params);

        const inner = (
          <span className="flex gap-3">
            {/* 미읽음 점 (FR-08-A-03) */}
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                isRead ? "bg-transparent" : "bg-foreground",
              )}
            />
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm leading-snug", !isRead && "font-semibold")}>
                {body}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {n.createdAt} · {t(`notif.kind.${n.type}`)}
              </span>
            </span>
          </span>
        );

        return (
          <li key={n.id} className={cn(!isRead && "bg-muted/40")}>
            {n.href ? (
              <Link
                href={n.href}
                onClick={() => {
                  // 낙관적으로 먼저 지운다 — 서버 왕복을 기다리면 뱃지가
                  // 늦게 꺼져 "안 눌린 것" 처럼 보인다 (FR-08-A-05)
                  setRead((p) => [...p, n.id]);
                  startTransition(() => void markNotificationRead(n.id));
                }}
                className="block px-4 py-4 hover:bg-accent lg:px-3"
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // 낙관적으로 먼저 지운다 — 서버 왕복을 기다리면 뱃지가
                  // 늦게 꺼져 "안 눌린 것" 처럼 보인다 (FR-08-A-05)
                  setRead((p) => [...p, n.id]);
                  startTransition(() => void markNotificationRead(n.id));
                }}
                className="block w-full px-4 py-4 text-left hover:bg-accent lg:px-3"
              >
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
