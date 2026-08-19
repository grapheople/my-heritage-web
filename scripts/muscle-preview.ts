import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BODY, MUSCLE_KEYS, MUSCLE_VIEWS } from "../src/components/domain/muscle-map";

/**
 * 근육맵 **미리보기 생성기** (D-239, OI-107 해소).
 *
 * ## ⚠️ 왜 저장소에 있어야 하는가
 * 근육맵은 **좌표를 봐서는 검증할 수 없다.** D-225 는 렌더해서 결함 3건을
 * 찾았고(실루엣이 배경에 녹음 · 광배 한쪽만 칠해짐 · 어깨↔이두 겹침), D-238 은
 * 6건을 찾았다(머리가 후드 · 어깨에 선반 · 복부가 넥타이 · 앞 승모근이 부채 ·
 * 뒷 승모근이 망토 · 광배+허리가 양동이). **아홉 건 전부 좌표만 보고는 보이지
 * 않았다.**
 *
 * 그런데 두 번 다 **세션 임시 스크립트**로 렌더하고 지웠다. D-223 의 주석은
 * "미리보기 생성기가 이 데이터를 그대로 읽는다"고 적어뒀지만 **그 파일이 없었다** —
 * 다음 사람은 또 만들어야 하고, 안 만들면 좌표만 보고 고치다 같은 결함을
 * 반복한다. 그래서 커밋한다.
 *
 * ## ⚠️ 화면과 **같은 데이터**를 읽는다
 * `BODY`·`MUSCLE_VIEWS` 를 import 한다. 미리보기가 자기 좌표를 따로 들면
 * **화면과 미리보기가 갈린다** — 이 저장소가 반복해서 겪은 실패다
 * (D-190·D-197·D-202).
 *
 * ## ⚠️ 두 크기로 낸다 — 둘 다 필요하다
 * | 크기 | 무엇을 본다 |
 * |---|---|
 * | **900px** | 형태. 사람으로 읽히는가, 부위가 해부 방향을 따르는가 |
 * | **104px** (실제 카드) | **구분**. 밀기/당기기/하체 루틴이 한눈에 갈리는가 (D-074) |
 *
 * 큰 것만 보면 카드에서 뭉개지는 것을 놓치고, 작은 것만 보면 형태 결함을 놓친다.
 *
 *   pnpm muscle-preview          # SVG + (magick 있으면) PNG
 *   open .muscle-preview/sheet.png
 */

const OUT = ".muscle-preview";
const W = 80;
/** 실루엣·활성 부위 색 — 화면의 `fill-border`·`fill-foreground` 라이트 모드 값 */
const SIL = "#e5e5e5";
const ON = "#171717";
/** 카드가 놓이는 배경 — `bg-muted`. ⚠️ 실루엣이 여기 녹으면 D-225 의 결함이다 */
const CARD_BG = "#f7f7f7";


/** Chrome 위치 후보 — macOS 기본 경로와 PATH 이름들 */
const CHROMES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "google-chrome",
  "chromium",
];

/**
 * SVG → PNG.
 *
 * ## ⚠️ `magick` 만으로는 **낱장 시트가 실패한다**
 * ImageMagick 의 내장 SVG 렌더러는 `<text>` 를 만나면 폰트를 찾지 못해
 * `unable to read font` 로 죽는다 — 부위 이름 라벨이 붙은 `sheet.svg` 가 정확히
 * 그것이다. 라벨을 빼면 **어느 그림이 어느 부위인지 알 수 없어** 시트의 목적이
 * 사라지므로, 그때는 **Chrome 으로 넘긴다.**
 *
 * ⚠️ 둘 다 없으면 **조용히 SVG 만 남긴다.** 도구가 없다고 스크립트를 실패시키지
 * 않는다 — 브라우저로 열면 볼 수 있다.
 */
function toPng(svg: string, png: string): boolean {
  try {
    execFileSync("magick", [svg, png], { stdio: "ignore" });
    return true;
  } catch {
    /* 아래 Chrome 으로 재시도 */
  }
  for (const bin of CHROMES) {
    try {
      execFileSync(
        bin,
        [
          "--headless",
          "--disable-gpu",
          "--hide-scrollbars",
          "--window-size=1000,1400",
          `--screenshot=${png}`,
          `file://${resolve(svg)}`,
        ],
        { stdio: "ignore" },
      );
      return true;
    } catch {
      /* 다음 후보 */
    }
  }
  return false;
}

type Shape = (typeof BODY)[number];

function shape(s: Shape, fill: string): string {
  if (s.t === "e") return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${fill}"/>`;
  if (s.t === "r")
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${fill}"/>`;
  const p = `<path d="${s.d}" fill="${fill}"/>`;
  // 화면과 같은 방식으로 뒤집는다 (좌표를 손으로 뒤집으면 두 벌이 된다, D-225)
  return s.flip ? `<g transform="translate(${W} 0) scale(-1 1)">${p}</g>` : p;
}

