"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommuteLiveFinder } from "@/components/domain/commute-live-finder";
import { Link } from "@/i18n/navigation";
import type { LiveRef } from "@/lib/signal/lights";
import { readProfile } from "@/lib/signal/cycle";
import type { SignalAnswer } from "@/lib/signal/resolve";
import { cn } from "@/lib/utils";

/**
 * 출근길 신호등 카운트다운 + 주기 측정.
 *
 * ## ⚠️ 초를 세는 일은 클라이언트가 한다
 * 서버가 주는 것은 **주기 원본**(기준 시각·녹색·적색)이고, 남은 초는 여기서
 * 계산한다. 그래서 화면을 켜 두어도 요청이 늘지 않는다 — 1초마다 물으면
 * 하루 수만 건이고, 실시간 API 쿼터(하루 1,000건)와는 별개로 그 자체가 낭비다.
 *
 * 계산은 서버와 **같은 함수**(`readProfile`)를 쓴다. 여기에 같은 식을 다시 적으면
 * 한쪽만 고쳐졌을 때 "화면과 API 가 다른 숫자를 말하는" 상태가 된다.
 *
 * ## ⚠️ 시계 차이를 보정한다
 * 기기 시계는 몇 초씩 틀린다. 마운트 직후 `/api/signal` 을 한 번 불러
 * `왕복시간/2` 를 감안해 서버 시각과의 차이를 잡아두고, 그 뒤로는 그 차이를
 * 더해서만 센다. 화면이 다시 보일 때(폰을 깨웠을 때)도 다시 잡는다 — 슬립
 * 중에는 타이머가 멈추고 보정도 낡는다.
 *
 * ## 측정과 동기화는 다른 일이다
 * **측정**(3번 누르기)은 녹색·적색 길이까지 정하고 설정 없이 지금 당장 된다.
 * **동기화**는 실시간 개방 대상 교차로에서 기준 시각만 다시 맞춘다. 그래서
 * 측정 버튼은 로그인만 요구하고, 동기화 버튼은 `live` 설정이 있을 때만 낸다.
 */

/**
 * 신호색 → 토큰 매핑.
 *
 * ## ⚠️ 새 유채색을 만들지 않는다 (D-079)
 * "서비스 크롬은 무채색, 유채색은 sale·warn·priv + destructive 뿐이고 네 번째를
 * 추가하려면 기획 결정이 필요하다." 신호등은 색이 곧 내용이라 색을 쓰는 것이
 * 맞지만, 그렇다고 `--signal-go` 같은 토큰을 여기서 만들면 그 결정을 코드가
 * 대신 내리는 셈이다. 그래서 **있는 토큰을 빌려 쓴다** — 초록은 `sale`,
 * 빨강은 `destructive`, 노랑은 `warn`.
 *
 * 기획에서 신호 팔레트가 승인되면 **이 상수만** 바꾸면 된다.
 */
const TONE = {
  green: { text: "text-sale", bg: "bg-sale-bg", bar: "bg-sale" },
  red: { text: "text-destructive", bg: "bg-muted", bar: "bg-destructive" },
  yellow: { text: "text-warn", bg: "bg-warn-bg", bar: "bg-warn" },
  unknown: { text: "text-muted-foreground", bg: "bg-muted", bar: "bg-muted-foreground" },
} as const;

/** 측정 단계 안내 — 누른 횟수가 곧 단계다 */
const MEASURE_STEPS = [
  "measureStepGreen",
  "measureStepRed",
  "measureStepNextGreen",
] as const;

type Calibration = NonNullable<SignalAnswer["calibration"]>;
type SyncResponse = {
  greenStartAt?: { after: string };
  drift?: { seconds: number };
  calibration?: Calibration;
  error?: string;
};
type MeasureResponse = {
  greenStartAt?: string;
  measured?: { greenSec: number; redSec: number; cycleSec: number; measuredAt: string };
  calibration?: Calibration;
  error?: string;
};

