import type { LiveRef, SignalKind } from "../lights";
import { klidRti } from "./klid-rti";
import type { Coords, LiveResult, PhaseRow, SignalProvider } from "./types";

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
 * 신호 정보 제공자 **등록부** (D-317 · D-320).
 *
 * ## ⚠️ 지금은 **하나다** — 서울 T-Data 를 뺐다 (D-320)
 * T-Data 는 서울시 신호제어기만 담는데, 2026-09-12 부터 백엔드 DB 장애로 **모든
 * 요청이 8~40초 뒤 500** 이다. 그 사이 유저는 서울 교차로를 고를 때마다 15초를
 * 기다렸다가 실패를 봤다. 그나마 주는 것도 **잔여시간뿐**이라 상태가 늘
 * `unknown` 이었고, 상태·좌표 API 는 활용신청이 따로라 404 였다.
 *
 * 즉 **잘 돌 때조차 절반짜리였고, 지금은 느린 실패만 준다.** 빼는 편이 낫다.
 *
 * ## ⚠️ 그래도 **배열은 남긴다**
 * 하나로 줄었다고 `covers()`·등록부를 걷어내면, T-Data 가 복구되거나 경찰청
 * TOD 를 붙일 때 **이 파일을 다시 설계해야 한다.** 지금 남기는 비용은 배열 한
 * 줄이고, 되돌리는 방법은 `git revert` 로 파일을 살려 여기 한 줄 더하는 것이다.
 */
const PROVIDERS: SignalProvider[] = [
  /*
    ⚠️ **행안부 통합 API 하나다.** 상태·잔여시간을 한 응답에 주고 좌표 목록도
    같은 키로 열린다. 다만 **실시간은 울산 397건뿐**이다 (`stdgCd` 전수 확인:
    서울·제주·경기·부산 0). 좌표 목록은 서울·제주·울산 4,239건이라 지도 검색은
    전국에서 동작한다 — 커버리지 판정과 목록 제공은 다른 이야기다.
  */
  klidRti,
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
 * ⚠️ 지금은 제공자가 하나라 루프가 한 바퀴다. 그래도 **루프로 둔다** — 제공자가
 * 늘 때 호출부를 고치지 않기 위해서다 (등록부 주석 참조).
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

/**
 * 8방위 현시를 못 받은 **사유**.
 *
 * ## ⚠️ 예전에는 전부 `null` 이었고, 그래서 화면이 거짓말을 했다
 * 제공자 예외를 삼키고 `null` 을 내보내면 라우트는 그것을 **"이 교차로에는 해당
 * 신호종별 필드가 없다"** 로 옮긴다. 2026-09-12 에 서울시 T-Data 포털이 DB 장애로
 * 500 을 내고 있었는데(`CannotGetJdbcConnectionException`), 화면에는 *"개방 대상이
 * 아닌 교차로"* 라고 떴다 — **원인과 정반대의 안내**다. 유저는 교차로를 계속 바꿔
 * 보게 되고 그때마다 15초를 기다린다.
 */
export type PhasesFailure =
  /** 제공자가 이 교차로를 모른다 — 실시간 개방 지역이 아닐 수 있다 */
  | { reason: "unknown-intersection" }
  /** 교차로는 아는데 **그 종별에 값이 없다.** `kinds` 가 대안이다 */
  | { reason: "kind-empty"; kinds: SignalKind[] }
  /** 포털이 응답하지 않았다 (타임아웃·5xx). 우리가 고칠 수 없는 쪽이다 */
  | { reason: "portal-error"; failures: string[] };

export type PhasesOutcome =
  | { ok: true; rows: PhaseRow[]; fetched: boolean }
  | ({ ok: false } & PhasesFailure);

/**
 * 8방위 현시 — `readLive` 와 같은 이유로 제공자를 순서대로 넘긴다.
 *
 * ⚠️ **넘기되 사유는 모은다.** 마지막 제공자까지 실패하면 무엇 때문이었는지
 * 호출부가 알아야 한다 (위 주석).
 */
export async function readPhases(
  itstId: string,
  kind: SignalKind,
  /**
   * 교차로 좌표 — 있으면 **그 지역을 담는 제공자만** 부른다.
   *
   * ⚠️ **없으면 전부 부르고, 그 값이 곧 대기 시간이다.** 울산 교차로를 물을 때도
   * 서울 T-Data 까지 갔고 그 포털이 15초 만에 타임아웃해 **9.4초짜리 응답이
   * 0.3초로 끝날 수 있는 자리에서 나왔다** (2026-09-12 실측). 제공자가 다시 늘면
   * 같은 일이 생기므로 **좁히기를 남겨둔다.** 좌표는 `SignalIntersection` 에 이미
   * 있으니 호출부가 넘기면 된다.
   */
  coords?: Coords,
): Promise<PhasesOutcome> {
  const failures: string[] = [];
  /** 어느 제공자든 "이 교차로는 안다" 고 답했으면 그 종별 목록을 기억한다 */
  let known: SignalKind[] | null = null;

  const pool = configuredProviders();
  /*
    ⚠️ 좁힌 결과가 **비면 좁히지 않은 것으로 되돌린다.** 커버리지 상자는 우리가
    손으로 적은 것이라(`BOXES`) 실제 개방 범위보다 좁을 수 있다 — 좁혀서 0개가
    됐다고 "지원 안 함" 으로 끝내면, 실제로는 읽을 수 있는 교차로를 막는다
  */
  const narrowed = coords ? pool.filter((p) => p.covers(coords)) : [];
  const providers = narrowed.length > 0 ? narrowed : pool;

  for (const p of providers) {
    if (!p.readPhases) continue;
    try {
      const got = await p.readPhases(itstId, kind);
      if (got && got.rows.length > 0) {
        return { ok: true, rows: got.rows, fetched: got.fetched };
      }
      if (got) known = got.kinds ?? known ?? [];
    } catch (e) {
      failures.push(`${p.label} — ${(e as Error).message}`);
    }
  }

  // ⚠️ 순서가 중요하다. 포털 장애를 "값 없음" 으로 덮으면 위 사고가 그대로 재현된다
  if (known !== null) return { ok: false, reason: "kind-empty", kinds: known };
  if (failures.length > 0) return { ok: false, reason: "portal-error", failures };
  return { ok: false, reason: "unknown-intersection" };
}

/**
 * 교차로 목록 — 설정된 제공자 전부에서 모은다.
 *
 * ⚠️ **한 제공자의 실패가 전체를 멈추지 않는다.** T-Data 를 함께 쓰던 시절, 그쪽
 * 교차로 Map 이 404(활용신청 미승인)를 내면 그 예외가 올라가 **행안부가 이미 받은
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
