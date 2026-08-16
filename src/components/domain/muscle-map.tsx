/**
 * 근육맵 — 자극부위를 사람 실루엣에 칠한다 (D-222).
 *
 * ## ⚠️ 왜 직접 그렸는가
 * 근육 다이어그램은 **의학 일러스트 유래가 많아 상업적 사용 조건이 갈린다.**
 * 오픈소스를 가져다 쓰면 나중에 통째로 갈아야 할 수 있다. 직접 저작하면
 * 그 위험이 **사라진다.**
 *
 * ## ⚠️ 해부도가 아니라 **기호**다
 * 정확한 해부 형태를 그리지 않았다 — 목적은 학습이 아니라 **구분**이다.
 * 3열 정사각 그리드의 카드에서 `가슴/삼두` 루틴과 `하체` 루틴이 **한눈에
 * 갈리는 것**이 이 그림이 하는 일이다 (D-074 — 카드의 정보량 예산).
 * 그래서 원·둥근 사각형만 쓴다. 작게 줄여도 뭉개지지 않는다.
 *
 * ## ⚠️ 무채색이다 (D-079 · DS-2)
 * "색은 아이템이 담당한다"가 이 서비스의 방향이고 `--primary` 는 검정이다.
 * 근육맵에 색을 넣으면 방 진열에서 **사진보다 근육맵이 튄다.** 활성 부위는
 * 진하게, 비활성은 옅게 — **명도만으로** 가른다. 시맨틱 토큰만 쓰므로
 * 다크 모드에서 자동으로 반전된다 (OI-44).
 *
 * ## 근육군 키는 `targetMuscle` 옵션과 **1:1** 이다
 * D-166 이 `free-exercise-db` 에서 고른 14개 그대로다. 키가 어긋나면 칠할
 * 곳을 못 찾는데 **조용히 안 칠해질 뿐**이라 알아채기 어렵다 — 그래서
 * `MUSCLE_KEYS` 를 내보내고 시드 스크립트가 이것과 대조한다.
 */

/** D-166 `targetMuscle` 옵션 14개. 시드와 **대조되는 값**이다 */
export const MUSCLE_KEYS = [
  "chest", "lats", "middleBack", "lowerBack", "shoulders", "traps",
  "biceps", "triceps", "forearms", "abdominals",
  "glutes", "quadriceps", "hamstrings", "calves",
] as const;

export type MuscleKey = (typeof MUSCLE_KEYS)[number];

type Shape =
  | { t: "e"; cx: number; cy: number; rx: number; ry: number }
  | { t: "r"; x: number; y: number; w: number; h: number; rx: number }
  | { t: "p"; d: string };

/**
 * 한 사람의 좌표계는 **80 × 112** 다. 좌우 대칭이라 한쪽만 적고 `mirror` 로
 * 뒤집는다 — 두 벌을 적으면 한쪽만 고치는 실수가 난다.
 */
const W = 80;

/**
 * 실루엣 — 근육 아래에 깔리는 몸통. 앞뒤가 같다(기호이므로).
 *
 * ⚠️ 미리보기 생성기가 **이 데이터를 그대로 읽는다.** 미리보기가 자기
 * 좌표를 따로 들면 화면과 미리보기가 갈린다 — 이 저장소가 반복해서 겪은
 * 실패다 (D-190·D-197·D-202).
 */
export const BODY: Shape[] = [
  { t: "e", cx: 40, cy: 12, rx: 8, ry: 8.5 },              // 머리
  { t: "r", x: 36, y: 19, w: 8, h: 6, rx: 2 },             // 목
  { t: "p", d: "M23 28 H57 L52 63 H28 Z" },                 // 몸통
  { t: "r", x: 28, y: 62, w: 24, h: 9, rx: 3 },            // 골반
  { t: "r", x: 16, y: 29, w: 8, h: 34, rx: 4 },            // 왼팔
  { t: "r", x: 56, y: 29, w: 8, h: 34, rx: 4 },            // 오른팔
  { t: "r", x: 28, y: 70, w: 10, h: 36, rx: 4 },           // 왼다리
  { t: "r", x: 42, y: 70, w: 10, h: 36, rx: 4 },           // 오른다리
];

/** 좌우 대칭 도형을 반대편으로 옮긴다 */
function mirror(s: Shape): Shape {
  if (s.t === "e") return { ...s, cx: W - s.cx };
  if (s.t === "r") return { ...s, x: W - s.x - s.w };
  return s;
}

function pair(...shapes: Shape[]): Shape[] {
  return shapes.flatMap((s) => [s, mirror(s)]);
}

