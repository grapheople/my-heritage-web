import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { saveCalibration } from "@/lib/signal/calibration";
import { deriveGreenStart, driftSeconds, readProfile } from "@/lib/signal/cycle";
import { getLights } from "@/lib/signal/lights";
import { readLiveTarget } from "@/lib/signal/live-target";
import { checkPortalQuota, recordPortalCalls } from "@/lib/signal/portal";
import { loadProfile } from "@/lib/signal/resolve";
import { isLiveConfigured, readLive } from "@/lib/signal/providers";

/**
 * 주기 동기화 — **실시간 API 를 쓰는 유일한 자리다.**
 *
 * `POST /api/signal/sync?id=home`
 *
 * 실시간 신호 1건을 읽어 **기준 시각(`greenStartAt`)을 역산해 저장한다.** 그 뒤로는
 * `GET /api/signal` 이 호출 없이 계속 맞는다. 즉 이 엔드포인트가 사는 이유는
 * "지금 몇 초 남았는지"를 알기 위해서가 아니라 **시계를 맞추기 위해서**다.
 *
 * ## ⚠️ POST 인 이유
 * 외부 쿼터(하루 1,000건)를 태우고 DB 에 이력을 남긴다 — 부수효과가 있는 요청이다.
 * GET 으로 두면 브라우저·프리페치·크롤러가 대신 눌러 쿼터를 녹인다.
 *
 * ## ⚠️ 로그인한 사용자만
 * 인가가 아니라 **쿼터 보호**다. 누가 태웠는지도 이력에 남긴다(`requestedBy`).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: "로그인이 필요하다" },
      { status: 401, headers: NO_STORE },
    );
  }

  const id = new URL(req.url).searchParams.get("id")?.trim();
  const lights = getLights();
  const light = id
    ? (lights.find((l) => l.id === id) ?? null)
    : lights.length === 1
      ? lights[0]
      : null;
  if (!light) {
    return NextResponse.json(
      {
        error: id ? `등록되지 않은 신호등이다: ${id}` : "id 가 필요하다",
        lights: lights.map((l) => ({ id: l.id, name: l.name })),
      },
      { status: id ? 404 : 400, headers: NO_STORE },
    );
  }

  /** 화면에서 고른 대상이 설정을 이긴다 (`SignalLightLive`) */
  const target = await readLiveTarget(light.id, light.live);
  if (!target) {
    return NextResponse.json(
      {
        error: "이 신호등에는 실시간 대상이 정해져 있지 않다",
        hint: "화면의 '신호등 찾기'로 교차로·방위를 고르면 된다. 개방 대상이 아니면 동기화 없이 3번 눌러 측정하는 방법을 쓴다",
      },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isLiveConfigured()) {
    return NextResponse.json(
      { error: "POLICE_SIGNAL_API_KEY 가 없다", hint: "공공데이터포털의 「(전국 통합데이터) 교통안전 신호등 실시간 정보」 인증키를 환경변수에 넣어라" },
      { status: 503, headers: NO_STORE },
    );
  }

  const now = new Date();
  /*
    ⚠️ **보정이 적용된 주기**를 쓴다 (`loadProfile`). 설정의 옛 길이로 기준 시각을
    역산하면, 수동 측정으로 길이를 고친 뒤의 동기화가 어긋난 값을 심는다.
  */
  const loaded = await loadProfile(light, now);
  if (!loaded.ok) {
    return NextResponse.json(
      {
        ...loaded.failure,
        hint: `${loaded.failure.hint} — 동기화는 기준 시각만 보정한다. 녹색·적색 길이는 화면에서 3번 눌러 측정할 수 있다`,
      },
      { status: 409, headers: NO_STORE },
    );
  }
  const { configured, profile } = loaded;

  /*
    ⚠️ 쿼터 판정을 **실시간 호출 전에** 한다. 호출한 뒤에 막으면 이미 쿼터는
    줄어 있고 결과만 버리는 셈이다 — 막는 의미가 없다.
  */
  const gate = await checkPortalQuota(target.itstId, now);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.reason, quota: gate.quota },
      { status: 429, headers: NO_STORE },
    );
  }

  let live;
  try {
    const result = await readLive(target);
    live = result.reading;
    // ⚠️ 캐시에 맞았으면 기록하지 않는다 — 호출이 없었으므로 한도를 쓰지 않았다
    if (result.fetched) {
      await recordPortalCalls({
        endpoint: "SIGNAL_PHASE",
        target: target.itstId,
        requestedBy: viewer.userId,
      });
    }
  } catch (error) {
    console.error(`[signal] ${light.id} 실시간 조회 실패:`, error);
    return NextResponse.json(
      { error: "실시간 조회 실패", detail: error instanceof Error ? error.message : undefined },
      { status: 502, headers: NO_STORE },
    );
  }
  if (!live) {
    return NextResponse.json(
      {
        error: "응답에 해당 방위·신호종별 필드가 없다",
        hint: "itstId 가 개방 대상인지, direction·kind 가 맞는지 확인하라",
      },
      { status: 502, headers: NO_STORE },
    );
  }

  // 황색·불명은 기준을 잡을 수 없다. 황색 뒤 전적색 길이를 모르기 때문이다
  if (live.state !== "green" && live.state !== "red") {
    return NextResponse.json(
      {
        error: `지금은 기준을 잡을 수 없는 상태다 (${live.state})`,
        hint: "황색이 지나간 뒤 다시 시도하라",
        observed: live,
      },
      { status: 409, headers: NO_STORE },
    );
  }
  if (live.secondsRemaining === null) {
    return NextResponse.json(
      {
        error: "실시간 응답에서 잔여시간 필드를 찾지 못했다",
        hint: "observed.detail 에 어느 필드를 어떻게 읽었는지 들어 있다 — 비어 있으면 이 교차로가 그 종별 잔여시간을 내지 않는 것이다",
        observed: live,
      },
      { status: 409, headers: NO_STORE },
    );
  }

  const actual = deriveGreenStart({
    state: live.state,
    secondsRemaining: live.secondsRemaining,
    profile,
    now,
  });
  if (!actual) {
    /*
      ⚠️ 관측이 측정 주기와 모순된다 — 이때 덮으면 오차를 영구히 심는다.
      "녹색 45초 남음"인데 greenSec 이 30 이면 주기를 다시 재야 한다.
    */
    return NextResponse.json(
      {
        error: "실시간 관측이 측정한 주기와 맞지 않는다",
        hint: `greenSec=${profile.greenSec}·redSec=${profile.redSec} 을 다시 측정하라 (관측: ${live.state} ${live.secondsRemaining}초 남음)`,
        observed: live,
      },
      { status: 409, headers: NO_STORE },
    );
  }

  const label = configured.label ?? null;
  /** 지금 실제로 쓰이는 기준 시각 — 이전 보정이 있으면 이미 그 값이다 */
  const effective = new Date(Date.parse(profile.greenStartAt));
  const cycleSec = profile.greenSec + profile.redSec;
  const drift = driftSeconds(effective, actual, cycleSec);
  const before = readProfile(profile, now);

  const saved = await saveCalibration({
    lightId: light.id,
    profileLabel: label,
    greenStartAt: actual,
    driftSec: drift,
    liveState: live.state,
    liveRaw: live.detail,
    requestedBy: viewer.userId,
  });

  return NextResponse.json(
    {
      applied: true,
      id: light.id,
      profile: label,
      cycleSec,
      drift: {
        seconds: drift,
        // 부호만 보면 어느 쪽으로 밀렸는지 헷갈린다 — 문장으로 같이 낸다
        meaning:
          drift === 0
            ? "설정이 실제와 일치했다"
            : drift > 0
              ? `설정이 실제보다 ${drift}초 늦었다 (기준 시각을 앞으로 당겼다)`
              : `설정이 실제보다 ${-drift}초 빨랐다 (기준 시각을 뒤로 밀었다)`,
      },
      greenStartAt: { before: effective.toISOString(), after: actual.toISOString() },
      /*
        화면이 재조회를 기다리지 않고 바로 갱신할 수 있도록 `GET /api/signal` 의
        `calibration` 과 **같은 모양**으로 함께 낸다. 재조회가 실패해도(오프라인)
        방금 한 일이 화면에 반영되지 않는 상태가 생기지 않는다.
      */
      calibration: {
        syncedAt: saved.createdAt.toISOString(),
        driftSec: drift,
        source: "LIVE" as const,
      },
      predicted: before && { state: before.state, secondsRemaining: before.secondsRemaining },
      observed: live,
      quota: { ...gate.quota, usedToday: gate.quota.usedToday + 1 },
    },
    { headers: NO_STORE },
  );
}