function figure(view: "front" | "back", active: Set<string>, dx: number): string {
  const map = MUSCLE_VIEWS[view] as Record<string, Shape[] | undefined>;
  const body = BODY.map((s) => shape(s, SIL)).join("");
  const on = Object.entries(map)
    .filter(([k]) => active.has(k))
    .flatMap(([, list]) => (list ?? []).map((s) => shape(s, ON)))
    .join("");
  return `<g transform="translate(${dx} 0)">${body}${on}</g>`;
}

/** 앞·뒤 한 쌍 (화면과 같은 `viewBox`) */
function pairSvg(active: string[], width: number, bg = "none"): string {
  const a = new Set(active);
  const height = Math.round((width * 112) / 168);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 112" width="${width}" height="${height}">`,
    bg === "none" ? "" : `<rect width="168" height="112" fill="${bg}"/>`,
    figure("front", a, 0),
    figure("back", a, 88),
    "</svg>",
  ].join("");
}

/** 실제 루틴 조합 — **이 그림이 갈라야 하는 것들**이다 (D-074) */
const COMBOS: [label: string, keys: string[]][] = [
  ["실루엣만", []],
  ["전부", [...MUSCLE_KEYS]],
  ["밀기 (가슴·삼두·어깨)", ["chest", "triceps", "shoulders"]],
  ["당기기 (광배·등·이두·승모)", ["lats", "middleBack", "biceps", "traps"]],
  ["하체 (사두·둔근·햄·종아리)", ["quadriceps", "glutes", "hamstrings", "calves"]],
  ["코어 (복부·허리)", ["abdominals", "lowerBack"]],
  ["팔 (이두·삼두·전완)", ["biceps", "triceps", "forearms"]],
];

function sheet(): string {
  const cellW = 168;
  const rowH = 132;
  const cols = 4;
  // ① 부위 낱개 14장 — 겹침·누락을 눈으로 찾는다
  const each = MUSCLE_KEYS.map((k, i) => {
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * rowH;
    return `<g transform="translate(${x} ${y})">${figure("front", new Set([k]), 0)}${figure("back", new Set([k]), 88)}<text x="3" y="126" font-size="8" font-family="sans-serif" fill="#666">${k}</text></g>`;
  }).join("");
  const eachRows = Math.ceil(MUSCLE_KEYS.length / cols);
  // ② 루틴 조합 — 실제로 갈려야 하는 것들
  const combos = COMBOS.map(([label, keys], i) => {
    const x = (i % cols) * cellW;
    const y = eachRows * rowH + 24 + Math.floor(i / cols) * rowH;
    const a = new Set(keys);
    return `<g transform="translate(${x} ${y})">${figure("front", a, 0)}${figure("back", a, 88)}<text x="3" y="126" font-size="8" font-family="sans-serif" fill="#666">${label}</text></g>`;
  }).join("");
  const comboRows = Math.ceil(COMBOS.length / cols);
  const h = eachRows * rowH + 24 + comboRows * rowH;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cellW} ${h}" width="${cols * cellW * 1.4}">`,
    `<rect width="${cols * cellW}" height="${h}" fill="white"/>`,
    each,
    `<text x="3" y="${eachRows * rowH + 16}" font-size="10" font-family="sans-serif" fill="#111">루틴 조합 — 카드에서 갈려야 하는 것들</text>`,
    combos,
    "</svg>",
  ].join("");
}

function main() {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, "sheet.svg"), sheet());
  writeFileSync(join(OUT, "form.svg"), pairSvg([...MUSCLE_KEYS], 900));
  writeFileSync(join(OUT, "silhouette.svg"), pairSvg([], 460));
  /*
    ⚠️ **카드 크기는 배경을 깔고 낸다.** 투명 배경으로 보면 실루엣이 배경에 녹는
    결함(D-225 ①)을 못 잡는다 — 실제로 놓이는 자리는 `bg-muted` 다
  */
  const cards = COMBOS.filter(([, k]) => k.length > 0 && k.length < 14);
  for (const [label, keys] of cards) {
    const name = label.split(" ")[0];
    writeFileSync(join(OUT, `card-${name}.svg`), pairSvg(keys, 156, CARD_BG));
  }

  const files = ["sheet", "form", "silhouette", ...cards.map(([l]) => `card-${l.split(" ")[0]}`)];
  let png = 0;
  for (const f of files) {
    if (toPng(join(OUT, `${f}.svg`), join(OUT, `${f}.png`))) png++;
  }

  console.log(`미리보기 ${files.length}종 생성 → ${OUT}/`);
  console.log(
    png > 0
      ? `PNG ${png}장 함께 생성. \`open ${OUT}/sheet.png\` 로 확인하세요.`
      : `⚠️ PNG 변환을 건너뛰었습니다 (\`magick\` 없음). SVG 를 브라우저로 열어 확인하세요.`,
  );
  console.log(
    "\n⚠️ **두 크기를 모두 보세요** — `form`(형태: 사람으로 읽히는가) + `card-*`(구분: 루틴이 갈리는가).",
  );
  console.log("   좌표만 보고 고치면 D-225·D-238 의 결함 9건을 반복합니다.");
}

main();
