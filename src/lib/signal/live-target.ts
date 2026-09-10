import { prisma } from "@/lib/prisma";
import type { Direction, LiveRef, SignalKind } from "./lights";

/**
 * 실시간 조회 대상(교차로·방위·신호종별) — **화면에서 고른 값이 설정을 이긴다.**
 *
 * ## ⚠️ 왜 코드가 아니라 DB 인가
 * 한 교차로에는 보행 신호가 8방위까지 있고, 그중 **내가 건너는 횡단보도**가
 * 어느 것인지는 좌표로 풀리지 않는다. 신호등 앞에서 현시를 눈으로 대조해야
 * 정해지는 값이다 — 그 자리에서 배포를 할 수는 없으니 화면에서 고르고 저장한다.
 *
 * `lights.ts` 의 `live` 는 기본값으로 남는다 (미리 아는 값이 있을 때).
 */

const DIRECTIONS: readonly Direction[] = ["nt", "et", "st", "wt", "ne", "se", "sw", "nw"];
const KINDS: readonly SignalKind[] = [
  "straight",
  "left",
  "uturn",
  "pedestrian",
  "bus",
  "bicycle",
];

export function parseDirection(value: unknown): Direction | null {
  return DIRECTIONS.find((d) => d === value) ?? null;
}

export function parseKind(value: unknown): SignalKind | null {
  return KINDS.find((k) => k === value) ?? null;
}

/** 지금 이 신호등의 실시간 대상. DB 값이 없으면 설정의 기본값 */
export async function readLiveTarget(
  lightId: string,
  fallback?: LiveRef,
): Promise<LiveRef | null> {
  try {
    const row = await prisma.signalLightLive.findUnique({
      where: { lightId },
      select: { itstId: true, direction: true, kind: true },
    });
    if (!row) return fallback ?? null;
    const direction = parseDirection(row.direction);
    const kind = parseKind(row.kind);
    // 값이 깨졌으면 설정으로 떨어진다 — 저장 시 검증하지만 DB 를 손으로 고칠 수 있다
    if (!direction || !kind) return fallback ?? null;
    return { itstId: row.itstId, direction, kind };
  } catch (error) {
    console.error("[signal] 실시간 대상 조회 실패 — 설정값을 쓴다:", error);
    return fallback ?? null;
  }
}

export async function saveLiveTarget(args: {
  lightId: string;
  target: LiveRef;
  updatedBy: string;
}): Promise<void> {
  const { lightId, target, updatedBy } = args;
  await prisma.signalLightLive.upsert({
    where: { lightId },
    create: { lightId, ...target, updatedBy },
    update: { ...target, updatedBy },
  });
}
