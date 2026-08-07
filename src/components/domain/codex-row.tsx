import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import type { CodexEntry } from "@/lib/dev-fixture";

/**
 * 도감 검색 결과 행.
 *
 * 도감 명칭은 **원문 1개 고정**이고 번역하지 않는다 (D-009).
 * ⚠️ **alias 로 매칭된 경우 어떤 alias 로 일치했는지 보조 표기한다** —
 * 원문이 영문이라 한국어로 검색한 유저가 "왜 이게 나왔지"를 알 수 없기 때문이다
 * (`policies/i18n` §2, D-043).
 *
 * `ownerCount`(보유자 수)는 **도감 상세에서는 로그인 유저에게만** 보인다
 * (D-078, FR-07-A-02). 검색 결과의 이 숫자도 같은 규칙을 따라야 하므로
 * 인증이 붙으면 `viewerLoggedIn` 분기가 필요하다 — 지금은 픽스처다.
 */
export function CodexRow({
  entry,
  matchedAlias,
}: {
  entry: CodexEntry;
  matchedAlias?: string;
}) {
  const t = useTranslations();

  return (
    <Link
      href={`/codex/${entry.id}`}
      className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent lg:px-3"
    >
      <div className="size-14 shrink-0 rounded-md border bg-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{entry.displayName}</p>
          {!entry.verified && <StatusBadge variant="unverified" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(entry.categoryKey)} · {entry.uniqueId}
        </p>
        {matchedAlias && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("search.matchedBy", { alias: matchedAlias })}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("codex.owners", { count: formatNumber(entry.ownerCount) })}
      </span>
    </Link>
  );
}
