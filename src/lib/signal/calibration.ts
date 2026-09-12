import { prisma } from "@/lib/prisma";

/**
 * 주기 보정 이력 — DB 접근과 쿼터 판정.
 *
 * ## ⚠️ 읽기 경로(`/api/signal`)는 외부 API 를 절대 부르지 않는다
 * 신호 포털은 **하루 호출 상한**이 있다. 남은 초를 화면에
 * 띄우려고 1초마다 부르면 17분에 소진된다. 그래서 상시 응답은 주기 계산이
 * 담당하고, 실시간은 **사용자가 동기화를 요청할 때만** 1건 쓴다.
 *
 * 그 1건으로 얻는 것은 "지금 몇 초 남았는가"가 아니라 **기준 시각**이다.
 * 기준 시각 하나가 맞으면 그 뒤로는 호출 없이 계속 맞는다.
 */

/* 하루 한도 판정은 `portal.ts` 로 옮겼다 — 보정 결과가 아니라 **호출 수**로
   세야 하기 때문이다 (거절된 동기화도 포털은 이미 불렀다). */

export type Calibration = {
  greenStartAt: Date;
  driftSec: number;
  createdAt: Date;
  source: "LIVE" | "MANUAL";
};

/** 수동 측정으로 얻은 주기 길이 — 설정값을 덮는다 */
export type MeasuredLengths = {
  greenSec: number;
  redSec: number;
  measuredAt: Date;
};

export type EffectiveCalibration = {
  /** 가장 최근 기준 시각 (출처 무관) */
  anchor: Calibration | null;
  /** 주기 길이가 담긴 **가장 최근 수동 측정** */
  lengths: MeasuredLengths | null;
};

/**
 * 이 신호등·프로파일에 지금 적용할 보정값.
 *
 * ## ⚠️ 기준 시각과 주기 길이를 **따로** 찾는다
 * 실시간 보정(LIVE)은 관측 한 건이라 주기 길이를 채우지 못한다. "가장 최근 행"
 * 하나만 읽으면 **수동 측정 뒤에 실시간 동기화를 한 번 하는 순간 측정한 길이가
 * 사라진다** — 기준 시각은 최신 것이 맞고, 길이는 마지막으로 잰 것이 맞다.
 *
 * ⚠️ DB 가 안 되면 던지지 않고 빈 값을 낸다 — 보정은 정확도를 높이는 값이고,
 * 없다고 신호등 상태를 못 낼 이유는 없다. 설정값으로 계산하면 된다.
 */
export async function readCalibration(
  lightId: string,
  profileLabel: string | null,
): Promise<EffectiveCalibration> {
  try {
    const [anchor, measured] = await Promise.all([
      prisma.signalCalibration.findFirst({
        where: { lightId, profileLabel },
        orderBy: { createdAt: "desc" },
        select: { greenStartAt: true, driftSec: true, createdAt: true, source: true },
      }),
      prisma.signalCalibration.findFirst({
        where: { lightId, profileLabel, greenSec: { not: null }, redSec: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { greenSec: true, redSec: true, createdAt: true },
      }),
    ]);
    return {
      anchor,
      lengths:
        measured?.greenSec != null && measured.redSec != null
          ? { greenSec: measured.greenSec, redSec: measured.redSec, measuredAt: measured.createdAt }
          : null,
    };
  } catch (error) {
    console.error("[signal] 보정 이력 조회 실패 — 설정값으로 계산한다:", error);
    return { anchor: null, lengths: null };
  }
}

export async function saveCalibration(row: {
  lightId: string;
  profileLabel: string | null;
  greenStartAt: Date;
  driftSec: number;
  liveState: string;
  liveRaw: unknown;
  requestedBy: string;
}): Promise<{ createdAt: Date }> {
  /*
    ⚠️ 생성 시각을 **돌려준다.** 화면이 "마지막 동기화 hh:mm" 을 즉시 갱신하려면
    그 값이 필요한데, 클라이언트가 자기 시계로 만들면 기기 시계가 틀린 만큼
    어긋난 시각이 표시된다 — 이 화면은 시계 오차를 다루는 화면이라 더 나쁘다.
  */
  return prisma.signalCalibration.create({
    data: {
      ...row,
      source: "LIVE",
      // Prisma 의 Json 타입은 unknown 을 받지 않는다. 원본을 그대로 넣는다
      liveRaw: row.liveRaw as never,
    },
    select: { createdAt: true },
  });
}

/**
 * 수동 측정 저장 — 기준 시각과 **주기 길이까지** 남는다.
 *
 * ⚠️ 쿼터를 걸지 않는다. 외부 API 를 쓰지 않으므로 태울 자원이 없고, 사람이
 * 신호등 앞에서 3번 눌러야 하는 일이라 연타로 쌓일 성질도 아니다. 로그인만
 * 요구한다 — 남의 신호등 설정을 아무나 덮을 수는 없어야 한다.
 */
export async function saveMeasurement(row: {
  lightId: string;
  profileLabel: string | null;
  greenStartAt: Date;
  greenSec: number;
  redSec: number;
  driftSec: number;
  requestedBy: string;
}): Promise<{ createdAt: Date }> {
  return prisma.signalCalibration.create({
    data: { ...row, source: "MANUAL" },
    select: { createdAt: true },
  });
}
