import { prisma } from "@/lib/prisma";

/**
 * 레벨 · 경험치 (leveling).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 레벨 테이블은 **어드민이 관리한다**. 코드에 상수로 두지 않는다 | A-09, D-026 |
 * | 같은 행동은 1일 1회. 1일 경계는 **유저 타임존** | D-026, D-056 |
 * | 회수 없음 — 레벨은 단조 증가 | D-058 |
 * | Lv.10 은 다음 레벨 진행률을 표시하지 않는다 | D-057, FR-02-A-03 |
 */
export type LevelProgress =
  | { isMax: true; level: number; total: number }
  | {
      isMax: false;
      level: number;
      total: number;
      inLevel: number;
      span: number;
      toNext: number;
    };

/** 1일 획득 상한 (D-026, FR-01-A-07) */
export const DAILY_EXP_CAP = 60;

/**
 * 경험치 사유 3종. 각 1일 1회 (D-026).
 *
 * `reason` 은 DB enum, `key` 는 i18n 메시지 접미사다 — **둘을 분리한다.**
 * enum 이름을 메시지 키로 쓰면 enum 을 못 바꾸고, 메시지 키를 enum 으로 쓰면
 * 번역 파일이 DB 스키마를 따라다닌다.
 */
export const EXP_RULES = [
  { reason: "LOGIN", key: "login", amount: 10 },
  { reason: "ITEM_CREATE", key: "item", amount: 30 },
  { reason: "DIARY_CREATE", key: "diary", amount: 20 },
] as const;

/** DB enum → i18n 키. 모르는 값은 그대로 낸다 (메시지 누락이 드러나게) */
export function expReasonKey(reason: string): string {
  return EXP_RULES.find((r) => r.reason === reason)?.key ?? reason;
}

async function levelTable() {
  // ⚠️ DB 에서 읽는다. 상수로 박으면 어드민 A-09 가 무의미해진다
  return prisma.levelDefinition.findMany({ orderBy: { level: "asc" } });
}

/** S-14 의 레벨 테이블 섹션 — 어드민이 관리하는 값 그대로 (A-09) */
export async function levelTableRows(): Promise<
  { level: number; requiredExp: number }[]
> {
  return levelTable();
}

/** 누적 경험치 합 — 회수가 없으므로 단순 합이다 (D-058) */
export async function totalExp(userId: string): Promise<number> {
  const agg = await prisma.experienceLog.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function levelOf(userId: string): Promise<number> {
  const [total, table] = await Promise.all([totalExp(userId), levelTable()]);
  return currentLevel(total, table);
}

function currentLevel(
  total: number,
  table: { level: number; requiredExp: number }[],
): number {
  let level = table[0]?.level ?? 1;
  for (const row of table) if (total >= row.requiredExp) level = row.level;
  return level;
}

/** S-14 레벨 화면 — 진행률까지 (FR-02-A-02) */
export async function levelProgressOf(userId: string): Promise<LevelProgress> {
  const [total, table] = await Promise.all([totalExp(userId), levelTable()]);
  const level = currentLevel(total, table);
  const cur = table.find((r) => r.level === level);
  const next = table.find((r) => r.level === level + 1);

  // 최고 레벨은 진행률을 내지 않는다. 누적 경험치는 계속 표시한다 (D-057)
  if (!next || !cur) return { isMax: true, level, total };

  return {
    isMax: false,
    level,
    total,
    inLevel: total - cur.requiredExp,
    span: next.requiredExp - cur.requiredExp,
    toNext: next.requiredExp - total,
  };
}

export type ExpLogRow = {
  id: string;
  reason: "LOGIN" | "ITEM_CREATE" | "DIARY_CREATE";
  amount: number;
  localDate: string;
};

/**
 * 경험치 내역 + **오늘 이미 받은 사유**.
 *
 * "오늘 안 한 것"을 보여주는 것이 이 화면의 핵심이다. 판정 기준은 `localDate`
 * 이고 그 값은 **유저 타임존**으로 만들어진다 (D-056) — 서버 UTC 날짜로 비교하면
 * 자정 근처에서 어긋난다.
 */
export async function expHistory(
  userId: string,
  todayLocalDate: string,
): Promise<{ total: number; todayEarned: string[]; logs: ExpLogRow[] }> {
  const [total, logs] = await Promise.all([
    totalExp(userId),
    prisma.experienceLog.findMany({
      where: { userId },
      select: { id: true, reason: true, amount: true, localDate: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return {
    total,
    todayEarned: logs
      .filter((l) => l.localDate === todayLocalDate)
      .map((l) => l.reason),
    logs,
  };
}
