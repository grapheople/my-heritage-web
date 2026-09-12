import type { TransitKind } from "@/generated/prisma/enums";

/**
 * 대중교통 도착정보 **제공자 계약** (D-321).
 *
 * ## ⚠️ 지하철과 버스는 **다른 포털이다**
 * 신호등에서 배운 것을 그대로 적용한다 (D-317·D-320). 하나의 API 로 둘 다 풀리지
 * 않는다:
 *
 * | 종류 | 포털 | 커버리지 | 키 |
 * |---|---|---|---|
 * | **버스** | 국토부 TAGO | **전국** | `TAGO_API_KEY` (data.go.kr) |
 * | **지하철** | 서울 열린데이터광장 | 수도권 전철 | `SEOUL_OPENAPI_KEY` |
 *
 * ⚠️ **두 키 모두 활용신청이 필요하다.** 기존 `POLICE_SIGNAL_API_KEY` 로 TAGO 를
 * 부르면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 온다 — data.go.kr 인증키는 계정
 * 하나지만 **권한은 API 마다 따로** 붙기 때문이다 (2026-09-12 실측).
 */

/** 검색 결과 — 저장 후보 */
export type StopCandidate = {
  kind: TransitKind;
  /** 제공자 식별자. 버스는 TAGO `nodeId`, 지하철은 역명 */
  stopId: string;
  stopName: string;
  /** 버스만 — 도착정보를 받으려면 이 코드가 있어야 한다 */
  cityCode?: string;
  lat?: number;
  lon?: number;
  /** 이 정류장을 지나는 노선 (있으면 화면이 노선까지 고르게 한다) */
  routes?: { routeId: string; routeName: string; headsign?: string }[];
  /** 기준 좌표로부터의 거리 (m). 이름 검색이면 없다 */
  distanceM?: number;
};

/**
 * 도착 예정 1건.
 *
 * ⚠️ `predictSec` 는 **받은 시각 기준**이다. 화면이 그대로 세면 페이지를 오래
 * 열어둔 만큼 틀린다 — 저장할 때 `fetchedAt` 을 함께 남기고 화면은 거기서부터
 * 흐른 시간을 뺀다.
 */
export type Arrival = {
  routeId: string;
  routeName: string;
  headsign?: string;
  /** 1 이 곧 올 차, 2 가 그다음 */
  seq: number;
  predictSec: number;
  /** 남은 정류장 수 — 버스만 준다 */
  stopsLeft?: number;
};

export type TransitProvider = {
  id: string;
  /** 오류 문구에 그대로 쓴다 (ko) */
  label: string;
  kind: TransitKind;
  /** 인증키가 갖춰졌는가 */
  isConfigured(): boolean;

  /**
   * 좌표 또는 이름으로 정류장을 찾는다.
   *
   * ⚠️ 둘 중 **하나만** 오는 경우를 각자 처리한다. 지하철은 좌표 검색이 없고
   * (실시간 API 가 역명을 키로 쓴다), 버스는 좌표 검색이 주 경로다.
   */
  search(args: { q?: string; lat?: number; lon?: number }): Promise<StopCandidate[]>;

  /** 한 정류장의 도착 예정. 노선을 지정하면 그것만 */
  arrivals(args: {
    stopId: string;
    cityCode?: string;
    routeId?: string;
  }): Promise<Arrival[]>;
};

/**
 * 포털이 거절한 이유를 **들고 올라가는** 오류 (D-321).
 *
 * ## ⚠️ "못 찾았다" 와 "신청이 안 됐다" 는 다른 말이다
 * TAGO 는 **오퍼레이션 묶음(서비스)마다 활용신청이 따로**다. 실제로 인증키 하나로
 * 도착정보는 200 인데 정류소정보는 403 이었다 (2026-09-12 실측). 이때 화면이
 * "정류장을 찾지 못했다" 라고만 하면 유저는 **위치를 바꿔 가며 다시 찾는다** —
 * 몇 번을 해도 결과는 같다. 어느 서비스의 신청이 비었는지 이름을 그대로 전한다.
 *
 * 신호등에서 포털 장애를 "개방 대상이 아닌 교차로" 로 안내한 것과 같은 실패다 (D-319).
 */
export class TransitPortalError extends Error {
  constructor(
    readonly reason: "not-registered" | "portal-error",
    /** 활용신청이 필요한 서비스 이름 (`BusSttnInfoInqireService` 등) */
    readonly service?: string,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "TransitPortalError";
  }
}
