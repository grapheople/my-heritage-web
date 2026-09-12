import type { TransitKind } from "@/generated/prisma/enums";
import { TransitPortalError } from "../types";
import type { Arrival, RouteAtStop, StopCandidate, TransitProvider } from "../types";
import { seoulSubway } from "./seoul-subway";
import { tagoBus } from "./tago-bus";

export type { Arrival, RouteAtStop, StopCandidate, TransitProvider } from "../types";

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

/**
 * 실패 사유.
 *
 * ⚠️ **`not-configured` 와 `not-registered` 는 다른 말이다.** 앞은 *우리가* 키를
 * 안 넣은 것이고, 뒤는 키는 있는데 *그 서비스에* 활용신청이 안 된 것이다. 유저가
 * 할 일이 서로 달라 같은 문구로 뭉치면 안 된다 (D-319 가 신호등에서 겪은 실패).
 */
export type TransitFailure =
  | { reason: "not-configured" }
  | { reason: "not-registered"; service?: string }
  | { reason: "portal-error"; detail?: string };

export type SearchOutcome = { ok: true; stops: StopCandidate[] } | ({ ok: false } & TransitFailure);

/** 던져진 오류를 사유로 옮긴다 — 두 파사드가 같은 규칙을 쓴다 */
function toFailure(e: unknown): TransitFailure {
  if (e instanceof TransitPortalError && e.reason === "not-registered") {
    return { reason: "not-registered", service: e.service };
  }
  return { reason: "portal-error", detail: (e as Error).message };
}

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
    return { ok: false, ...toFailure(e) };
  }
}

export type ArrivalsOutcome = { ok: true; arrivals: Arrival[] } | ({ ok: false } & TransitFailure);

export async function readArrivals(
  kind: TransitKind,
  args: { stopId: string; cityCode?: string; routeId?: string },
): Promise<ArrivalsOutcome> {
  const p = providerFor(kind);
  if (!p || !p.isConfigured()) return { ok: false, reason: "not-configured" };
  try {
    return { ok: true, arrivals: await p.arrivals(args) };
  } catch (e) {
    return { ok: false, ...toFailure(e) };
  }
}

export type RoutesOutcome =
  | { ok: true; routes: RouteAtStop[] }
  | ({ ok: false } & TransitFailure);

/**
 * 그 정류장을 지나는 노선 (D-323).
 *
 * ⚠️ 제공자가 이 능력을 **안 가질 수 있다.** 지하철은 역 검색이 이미 호선·방향을
 * 주므로 구현하지 않는다 — 그때는 빈 목록이 맞는 답이다(오류가 아니다).
 */
export async function readRoutesAt(
  kind: TransitKind,
  args: { stopId: string; cityCode?: string },
): Promise<RoutesOutcome> {
  const p = providerFor(kind);
  if (!p || !p.isConfigured()) return { ok: false, reason: "not-configured" };
  if (!p.routesAt) return { ok: true, routes: [] };
  try {
    return { ok: true, routes: await p.routesAt(args) };
  } catch (e) {
    return { ok: false, ...toFailure(e) };
  }
}
