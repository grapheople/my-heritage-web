import type { TransitKind } from "@/generated/prisma/enums";
import type { Arrival, StopCandidate, TransitProvider } from "../types";
import { seoulSubway } from "./seoul-subway";
import { tagoBus } from "./tago-bus";

export type { Arrival, StopCandidate, TransitProvider } from "../types";

/**
 * 대중교통 제공자 **등록부** (D-321).
 *
 * ⚠️ 신호등과 달리 **종류가 제공자를 가른다.** 버스는 TAGO(전국), 지하철은 서울
 * 열린데이터광장이고 둘은 서로를 대신할 수 없다 — 그래서 `kind` 로 고르고,
 * 신호등처럼 "되는 곳이 나올 때까지 넘기는" 구조가 아니다.
 */
const PROVIDERS: TransitProvider[] = [tagoBus, seoulSubway];

export function providerFor(kind: TransitKind): TransitProvider | null {
  return PROVIDERS.find((p) => p.kind === kind) ?? null;
}

/** 그 종류를 지금 쓸 수 있는가 — 화면이 "키가 없다" 를 미리 안내한다 */
export function isConfigured(kind: TransitKind): boolean {
  return providerFor(kind)?.isConfigured() ?? false;
}

/** 설정된 종류들 */
export function configuredKinds(): TransitKind[] {
  return PROVIDERS.filter((p) => p.isConfigured()).map((p) => p.kind);
}

export type SearchOutcome =
  | { ok: true; stops: StopCandidate[] }
  | { ok: false; reason: "not-configured" | "portal-error"; detail?: string };

export async function searchStops(
  kind: TransitKind,
  args: { q?: string; lat?: number; lon?: number },
): Promise<SearchOutcome> {
  const p = providerFor(kind);
  if (!p || !p.isConfigured()) return { ok: false, reason: "not-configured" };
  try {
    return { ok: true, stops: await p.search(args) };
  } catch (e) {
    /*
      ⚠️ **사유를 삼키지 않는다.** 신호등에서 예외를 `null` 로 뭉갰다가 포털 장애를
      "개방 대상이 아닌 교차로" 로 안내한 적이 있다 (D-319). 같은 실수를 반복하지
      않기 위해 여기서도 사유를 그대로 올린다.
    */
    return { ok: false, reason: "portal-error", detail: (e as Error).message };
  }
}

export type ArrivalsOutcome =
  | { ok: true; arrivals: Arrival[] }
  | { ok: false; reason: "not-configured" | "portal-error"; detail?: string };

export async function readArrivals(
  kind: TransitKind,
  args: { stopId: string; cityCode?: string; routeId?: string },
): Promise<ArrivalsOutcome> {
  const p = providerFor(kind);
  if (!p || !p.isConfigured()) return { ok: false, reason: "not-configured" };
  try {
    return { ok: true, arrivals: await p.arrivals(args) };
  } catch (e) {
    return { ok: false, reason: "portal-error", detail: (e as Error).message };
  }
}
