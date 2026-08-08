import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import type { CodexEntry } from "@/lib/data/types";

/**
 * 도감 검색 결과 행.
 *
 * 도감 명칭은 **원문 1개 고정**이고 번역하지 않는다 (D-009).
 * ⚠️ **alias 로 매칭된 경우 어떤 alias 로 일치했는지 보조 표기한다** —
 * 원문이 영문이라 한국어로 검색한 유저가 "왜 이게 나왔지"를 알 수 없기 때문이다
 * (`policies/i18n` §2, D-043).
 *
 * ⚠️ **보유자 수는 로그인 유저에게만 보인다** (D-078·D-096, FR-06-B-06).
 * 검색 결과가 색인 대상은 아니지만, 같은 숫자를 한쪽에서만 가리면 우회로가
 * 생긴다 — 비로그인이 검색으로 "이 시계 213명 보유"를 알 수 있으면 D-078 을
 * 우회한 것이다. 판정은 `lib/auth/viewer.ts` 한 곳에서만 한다.
 *
 * ⚠️ **숫자를 받아놓고 안 그리는 것이 아니라, 받지 않는다.** `ownerCount` 를
 * 프롭으로 넘기고 `false` 일 때만 숨기면 이 컴포넌트가 클라이언트 컴포넌트가
 * 되는 순간 RSC 페이로드로 그대로 실려 나간다 (`FR-07-A-08` 과 같은 기준).
 * 그래서 **비로그인일 때는 `ownerCount` 자체가 `undefined`** 인 타입으로 받는다.
 */
export function CodexRow({
  entry,
  matchedAlias,
  ownerCount,
}: {
  /** ⚠️ `ownerCount` 를 뺀 타입이다 — 실수로 흘리지 못하게 타입으로 막는다 */
  entry: Omit<CodexEntry, "ownerCount">;
  matchedAlias?: string;
  /** 비로그인이면 `undefined`. 호출부가 아예 넘기지 않는다 (D-096) */
  ownerCount?: number;
}) {
  const t = useTranslations();

  return (
    <Link
      href={`/codex/${entry.id}`}
      className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent lg:px-3"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-md border bg-muted">
        {/* 연결된 공개 아이템의 사진 (D-110). 없으면 빈 자리 */}
        {entry.imageUrl && (
          <Image src={entry.imageUrl} alt="" fill sizes="56px" className="object-cover" />
        )}
      </span>
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
      {ownerCount !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("codex.owners", { count: formatNumber(ownerCount) })}
        </span>
      )}
    </Link>
  );
}
