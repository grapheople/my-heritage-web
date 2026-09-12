import { prisma } from "@/lib/prisma";

/**
 * 신호 포털 하루 한도 관리.
 *
 * ## ⚠️ 호출을 세지, 결과를 세지 않는다
 * 처음에는 보정 이력(`SignalCalibration`) 행 수로 셌는데 **틀린 집계였다.**
 * 황색이거나 관측이 주기와 모순되면 보정을 거절하지만 포털은 이미 호출됐다 —
 * 행이 안 남으므로 집계에서 빠지고, 실패가 반복될수록 실제 호출은 한도를
 * 넘는데 집계는 0 에 머문다. 그래서 `SignalPortalCall` 에 **호출 자체**를 남긴다.
 *
 * 개발 활용신청 기준 포털 상한이 하루 1,000건이므로, 그보다 훨씬 낮은 자체
 * 상한을 둔다 — 한도를 다 쓰는 상황 자체가 정상이 아니기 때문이다.
 */

export type PortalEndpoint = "SIGNAL_PHASE" | "CROSSROAD_MAP";

const DAILY_LIMIT = Number(
  process.env.SIGNAL_PORTAL_DAILY_LIMIT ?? process.env.SIGNAL_SYNC_DAILY_LIMIT ?? 50,
);
const MIN_INTERVAL_SEC = Number(process.env.SIGNAL_SYNC_MIN_INTERVAL_SEC ?? 30);

/** 서울 기준 오늘 자정 (하루 상한의 경계) */
function seoulMidnight(now: Date): Date {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${date}T00:00:00+09:00`);
}

export type QuotaState = {
  usedToday: number;
  limit: number;
  /** 최소 간격 때문에 기다려야 하는 시각. 지금 호출 가능하면 `null` */
  nextAllowedAt: Date | null;
};

/**
 * 지금 포털을 불러도 되는가.
 *
 * @param target 대상(교차로 ID·신호등 키). 최소 간격은 **대상별로** 본다 —
 *   다른 신호등을 확인하는 일이 앞의 호출 때문에 막히면 안 된다.
 * @param need 이번에 쓸 호출 수. 목록 수집처럼 여러 건을 쓰는 경우가 있다.
 */
export async function checkPortalQuota(
  target: string | null,
  now: Date = new Date(),
  need = 1,
): Promise<{ ok: boolean; reason?: string; quota: QuotaState }> {
  const [usedToday, last] = await Promise.all([
    prisma.signalPortalCall.count({ where: { createdAt: { gte: seoulMidnight(now) } } }),
    target
      ? prisma.signalPortalCall.findFirst({
          where: { target },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null,
  ]);

  const nextAllowedAt = last
    ? new Date(last.createdAt.getTime() + MIN_INTERVAL_SEC * 1000)
    : null;
  const quota: QuotaState = {
    usedToday,
    limit: DAILY_LIMIT,
    nextAllowedAt: nextAllowedAt && nextAllowedAt > now ? nextAllowedAt : null,
  };

  if (usedToday + need > DAILY_LIMIT) {
    return {
      ok: false,
      reason: `오늘 포털 호출 한도(${DAILY_LIMIT}건)를 다 썼다`,
      quota,
    };
  }
  if (quota.nextAllowedAt) {
    const wait = Math.ceil((quota.nextAllowedAt.getTime() - now.getTime()) / 1000);
    return { ok: false, reason: `${wait}초 뒤에 다시 시도하라`, quota };
  }
  return { ok: true, quota };
}

/**
 * 실제로 나간 호출을 기록한다.
 *
 * ⚠️ **캐시에 맞은 요청은 기록하지 않는다** — 호출이 없었으므로 한도를 쓰지도
 * 않았다. 그래서 `readLive`·`readPhases` 가 `fetched` 를 함께 낸다.
 */
export async function recordPortalCalls(args: {
  endpoint: PortalEndpoint;
  target: string | null;
  requestedBy: string;
  count?: number;
}): Promise<void> {
  const count = args.count ?? 1;
  if (count <= 0) return;
  try {
    await prisma.signalPortalCall.createMany({
      data: Array.from({ length: count }, () => ({
        endpoint: args.endpoint,
        target: args.target,
        requestedBy: args.requestedBy,
      })),
    });
  } catch (error) {
    /*
      ⚠️ 기록 실패로 요청을 실패시키지 않는다. 이미 포털은 불렀고 사용자는 답을
      받아야 한다. 다만 이 로그가 비면 한도 집계가 새므로 반드시 남긴다.
    */
    console.error("[signal] 포털 호출 기록 실패 — 한도 집계가 어긋난다:", error);
  }
}
