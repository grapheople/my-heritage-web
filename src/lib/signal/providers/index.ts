import type { LiveRef, SignalKind } from "../lights";
import { klidRti } from "./klid-rti";
import { seoulTData } from "./seoul-tdata";
import type { Coords, LiveResult, SignalProvider } from "./types";

export type {
  Coords,
  CyclePlan,
  IntersectionRow,
  LiveReading,
  LiveResult,
  PhaseRow,
  SignalProvider,
} from "./types";

/**
 * 신호 정보 제공자 **등록부** (D-317).
 *
 * ## ⚠️ 하나의 API 로 전국이 풀리지 않는다
 * 서울 T-Data 는 **서울시 신호제어기만** 담는다. 실제로 용인 좌표로 교차로를
 * 찾다가 빈 결과를 받았고, 화면에는 "없음" 으로 보여 **유저가 자기 위치 문제로
 * 오해할 자리**였다. 제공자를 나누고 `covers()` 로 갈라 **"이 지역은 아직
 * 지원하지 않는다"** 를 말할 수 있게 한다.
 *
 * 새 제공자를 붙이는 일은 **이 배열에 한 줄 더하는 것**이다.
 */
const PROVIDERS: SignalProvider[] = [
  /*
    ⚠️ **순서가 우선순위다.** 행안부 통합 API 를 앞에 둔다 — 서울에서도 이쪽이
    낫다: 상태와 잔여시간을 한 응답에 주고 좌표 목록도 같은 키로 열린다.
    T-Data 는 잔여시간만 주고 상태·좌표 API 는 활용신청이 따로라 404 였다.
  */
  klidRti,
  seoulTData,
];

/** 설정이 갖춰진 제공자만 */
export function configuredProviders(): SignalProvider[] {
  return PROVIDERS.filter((p) => p.isConfigured());
}

/**
 * 이 좌표를 다루는 제공자. **설정까지 갖춘 것만** 낸다.
 *
 * ⚠️ 커버리지와 설정을 **한 번에** 본다. 나눠 보면 "지역은 되는데 키가 없다" 와
 * "키는 있는데 지역이 아니다" 를 호출부마다 다르게 처리하게 된다
 */
export function providerFor(coords: Coords): SignalProvider | null {
  return configuredProviders().find((p) => p.covers(coords)) ?? null;
}

/**
 * 좌표를 다루는 제공자가 **있기는 한가** (설정 여부와 무관).
 *
 * 화면이 "지원하지 않는 지역" 과 "키가 없다" 를 다르게 안내하려면 이 구분이
 * 필요하다 — 유저가 할 수 있는 일이 서로 다르다.
 */
export function isCoveredRegion(coords: Coords): boolean {
  return PROVIDERS.some((p) => p.covers(coords));
}

/* ────────────────────────────────────────────
   기존 호출부가 쓰던 표면 — 제공자 하나를 전제로 한 얇은 파사드
   ⚠️ 라우트가 제공자를 직접 고르게 두지 않는다. 고르는 규칙이 여러 곳에
      흩어지면 조용히 갈린다 (D-190·D-197·D-270 이 반복한 실패)
   ──────────────────────────────────────────── */

/** 실시간을 낼 수 있는 제공자가 하나라도 설정돼 있는가 */
export function isLiveConfigured(): boolean {
  return configuredProviders().some((p) => p.readLive);
}

/**
 * 실시간 1건 — **읽어내는 제공자가 나올 때까지 넘긴다.**
 *
 * ## ⚠️ 첫 제공자에서 멈추면 안 된다
 * 교차로 목록은 행안부 API 에서 오지만(서울 2,779건) **행안부 실시간에는 울산만**
 * 있다. 첫 제공자만 물으면 서울 교차로가 전부 "찾지 못했어요" 가 된다 — 실제로
 * `1100000000:2217`(역삼역)에서 502 가 났다. T-Data 가 읽을 수 있는데도 그쪽까지
 * 가지 못한 것이다.
 *
 * ⚠️ **예외도 넘긴다.** 한 제공자의 404·타임아웃이 다른 제공자를 막으면 안 된다
 * (`fetchIntersectionMap` 과 같은 태도).
 */
export async function readLive(ref: LiveRef): Promise<LiveResult> {
  let fetched = false;
  for (const p of configuredProviders()) {
    if (!p.readLive) continue;
    try {
      const got = await p.readLive(ref);
      fetched = fetched || got.fetched;
      if (got.reading) return { ...got, fetched };
    } catch {
      // 다음 제공자로 넘어간다 — 사유는 호출부가 아니라 로그의 몫이다
    }
  }
  return { reading: null, fetched };
}

/** 8방위 현시 — `readLive` 와 같은 이유로 제공자를 순서대로 넘긴다 */
export async function readPhases(itstId: string, kind: SignalKind) {
  for (const p of configuredProviders()) {
    if (!p.readPhases) continue;
    try {
      const got = await p.readPhases(itstId, kind);
      if (got && got.rows.length > 0) return got;
    } catch {
      // 위와 같다
    }
  }
  return null;
}

/**
 * 교차로 목록 — 설정된 제공자 전부에서 모은다.
 *
 * ⚠️ **한 제공자의 실패가 전체를 멈추지 않는다.** 실제로 T-Data 의 교차로 Map
 * 정보가 404(활용신청 미승인)인데, 그 예외가 올라가면 **다른 제공자가 이미 받은
 * 4,239건까지 통째로 버려졌다.** 사유는 모아서 호출부에 넘긴다 — 조용히 삼키면
 * 왜 목록이 비었는지 알 수 없다 (D-188 의 교훈).
 */
export async function fetchIntersectionMap() {
  const providers = configuredProviders().filter((p) => p.fetchIntersections);
  const items = [];
  const failures: string[] = [];
  let requests = 0;
  for (const p of providers) {
    try {
      const got = await p.fetchIntersections!();
      items.push(...got.items);
      requests += got.requests;
    } catch (e) {
      failures.push(`${p.label} — ${(e as Error).message}`);
    }
  }
  return { items, requests, failures };
}
