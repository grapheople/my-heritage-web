"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * S-16 외부 링크 이동 경고 — **공통 컴포넌트** (D-040).
 *
 * 마켓 매물의 거래 링크와 아이템 `url` 속성이 **반드시 이 컴포넌트를 경유한다.**
 * 경고를 필드 단위로 따로 붙이면 반드시 새는 곳이 생긴다 (D-040 근거).
 *
 * "다시 보지 않기" 같은 건너뛰기 설정은 **없다** (D-040).
 * 외부 링크는 신고 기반 사후 차단이므로 (D-028) 사전 검증하지 않는다.
 */
export function ExternalLinkWarning({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("externalLink");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("body")}</DialogDescription>
          </DialogHeader>
          {/* 이동 대상 URL을 그대로 보여준다 — 유저가 어디로 가는지 알아야 한다.
              URL은 유저 콘텐츠이므로 번역하지 않는다 (policies/i18n §1-2) */}
          <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
            {href}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button asChild>
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {t("continue")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