export function CommuteSignal({
  initial,
  syncable,
  liveTarget,
  loggedIn,
}: {
  initial: SignalAnswer;
  syncable: boolean;
  /** 화면에서 고른 실시간 대상 (없으면 아직 안 정해진 것) */
  liveTarget: LiveRef | null;
  loggedIn: boolean;
}) {
  const t = useTranslations("commute");
  const format = useFormatter();

  const [cycle, setCycle] = useState(initial.cycle);
  const [calibration, setCalibration] = useState(initial.calibration);
  const [measured, setMeasured] = useState(initial.measured);
  /** 서버 시각 − 기기 시각 (ms) */
  const [skewMs, setSkewMs] = useState(0);
  /*
    ⚠️ **`Date.now()` 로 시작하면 hydration 이 깨진다.** 이 값은 SSR 에서 한 번,
    브라우저 hydration 에서 또 한 번 평가되는데 그 사이에 시간이 흐른다 —
    서버는 `50`, 클라이언트는 `49` 를 그려 React 가 트리를 통째로 다시 만든다
    (실제로 그 오류가 났다).

    서버가 계산에 쓴 시각을 그대로 받아 시작한다 (`initial.asOf`). 그러면 첫
    렌더가 서버와 **같은 입력**으로 같은 숫자를 낸다. 실제 시각으로는 아래
    250ms 타이머가 곧바로 따라잡는다 — 최대 250ms 뒤처질 뿐이다.
  */
  const [nowMs, setNowMs] = useState(() => new Date(initial.asOf).getTime());
  const [busy, setBusy] = useState<"sync" | "measure" | null>(null);
  /** 찾기에서 대상을 정하면 동기화 버튼이 그 자리에서 생긴다 */
  const [hasLiveTarget, setHasLiveTarget] = useState(syncable);
  const [message, setMessage] = useState<string | null>(null);
  /** 측정 중 누른 시각들 — **기기 시계 그대로** 담는다 (서버가 시차를 민다) */
  const [marks, setMarks] = useState<number[] | null>(null);
  /** 이미 갱신 중인 요청이 있는지 — 화면 복귀가 연달아 오면 중복 호출된다 */
  const refreshing = useRef(false);

  /** 서버 상태·시계를 다시 잡는다. 외부 API 는 타지 않는 요청이다 */
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const sentAt = Date.now();
    try {
      const res = await fetch(`/api/signal?id=${encodeURIComponent(initial.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body: SignalAnswer = await res.json();
      const rtt = Date.now() - sentAt;
      // 응답의 asOf 는 왕복의 **중간쯤** 시각이라고 본다 (NTP 와 같은 근사)
      setSkewMs(Date.parse(body.asOf) - (sentAt + rtt / 2));
      setCycle(body.cycle);
      setCalibration(body.calibration);
      setMeasured(body.measured);
    } catch {
      // 오프라인이면 마지막으로 받은 주기로 계속 센다 — 화면을 비우지 않는다
    } finally {
      refreshing.current = false;
    }
  }, [initial.id]);

  useEffect(() => {
    const syncClock = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", syncClock);
    /*
      ⚠️ 마운트 직후의 첫 보정도 **같은 콜백을 예약해서** 부른다. 이펙트 본문에서
      바로 부르면 `react-hooks/set-state-in-effect` 가 잡는다 — 규칙을 피하려는
      우회가 아니라, 이 fetch 는 "외부 시스템 구독"이고 그 결과로 setState 하는
      것이 맞는 형태이기 때문이다. 숨은 탭에서 마운트되면 건너뛰고, 보이는
      순간 위 리스너가 부른다.
    */
    const first = setTimeout(syncClock, 0);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", syncClock);
    };
  }, [refresh]);

  useEffect(() => {
    // 250ms — 1초 간격으로 세면 표시가 한 박자 늦거나 숫자를 건너뛴다
    const timer = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const reading = readProfile(
    { greenStartAt: cycle.greenStartAt, greenSec: cycle.greenSec, redSec: cycle.redSec },
    new Date(nowMs + skewMs),
  );
  const state = reading?.state ?? "unknown";
  const tone = TONE[state];
  const phaseSec = state === "green" ? cycle.greenSec : cycle.redSec;
  /** 남은 비율 — 막대가 줄어드는 방향이 직관과 맞는다 */
  const ratio = reading ? Math.min(1, reading.secondsRemaining / phaseSec) : 0;

  async function sync() {
    setBusy("sync");
    setMessage(null);
    try {
      const res = await fetch(`/api/signal/sync?id=${encodeURIComponent(initial.id)}`, {
        method: "POST",
      });
      const body: SyncResponse = await res.json();
      if (!res.ok || !body.greenStartAt) {
        setMessage(t("syncFailed", { reason: body.error ?? String(res.status) }));
        return;
      }
      // 기준 시각만 갈아끼운다. 주기 길이는 사람이 잰 값이다
      setCycle((c) => ({ ...c, greenStartAt: body.greenStartAt!.after }));
      // ⚠️ 재조회를 기다리지 않는다 — 아래 `refresh()` 가 실패해도 방금 한 일이
      // 화면에 반영되지 않는 상태가 생기면 안 된다
      if (body.calibration) setCalibration(body.calibration);
      const drift = body.drift?.seconds ?? 0;
      setMessage(drift === 0 ? t("syncedNone") : t("synced", { seconds: Math.abs(drift) }));
      void refresh();
    } catch {
      setMessage(t("syncFailed", { reason: "network" }));
    } finally {
      setBusy(null);
    }
  }

  async function submitMeasurement([green, red, nextGreen]: number[]) {
    setBusy("measure");
    try {
      const res = await fetch(`/api/signal/measure?id=${encodeURIComponent(initial.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          greenStartAt: new Date(green).toISOString(),
          redStartAt: new Date(red).toISOString(),
          nextGreenStartAt: new Date(nextGreen).toISOString(),
          /*
            ⚠️ 기기 시계 값을 그대로 보낸다. 서버가 `지금 − sentAt` 만큼 세 시각을
            통째로 밀어 **간격은 보존하고** 기준 시각만 서버 시계로 옮긴다.
            여기서 미리 `skewMs` 를 더하면 보정이 두 번 걸린다.
          */
          sentAt: new Date().toISOString(),
        }),
      });
      const body: MeasureResponse = await res.json();
      if (!res.ok || !body.greenStartAt || !body.measured) {
        setMessage(t("measureFailed", { reason: body.error ?? String(res.status) }));
        return;
      }
      setCycle({
        greenStartAt: body.greenStartAt,
        greenSec: body.measured.greenSec,
        redSec: body.measured.redSec,
      });
      /*
        ⚠️ `measured` 를 **여기서** 채운다. 재조회로만 채우면, 측정을 끝낸 직후
        잠깐(그리고 오프라인이면 계속) "예시 주기예요" 경고가 남아 사용자가 방금
        한 측정을 의심하게 된다. 카운트다운은 위 `setCycle` 로 이미 새 주기다.
      */
      setMeasured({
        greenSec: body.measured.greenSec,
        redSec: body.measured.redSec,
        measuredAt: body.measured.measuredAt,
      });
      if (body.calibration) setCalibration(body.calibration);
      setMessage(
        t("measured", { green: body.measured.greenSec, cycle: body.measured.cycleSec }),
      );
      void refresh();
    } catch {
      setMessage(t("measureFailed", { reason: "network" }));
    } finally {
      setBusy(null);
      setMarks(null);
    }
  }

  function mark() {
    const next = [...(marks ?? []), Date.now()];
    if (next.length < MEASURE_STEPS.length) {
      setMarks(next);
      return;
    }
    void submitMeasurement(next);
  }

  const measuring = marks !== null;

  return (
    <div className="px-4 py-6">
      <h1 className="text-lg font-bold tracking-tight">{initial.name}</h1>

      <div className={cn("mt-4 rounded-2xl px-5 py-8 text-center", tone.bg)}>
        {/* 상태 문구는 전환 때만 바뀐다 — 그래서 여기에만 aria-live 를 둔다.
            매초 바뀌는 숫자에 걸면 스크린리더가 초를 전부 읽는다 */}
        <p className={cn("text-sm font-bold", tone.text)} aria-live="polite">
          {t(state)}
        </p>
        <p className={cn("mt-1 text-6xl font-bold tabular-nums", tone.text)}>
          {reading?.secondsRemaining ?? "–"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {state === "green" ? t("greenLeft") : t("untilGreen")}
        </p>

        {/* 남은 시간의 시각적 표현. 색만으로 상태를 전하지 않는다 (위 문구가 본문) */}
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-background/60">
          <div
            className={cn("h-full rounded-full transition-[width] duration-200", tone.bar)}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
        <div>{t("cycle", { seconds: cycle.greenSec + cycle.redSec })}</div>
        <div>
          {calibration
            ? t("lastSynced", {
                time: format.dateTime(new Date(calibration.syncedAt), { timeStyle: "short" }),
              })
            : t("neverSynced")}
        </div>
        {/*
          설정이 예시값이면 숫자를 믿을 수 없다 — 그 사실을 화면에서도 말한다.
          ⚠️ 단, **직접 측정한 값이 있으면 더 이상 예시가 아니다** — 설정 파일의
          `calibrated` 플래그만 보고 경고를 띄우면, 폰으로 측정을 끝낸 뒤에도
          "예시입니다"가 남아 사용자가 자기가 한 일을 의심하게 된다
        */}
        {!initial.calibrated && !measured && <div>{t("notCalibrated")}</div>}
      </dl>

      <div className="mt-5 space-y-3">
        {!loggedIn && (
          // D-069 — 권한이 없어도 메뉴는 노출된다. 안내는 이 화면에서 한다
          <Link href="/login" className="text-sm underline">
            {t("loginToMeasure")}
          </Link>
        )}

        {loggedIn && !measuring && (
          <>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy !== null}
              onClick={() => {
                setMessage(null);
                setMarks([]);
              }}
            >
              {busy === "measure" ? t("syncing") : t("measure")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("measureIntro")}</p>
          </>
        )}

        {loggedIn && measuring && (
          <div className="rounded-xl border p-4 text-center">
            <p className="text-sm font-medium" aria-live="polite">
              {t(MEASURE_STEPS[marks.length])}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("measureProgress", { done: marks.length })}
            </p>
            {/* 누르는 순간이 곧 데이터다 — 큰 타깃으로 둔다 (design-system §8: 최소 44px) */}
            <Button className="mt-4 h-16 w-full text-base" onClick={mark} disabled={busy !== null}>
              {t("measureNow")}
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => setMarks(null)}
              disabled={busy !== null}
            >
              {t("measureCancel")}
            </Button>
          </div>
        )}

        {loggedIn && hasLiveTarget && !measuring && (
          <Button onClick={sync} disabled={busy !== null} className="w-full">
            {busy === "sync" ? t("syncing") : t("sync")}
          </Button>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}

        {/*
          실시간 대상 고르기. 측정 중에는 감춘다 — 신호를 보며 누르는 중에
          다른 선택지가 끼어들면 탭을 놓친다
        */}
        {loggedIn && !measuring && (
          <CommuteLiveFinder
            lightId={initial.id}
            initial={liveTarget}
            onSaved={() => setHasLiveTarget(true)}
          />
        )}
      </div>
    </div>
  );
}