/** 앞모습에서 보이는 근육 */
const FRONT: Partial<Record<MuscleKey, Shape[]>> = {
  traps: [{ t: "p", d: "M30 26 H50 L45 33 H35 Z" }],
  shoulders: pair({ t: "e", cx: 24.5, cy: 33, rx: 6, ry: 5.5 }),
  chest: pair({ t: "r", x: 28, y: 33, w: 11, h: 12, rx: 4 }),
  abdominals: [{ t: "r", x: 34, y: 46, w: 12, h: 16, rx: 3 }],
  biceps: pair({ t: "e", cx: 20, cy: 41, rx: 4, ry: 7 }),
  forearms: pair({ t: "e", cx: 20, cy: 56, rx: 3.6, ry: 7 }),
  quadriceps: pair({ t: "r", x: 29, y: 72, w: 9, h: 19, rx: 4 }),
  calves: pair({ t: "r", x: 30, y: 93, w: 7, h: 12, rx: 3 }),
};

/** 뒷모습에서 보이는 근육 */
const BACK: Partial<Record<MuscleKey, Shape[]>> = {
  /*
    ⚠️ **승모근과 광배가 겹치지 않게 잘랐다.** 둘은 당기기 루틴에서 거의
    항상 함께 켜지는데, 겹치면 한 덩어리로 보여 "등 루틴"이 무엇을 하는
    루틴인지 구분되지 않는다 — 미리보기를 눈으로 보고 찾았다
  */
  traps: [{ t: "p", d: "M30 26 H50 L47 38 H33 Z" }],
  shoulders: pair({ t: "e", cx: 24.5, cy: 33, rx: 6, ry: 5.5 }),
  // 광배는 겨드랑이에서 허리로 좁아지는 V — 이 실루엣의 특징이다
  lats: pair({ t: "p", d: "M26.5 39 H34 L32.5 58 L28.5 52 Z" }),
  middleBack: [{ t: "r", x: 36, y: 40, w: 8, h: 13, rx: 2 }],
  lowerBack: [{ t: "r", x: 34, y: 54, w: 12, h: 8, rx: 2 }],
  triceps: pair({ t: "e", cx: 20, cy: 41, rx: 4, ry: 7 }),
  forearms: pair({ t: "e", cx: 20, cy: 56, rx: 3.6, ry: 7 }),
  glutes: pair({ t: "e", cx: 34.5, cy: 67, rx: 6, ry: 5 }),
  hamstrings: pair({ t: "r", x: 29, y: 74, w: 9, h: 17, rx: 4 }),
  calves: pair({ t: "r", x: 30, y: 93, w: 7, h: 12, rx: 3 }),
};

export const MUSCLE_VIEWS = { front: FRONT, back: BACK } as const;

function render(s: Shape, key: string, className: string) {
  if (s.t === "e")
    return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} className={className} />;
  if (s.t === "r")
    return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} className={className} />;
  return <path key={key} d={s.d} className={className} />;
}

function Figure({
  view,
  active,
  dx,
}: {
  view: "front" | "back";
  active: Set<string>;
  dx: number;
}) {
  const map = MUSCLE_VIEWS[view];
  return (
    <g transform={`translate(${dx} 0)`}>
      {/* 실루엣 — 활성 부위가 없어도 사람 형태는 보인다 */}
      {BODY.map((s, i) => render(s, `b${i}`, "fill-muted"))}
      {/*
        ⚠️ **활성 부위만 그린다.** 비활성까지 다른 톤으로 그리면 실루엣과
        구분이 안 되면서 카드만 복잡해진다 — 기호의 목적을 해친다
      */}
      {Object.entries(map).flatMap(([key, shapes]) =>
        active.has(key)
          ? shapes!.map((s, i) => render(s, `${view}-${key}-${i}`, "fill-foreground"))
          : [],
      )}
    </g>
  );
}

/**
 * 자극부위 근육맵.
 *
 * ⚠️ `muscles` 는 **`targetMuscle` 옵션 키**다. 라벨(가슴/胸/Chest)이 아니다 —
 * 라벨을 받으면 언어마다 다른 그림이 나온다.
 */
export function MuscleMap({
  muscles,
  className,
  title,
}: {
  muscles: readonly string[];
  className?: string;
  /** 스크린리더용. 카드에서는 근육군 라벨을 이어 붙여 넘긴다 */
  title?: string;
}) {
  const active = new Set(muscles);
  return (
    <svg
      viewBox="0 0 168 112"
      className={className}
      role="img"
      aria-label={title ?? "자극부위"}
    >
      <Figure view="front" active={active} dx={0} />
      <Figure view="back" active={active} dx={88} />
    </svg>
  );
}
