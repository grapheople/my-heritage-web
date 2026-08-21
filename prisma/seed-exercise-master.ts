import "./env";
import { MUSCLE_KEYS } from "../src/components/domain/muscle-map";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import { insertExercise, normalizeExerciseName } from "../src/lib/exercise-insert";
import { WORKOUT_CATEGORY } from "../src/lib/categories";
import { prisma } from "../src/lib/prisma";

/**
 * 운동 마스터 **본시드** — OI-105 (D-241).
 *
 * ## ⚠️ `attrs:workout-master` 와 다른 스크립트다
 * 그쪽은 **개편 시드**(D-227~D-232)다 — 카테고리 플래그·매칭 키·속성 비활성화를
 * 하고, 딸린 `SEED` 6건은 *"봇 종목의 분류 값 재활용"*(D-230)이라는 별개 목적이다.
 * 100건을 거기 넣으면 스크립트가 두 일을 하게 되고, 개편을 다시 돌릴 때
 * 본시드까지 끌려온다.
 *
 * ## ⚠️ 미검증으로 넣는다 (`UNVERIFIED`)
 * 이 목록은 **사람이 검증한 값이 아니다.** D-185·D-232 가 정한 대로 AI 산출물은
 * 미검증으로 들어가 A-05 에서 사람이 검수한다. 검증됨으로 넣으면 **"사람이
 * 확인했다"는 표시가 거짓**이 되고, 그 거짓은 나중에 잘못된 자극부위가 근육맵을
 * 틀리게 칠할 때까지 드러나지 않는다.
 *
 * 기존 개편 시드 6건이 `VERIFIED` 로 넣으려 한 것은 **그 6건이 D-166 검증에
 * 실제로 쓰인 값**이었기 때문이다 (그마저 옛 도감 승격이라 실제로는 미검증으로
 * 남았다 — 승격은 기존 상태를 물려받는다).
 *
 * ⚠️ 그래서 **설명을 넣지 않는다.** 미검증 도감의 설명 자리는 원문 전용이다
 * (`codex` FR-07-A-05). `insertExercise` 가 설명을 주면 거부한다.
 *
 * ## ⚠️ `insertExercise` 만 부른다
 * 직접 INSERT 하면 **`Exercise` 없는 반쪽 도감**·중복·선택지 밖 값이 조용히
 * 생긴다 (`FR-11-A-04`). 규칙의 단일 출처는 그 함수다 — 부르는 곳이 넷째다
 * (A-17 수동·A-17 AI·A-18 승인·시드).
 *
 * ## ⚠️ 목록 규칙은 `prompts/exercise-research.md` 와 같다
 * 같은 사전을 만드는 일이므로 규칙이 갈리면 AI 수집분과 시드분이 **다른 이름
 * 체계**를 갖게 된다:
 * - **실내 무산소만** — 유산소·스트레칭·플라이오 제외 (D-166, `FR-11-B-07`).
 *   자극부위 14종으로 표현할 수 없는 운동은 근육맵이 칠할 수 없다
 * - **기구가 이름의 일부** — `바벨 벤치프레스` (`벤치프레스` 와 둘 다 내지 않는다)
 * - **브랜드 기구명 금지** — `핵스쿼트` ✅ / `사이벡스 핵스쿼트` ❌
 * - **자극이 실제로 다른 변형은 별개** — `인클라인 벤치프레스`(윗가슴)는 별개다
 *
 * ## ⚠️ 선택지 밖 값을 **삽입 전에** 잡는다
 * `sanitizeExerciseFields` 가 조용히 버려주지만, 버려지면 **자극부위가 빈 운동**이
 * 생기고 화면은 멀쩡하다. 이 스크립트는 어휘를 먼저 대조해 **하나라도 어긋나면
 * 아무것도 넣지 않고 던진다.**
 *
 * ## ⚠️ 커버리지를 스스로 검증한다
 * 14종 중 운동이 0건인 근육이 있으면 **근육맵이 그 부위를 영원히 못 칠하는데
 * 화면은 정상으로 보인다** — 이 저장소가 반복해 겪은 실패 유형이다 (D-225·D-234).
 * 그래서 끝에 부위별·기구별 건수를 내고 0건을 경고한다.
 *
 * ## ⚠️ **삽입만 한다** — 재실행이 기존 행을 덮어쓰지 않는다
 * 멱등하지만 그 멱등은 *"이미 있으면 건너뛴다"* 다. 분류를 고쳐 덮어쓰게 만들면
 * **A-17·A-05 에서 어드민이 손으로 정정한 값이 다음 시드 실행에 조용히
 * 되돌아간다** — D-036 이 "되돌리기 불가를 더 무겁게 본다"고 정한 것과 같은
 * 무게다. 어드민 정정이 시드보다 최신이라고 봐야 한다.
 *
 * 그래서 **목록의 분류를 고쳐도 이미 들어간 행은 안 바뀐다.** 아직 시드를 돌리지
 * 않은 환경(운영)에는 고친 값이 들어가고, 이미 돌린 환경은 손으로 정정한다.
 *
 * 멱등하다. 기존 6건도 목록에 있어 **신규 DB·운영에서도 그대로 돌아간다**.
 *
 *   pnpm db:seed-exercises
 */

type Seed = {
  /** 널리 통용되는 한국어 명칭. **이것이 식별자다** (`FR-11-A-09`) */
  name: string;
  muscles: string[];
  equipment: string;
  mechanic: "compound" | "isolation";
  force: "push" | "pull" | "static";
  /**
   * 언어별 표기 (D-009).
   *
   * ⚠️ **없으면 그 언어 유저가 못 찾는다.** 개편 시드가 실측으로 확인했다 —
   * alias 없이는 `bench` 검색이 **0건**이었다 (D-047 과 같은 자리).
   */
  ja: string[];
  en: string[];
};

const SEED: Seed[] = [
  /* ── 가슴 ───────────────────────────────────────────────── */
  { name: "바벨 벤치프레스", muscles: ["chest", "triceps", "shoulders"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["ベンチプレス", "バーベルベンチプレス"], en: ["Bench Press", "Barbell Bench Press"] },
  { name: "인클라인 바벨 벤치프레스", muscles: ["chest", "shoulders", "triceps"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["インクラインベンチプレス"], en: ["Incline Bench Press", "Incline Barbell Bench Press"] },
  { name: "디클라인 바벨 벤치프레스", muscles: ["chest", "triceps"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["デクラインベンチプレス"], en: ["Decline Bench Press"] },
  { name: "덤벨 벤치프레스", muscles: ["chest", "triceps", "shoulders"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["ダンベルベンチプレス"], en: ["Dumbbell Bench Press"] },
  { name: "인클라인 덤벨 벤치프레스", muscles: ["chest", "shoulders", "triceps"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["インクラインダンベルプレス"], en: ["Incline Dumbbell Bench Press"] },
  { name: "덤벨 플라이", muscles: ["chest"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["ダンベルフライ"], en: ["Dumbbell Fly"] },
  { name: "인클라인 덤벨 플라이", muscles: ["chest"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["インクラインダンベルフライ"], en: ["Incline Dumbbell Fly"] },
  { name: "케이블 크로스오버", muscles: ["chest"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["ケーブルクロスオーバー"], en: ["Cable Crossover"] },
  { name: "머신 체스트 플라이", muscles: ["chest"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["マシンチェストフライ", "ペックデック"], en: ["Machine Chest Fly", "Pec Deck"] },
  { name: "머신 체스트 프레스", muscles: ["chest", "triceps", "shoulders"], equipment: "machine", mechanic: "compound", force: "push",
    ja: ["マシンチェストプレス"], en: ["Machine Chest Press"] },
  { name: "푸시업", muscles: ["chest", "triceps", "shoulders"], equipment: "bodyOnly", mechanic: "compound", force: "push",
    ja: ["腕立て伏せ", "プッシュアップ"], en: ["Push-Up"] },
  { name: "체스트 딥스", muscles: ["chest", "triceps"], equipment: "bodyOnly", mechanic: "compound", force: "push",
    ja: ["チェストディップス"], en: ["Chest Dip"] },

  /* ── 등 (광배 중심) ─────────────────────────────────────── */
  { name: "랫풀다운 (와이드 그립)", muscles: ["lats", "middleBack", "biceps"], equipment: "cable", mechanic: "compound", force: "pull",
    ja: ["ラットプルダウン"], en: ["Lat Pulldown", "Wide Grip Lat Pulldown"] },
  { name: "랫풀다운 (언더 그립)", muscles: ["lats", "biceps"], equipment: "cable", mechanic: "compound", force: "pull",
    ja: ["リバースグリップラットプルダウン"], en: ["Underhand Lat Pulldown", "Reverse Grip Lat Pulldown"] },
  { name: "풀업", muscles: ["lats", "middleBack", "biceps"], equipment: "bodyOnly", mechanic: "compound", force: "pull",
    ja: ["懸垂", "プルアップ"], en: ["Pull-Up"] },
  { name: "친업", muscles: ["lats", "biceps"], equipment: "bodyOnly", mechanic: "compound", force: "pull",
    ja: ["チンアップ", "逆手懸垂"], en: ["Chin-Up"] },
  { name: "스트레이트 암 풀다운", muscles: ["lats"], equipment: "cable", mechanic: "isolation", force: "pull",
    ja: ["ストレートアームプルダウン"], en: ["Straight Arm Pulldown"] },
  { name: "바벨 벤트오버 로우", muscles: ["lats", "middleBack", "biceps", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["ベントオーバーロー", "バーベルロー"], en: ["Barbell Bent Over Row", "Barbell Row"] },
  { name: "펜들레이 로우", muscles: ["lats", "middleBack", "traps"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["ペンドレイロー"], en: ["Pendlay Row"] },
  { name: "원암 덤벨 로우", muscles: ["lats", "middleBack", "biceps"], equipment: "dumbbell", mechanic: "compound", force: "pull",
    ja: ["ワンハンドダンベルロー"], en: ["One Arm Dumbbell Row"] },
  { name: "시티드 케이블 로우", muscles: ["lats", "middleBack", "biceps"], equipment: "cable", mechanic: "compound", force: "pull",
    ja: ["シーテッドケーブルロー"], en: ["Seated Cable Row"] },
  { name: "T바 로우", muscles: ["lats", "middleBack", "traps"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["Tバーロー"], en: ["T-Bar Row"] },
  { name: "머신 시티드 로우", muscles: ["lats", "middleBack", "biceps"], equipment: "machine", mechanic: "compound", force: "pull",
    ja: ["マシンシーテッドロー"], en: ["Machine Seated Row"] },
  { name: "인버티드 로우", muscles: ["middleBack", "lats", "biceps"], equipment: "bodyOnly", mechanic: "compound", force: "pull",
    ja: ["インバーテッドロー", "斜め懸垂"], en: ["Inverted Row"] },

  /* ── 등 중앙 · 승모근 ───────────────────────────────────── */
  { name: "페이스 풀", muscles: ["traps", "shoulders", "middleBack"], equipment: "cable", mechanic: "compound", force: "pull",
    ja: ["フェイスプル"], en: ["Face Pull"] },
  { name: "바벨 슈러그", muscles: ["traps"], equipment: "barbell", mechanic: "isolation", force: "pull",
    ja: ["バーベルシュラッグ"], en: ["Barbell Shrug"] },
  { name: "덤벨 슈러그", muscles: ["traps"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["ダンベルシュラッグ"], en: ["Dumbbell Shrug"] },
  { name: "머신 리어 델트 플라이", muscles: ["shoulders", "middleBack"], equipment: "machine", mechanic: "isolation", force: "pull",
    ja: ["リアデルトフライ", "リバースペックデック"], en: ["Machine Rear Delt Fly", "Reverse Pec Deck"] },
  { name: "덤벨 벤트오버 리어 델트 레이즈", muscles: ["shoulders", "middleBack"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["ベントオーバーリアレイズ"], en: ["Bent Over Dumbbell Rear Delt Raise"] },
  { name: "밴드 풀 어파트", muscles: ["middleBack", "shoulders"], equipment: "bands", mechanic: "isolation", force: "pull",
    ja: ["バンドプルアパート"], en: ["Band Pull Apart"] },

  /* ── 허리 · 후면사슬 ───────────────────────────────────── */
  { name: "컨벤셔널 데드리프트", muscles: ["hamstrings", "glutes", "lowerBack", "traps"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["デッドリフト", "コンベンショナルデッドリフト"], en: ["Deadlift", "Conventional Deadlift"] },
  { name: "스모 데드리프트", muscles: ["glutes", "quadriceps", "hamstrings", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["スモウデッドリフト"], en: ["Sumo Deadlift"] },
  { name: "루마니안 데드리프트", muscles: ["hamstrings", "glutes", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["ルーマニアンデッドリフト"], en: ["Romanian Deadlift", "RDL"] },
  { name: "덤벨 루마니안 데드리프트", muscles: ["hamstrings", "glutes", "lowerBack"], equipment: "dumbbell", mechanic: "compound", force: "pull",
    ja: ["ダンベルルーマニアンデッドリフト"], en: ["Dumbbell Romanian Deadlift"] },
  { name: "스티프 레그 데드리프트", muscles: ["hamstrings", "glutes", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["スティフレッグデッドリフト"], en: ["Stiff Leg Deadlift"] },
  { name: "랙풀", muscles: ["traps", "lats", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["ラックプル"], en: ["Rack Pull"] },
  { name: "굿모닝", muscles: ["hamstrings", "lowerBack", "glutes"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["グッドモーニング"], en: ["Good Morning"] },
  { name: "백 익스텐션", muscles: ["lowerBack", "glutes", "hamstrings"], equipment: "bodyOnly", mechanic: "compound", force: "pull",
    ja: ["バックエクステンション"], en: ["Back Extension", "Hyperextension"] },
  { name: "글루트 햄 레이즈", muscles: ["hamstrings", "glutes", "lowerBack"], equipment: "bodyOnly", mechanic: "compound", force: "pull",
    ja: ["グルートハムレイズ"], en: ["Glute Ham Raise"] },

  /* ── 어깨 ───────────────────────────────────────────────── */
  { name: "바벨 오버헤드 프레스", muscles: ["shoulders", "triceps", "traps"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["オーバーヘッドプレス", "ミリタリープレス"], en: ["Overhead Press", "Military Press"] },
  { name: "시티드 덤벨 숄더 프레스", muscles: ["shoulders", "triceps"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["ダンベルショルダープレス"], en: ["Dumbbell Shoulder Press", "Seated Dumbbell Press"] },
  { name: "아놀드 프레스", muscles: ["shoulders", "triceps"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["アーノルドプレス"], en: ["Arnold Press"] },
  { name: "머신 숄더 프레스", muscles: ["shoulders", "triceps"], equipment: "machine", mechanic: "compound", force: "push",
    ja: ["マシンショルダープレス"], en: ["Machine Shoulder Press"] },
  { name: "덤벨 래터럴 레이즈", muscles: ["shoulders"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["サイドレイズ", "ラテラルレイズ"], en: ["Dumbbell Lateral Raise", "Side Raise"] },
  { name: "케이블 래터럴 레이즈", muscles: ["shoulders"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["ケーブルサイドレイズ"], en: ["Cable Lateral Raise"] },
  { name: "덤벨 프론트 레이즈", muscles: ["shoulders"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["フロントレイズ"], en: ["Dumbbell Front Raise"] },
  { name: "바벨 업라이트 로우", muscles: ["shoulders", "traps"], equipment: "barbell", mechanic: "compound", force: "pull",
    ja: ["アップライトロー"], en: ["Barbell Upright Row"] },
  { name: "랜드마인 프레스", muscles: ["shoulders", "triceps", "chest"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["ランドマインプレス"], en: ["Landmine Press"] },
  { name: "파이크 푸시업", muscles: ["shoulders", "triceps"], equipment: "bodyOnly", mechanic: "compound", force: "push",
    ja: ["パイクプッシュアップ"], en: ["Pike Push-Up"] },

  /* ── 이두 ───────────────────────────────────────────────── */
  { name: "바벨 컬", muscles: ["biceps", "forearms"], equipment: "barbell", mechanic: "isolation", force: "pull",
    ja: ["バーベルカール"], en: ["Barbell Curl"] },
  { name: "EZ바 컬", muscles: ["biceps", "forearms"], equipment: "ezBar", mechanic: "isolation", force: "pull",
    ja: ["EZバーカール"], en: ["EZ Bar Curl"] },
  { name: "덤벨 컬", muscles: ["biceps", "forearms"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["ダンベルカール"], en: ["Dumbbell Curl"] },
  { name: "덤벨 해머 컬", muscles: ["biceps", "forearms"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["ハンマーカール"], en: ["Hammer Curl"] },
  { name: "인클라인 덤벨 컬", muscles: ["biceps"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["インクラインダンベルカール"], en: ["Incline Dumbbell Curl"] },
  { name: "컨센트레이션 컬", muscles: ["biceps"], equipment: "dumbbell", mechanic: "isolation", force: "pull",
    ja: ["コンセントレーションカール"], en: ["Concentration Curl"] },
  { name: "프리처 컬", muscles: ["biceps"], equipment: "ezBar", mechanic: "isolation", force: "pull",
    ja: ["プリーチャーカール"], en: ["Preacher Curl"] },
  { name: "케이블 컬", muscles: ["biceps", "forearms"], equipment: "cable", mechanic: "isolation", force: "pull",
    ja: ["ケーブルカール"], en: ["Cable Curl"] },
  { name: "머신 바이셉 컬", muscles: ["biceps"], equipment: "machine", mechanic: "isolation", force: "pull",
    ja: ["マシンバイセップカール"], en: ["Machine Biceps Curl"] },

  /* ── 삼두 ───────────────────────────────────────────────── */
  { name: "케이블 로프 트라이셉 푸시다운", muscles: ["triceps"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["トライセプスプッシュダウン"], en: ["Triceps Pushdown", "Cable Rope Pushdown"] },
  { name: "케이블 바 트라이셉 푸시다운", muscles: ["triceps"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["バープッシュダウン"], en: ["Cable Bar Triceps Pushdown"] },
  { name: "클로즈 그립 벤치프레스", muscles: ["triceps", "chest", "shoulders"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["ナローグリップベンチプレス"], en: ["Close Grip Bench Press"] },
  { name: "스컬 크러셔", muscles: ["triceps"], equipment: "ezBar", mechanic: "isolation", force: "push",
    ja: ["スカルクラッシャー"], en: ["Skull Crusher", "Lying Triceps Extension"] },
  { name: "오버헤드 케이블 트라이셉 익스텐션", muscles: ["triceps"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["オーバーヘッドケーブルエクステンション"], en: ["Overhead Cable Triceps Extension"] },
  { name: "덤벨 오버헤드 트라이셉 익스텐션", muscles: ["triceps"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["ダンベルオーバーヘッドエクステンション"], en: ["Dumbbell Overhead Triceps Extension"] },
  { name: "덤벨 트라이셉 킥백", muscles: ["triceps"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["トライセプスキックバック"], en: ["Dumbbell Triceps Kickback"] },
  { name: "트라이셉 딥스", muscles: ["triceps", "chest"], equipment: "bodyOnly", mechanic: "compound", force: "push",
    ja: ["トライセプスディップス"], en: ["Triceps Dip"] },
  { name: "머신 트라이셉 익스텐션", muscles: ["triceps"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["マシントライセプスエクステンション"], en: ["Machine Triceps Extension"] },

  /* ── 전완 · 그립 ───────────────────────────────────────── */
  { name: "바벨 리스트 컬", muscles: ["forearms"], equipment: "barbell", mechanic: "isolation", force: "pull",
    ja: ["リストカール"], en: ["Barbell Wrist Curl"] },
  { name: "바벨 리버스 리스트 컬", muscles: ["forearms"], equipment: "barbell", mechanic: "isolation", force: "pull",
    ja: ["リバースリストカール"], en: ["Barbell Reverse Wrist Curl"] },
  { name: "리버스 그립 바벨 컬", muscles: ["forearms", "biceps"], equipment: "barbell", mechanic: "isolation", force: "pull",
    ja: ["リバースカール"], en: ["Reverse Grip Barbell Curl"] },
  { name: "파머스 워크", muscles: ["forearms", "traps", "abdominals"], equipment: "dumbbell", mechanic: "compound", force: "static",
    ja: ["ファーマーズウォーク"], en: ["Farmer's Walk", "Farmer's Carry"] },
  { name: "데드 행", muscles: ["forearms", "lats"], equipment: "bodyOnly", mechanic: "isolation", force: "static",
    ja: ["デッドハング"], en: ["Dead Hang"] },

  /* ── 복부 ───────────────────────────────────────────────── */
  { name: "크런치", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "pull",
    ja: ["クランチ"], en: ["Crunch"] },
  { name: "케이블 크런치", muscles: ["abdominals"], equipment: "cable", mechanic: "isolation", force: "pull",
    ja: ["ケーブルクランチ"], en: ["Cable Crunch"] },
  { name: "행잉 레그 레이즈", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "pull",
    ja: ["ハンギングレッグレイズ"], en: ["Hanging Leg Raise"] },
  { name: "리버스 크런치", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "pull",
    ja: ["リバースクランチ"], en: ["Reverse Crunch"] },
  { name: "플랭크", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "static",
    ja: ["プランク"], en: ["Plank"] },
  { name: "사이드 플랭크", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "static",
    ja: ["サイドプランク"], en: ["Side Plank"] },
  { name: "러시안 트위스트", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "pull",
    ja: ["ロシアンツイスト"], en: ["Russian Twist"] },
  { name: "앱 롤아웃", muscles: ["abdominals", "lats"], equipment: "other", mechanic: "isolation", force: "pull",
    ja: ["アブローラー"], en: ["Ab Rollout", "Ab Wheel Rollout"] },
  { name: "머신 앱 크런치", muscles: ["abdominals"], equipment: "machine", mechanic: "isolation", force: "pull",
    ja: ["マシンアブクランチ"], en: ["Machine Ab Crunch"] },
  { name: "데드버그", muscles: ["abdominals"], equipment: "bodyOnly", mechanic: "isolation", force: "static",
    ja: ["デッドバグ"], en: ["Dead Bug"] },
  { name: "케이블 우드 초퍼", muscles: ["abdominals", "shoulders"], equipment: "cable", mechanic: "compound", force: "pull",
    ja: ["ケーブルウッドチョッパー"], en: ["Cable Wood Chopper"] },

  /* ── 둔근 ───────────────────────────────────────────────── */
  { name: "바벨 힙 스러스트", muscles: ["glutes", "hamstrings"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["バーベルヒップスラスト"], en: ["Barbell Hip Thrust"] },
  { name: "글루트 브릿지", muscles: ["glutes", "hamstrings"], equipment: "bodyOnly", mechanic: "compound", force: "push",
    ja: ["グルートブリッジ", "ヒップリフト"], en: ["Glute Bridge"] },
  { name: "케이블 글루트 킥백", muscles: ["glutes"], equipment: "cable", mechanic: "isolation", force: "push",
    ja: ["ケーブルキックバック"], en: ["Cable Glute Kickback"] },
  { name: "머신 힙 어브덕션", muscles: ["glutes"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["ヒップアブダクション"], en: ["Machine Hip Abduction"] },
  { name: "밴드 힙 어브덕션", muscles: ["glutes"], equipment: "bands", mechanic: "isolation", force: "push",
    ja: ["バンドヒップアブダクション"], en: ["Band Hip Abduction"] },
  { name: "케틀벨 스윙", muscles: ["glutes", "hamstrings", "lowerBack"], equipment: "kettlebell", mechanic: "compound", force: "pull",
    ja: ["ケトルベルスイング"], en: ["Kettlebell Swing"] },
  { name: "덤벨 스텝업", muscles: ["glutes", "quadriceps", "hamstrings"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["ダンベルステップアップ"], en: ["Dumbbell Step-Up"] },
  { name: "불가리안 스플릿 스쿼트", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["ブルガリアンスクワット"], en: ["Bulgarian Split Squat"] },

  /* ── 대퇴사두 ──────────────────────────────────────────── */
  { name: "바벨 하이바 백스쿼트", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["バックスクワット", "ハイバースクワット"], en: ["Back Squat", "High Bar Squat"] },
  { name: "바벨 로우바 백스쿼트", muscles: ["quadriceps", "glutes", "hamstrings", "lowerBack"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["ローバースクワット"], en: ["Low Bar Back Squat"] },
  { name: "프론트 스쿼트", muscles: ["quadriceps", "glutes", "abdominals"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["フロントスクワット"], en: ["Front Squat"] },
  { name: "박스 스쿼트", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["ボックススクワット"], en: ["Box Squat"] },
  { name: "핵스쿼트", muscles: ["quadriceps", "glutes"], equipment: "machine", mechanic: "compound", force: "push",
    ja: ["ハックスクワット"], en: ["Hack Squat"] },
  { name: "레그 프레스", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "machine", mechanic: "compound", force: "push",
    ja: ["レッグプレス"], en: ["Leg Press"] },
  { name: "레그 익스텐션", muscles: ["quadriceps"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["レッグエクステンション"], en: ["Leg Extension"] },
  { name: "바벨 런지", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "barbell", mechanic: "compound", force: "push",
    ja: ["バーベルランジ"], en: ["Barbell Lunge"] },
  { name: "덤벨 워킹 런지", muscles: ["quadriceps", "glutes", "hamstrings"], equipment: "dumbbell", mechanic: "compound", force: "push",
    ja: ["ウォーキングランジ"], en: ["Dumbbell Walking Lunge"] },
  { name: "고블릿 스쿼트", muscles: ["quadriceps", "glutes"], equipment: "kettlebell", mechanic: "compound", force: "push",
    ja: ["ゴブレットスクワット"], en: ["Goblet Squat"] },
  { name: "시시 스쿼트", muscles: ["quadriceps"], equipment: "bodyOnly", mechanic: "isolation", force: "push",
    ja: ["シシースクワット"], en: ["Sissy Squat"] },
  { name: "스미스 머신 스쿼트", muscles: ["quadriceps", "glutes"], equipment: "machine", mechanic: "compound", force: "push",
    ja: ["スミスマシンスクワット"], en: ["Smith Machine Squat"] },

  /* ── 햄스트링 ──────────────────────────────────────────── */
  { name: "라잉 레그 컬", muscles: ["hamstrings"], equipment: "machine", mechanic: "isolation", force: "pull",
    ja: ["レッグカール"], en: ["Lying Leg Curl"] },
  { name: "시티드 레그 컬", muscles: ["hamstrings"], equipment: "machine", mechanic: "isolation", force: "pull",
    ja: ["シーテッドレッグカール"], en: ["Seated Leg Curl"] },
  { name: "노르딕 햄스트링 컬", muscles: ["hamstrings"], equipment: "bodyOnly", mechanic: "isolation", force: "pull",
    ja: ["ノルディックハムストリングカール"], en: ["Nordic Hamstring Curl"] },

  /* ── 종아리 ───────────────────────────────────────────── */
  { name: "스탠딩 카프 레이즈", muscles: ["calves"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["スタンディングカーフレイズ"], en: ["Standing Calf Raise"] },
  { name: "시티드 카프 레이즈", muscles: ["calves"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["シーテッドカーフレイズ"], en: ["Seated Calf Raise"] },
  { name: "덤벨 카프 레이즈", muscles: ["calves"], equipment: "dumbbell", mechanic: "isolation", force: "push",
    ja: ["ダンベルカーフレイズ"], en: ["Dumbbell Calf Raise"] },
  { name: "바벨 카프 레이즈", muscles: ["calves"], equipment: "barbell", mechanic: "isolation", force: "push",
    ja: ["バーベルカーフレイズ"], en: ["Barbell Calf Raise"] },
  { name: "레그 프레스 카프 레이즈", muscles: ["calves"], equipment: "machine", mechanic: "isolation", force: "push",
    ja: ["レッグプレスカーフレイズ"], en: ["Leg Press Calf Raise"] },
];

/**
 * ⚠️ **선택지 밖 값을 삽입 전에 잡는다.**
 *
 * `sanitizeExerciseFields` 가 조용히 버려주지만, 버려지면 **자극부위가 빈 운동**이
 * 남고 화면은 정상으로 보인다 (`FR-11-B-05`). 여기서 걸러야 원인이 즉시 보인다.
 *
 * 하나라도 어긋나면 **아무것도 넣지 않고 던진다** — 절반만 들어간 상태가 가장
 * 나쁘다 (다시 돌릴 때 무엇이 들어갔는지 모른다).
 */
async function assertVocabulary(): Promise<void> {
  const keys = ["targetMuscle", "equipmentType", "mechanic", "forceType"] as const;
  const rows = await prisma.attributeOption.findMany({
    where: { attributeDefinition: { key: { in: [...keys] } }, active: true },
    select: { key: true, attributeDefinition: { select: { key: true } } },
  });
  const allowed = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = allowed.get(r.attributeDefinition.key) ?? new Set<string>();
    set.add(r.key);
    allowed.set(r.attributeDefinition.key, set);
  }
  for (const k of keys) {
    if (!allowed.get(k)?.size) {
      throw new Error(`\`${k}\` 선택지가 없습니다 — \`pnpm attrs:workout\` 를 먼저 돌리세요`);
    }
  }

  /*
    ⚠️ 근육맵 키와 `targetMuscle` 선택지를 대조한다 (D-223). 어긋나도 그림이
    **조용히 안 칠해질 뿐**이라 알아채기 어렵다
  */
  const muscleOpts = allowed.get("targetMuscle")!;
  const missing = MUSCLE_KEYS.filter((k) => !muscleOpts.has(k));
  if (missing.length > 0) {
    throw new Error(`근육맵 키가 선택지에 없습니다 — ${missing.join(", ")}`);
  }

  const bad: string[] = [];
  for (const s of SEED) {
    for (const m of s.muscles) {
      if (!muscleOpts.has(m)) bad.push(`${s.name}: targetMuscle=${m}`);
    }
    if (!allowed.get("equipmentType")!.has(s.equipment)) bad.push(`${s.name}: equipmentType=${s.equipment}`);
    if (!allowed.get("mechanic")!.has(s.mechanic)) bad.push(`${s.name}: mechanic=${s.mechanic}`);
    if (!allowed.get("forceType")!.has(s.force)) bad.push(`${s.name}: forceType=${s.force}`);
    if (s.muscles.length === 0) bad.push(`${s.name}: 자극부위 0개 — 근육맵이 칠할 것이 없다`);
  }
  if (bad.length > 0) {
    throw new Error(`선택지 밖 값 ${bad.length}건 — 넣지 않았습니다:\n  ${bad.join("\n  ")}`);
  }

  /*
    ⚠️ **목록 안의 이름 중복도 여기서 잡는다.** 정규화 후 같은 이름이 둘이면
    두 번째가 "이미 있는 운동"으로 조용히 건너뛰어져 **의도한 건수보다 적게**
    들어간다 — 그런데 로그는 정상으로 보인다
  */
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const s of SEED) {
    const key = normalizeExerciseName(s.name);
    const prev = seen.get(key);
    if (prev) dupes.push(`"${prev}" ↔ "${s.name}" (정규화: ${key})`);
    else seen.set(key, s.name);
  }
  if (dupes.length > 0) {
    throw new Error(`목록 안에 중복 ${dupes.length}건 — 넣지 않았습니다:\n  ${dupes.join("\n  ")}`);
  }
}

/**
 * 이미 있는 운동인지 본다 — **`insertExercise` 의 중복 규칙을 재구현하지 않는다.**
 *
 * ⚠️ 실패 메시지 문자열로 판정하면 그 문구가 바뀌는 순간 **진짜 실패가 "이미
 * 있음"으로 집계된다.** 정규화 함수를 같이 쓰고 조회만 여기서 한다.
 */
async function existing(categoryId: string, name: string): Promise<string | null> {
  const found = await prisma.codexItem.findFirst({
    where: { categoryId, normalizedKey: normalizeExerciseName(name) },
    select: { displayName: true },
  });
  return found?.displayName ?? null;
}

async function seedActorId(): Promise<string> {
  const admin = await prisma.adminUser.findFirst({
    where: { active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error("활성 어드민이 없습니다 — `pnpm tsx prisma/add-admin.ts` 로 먼저 만드세요");
  }
  return admin.id;
}

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);
  console.log(`목록 ${SEED.length}건 · 미검증(UNVERIFIED)으로 넣습니다 — A-05 검수 대기\n`);

  const category = await prisma.category.findUnique({
    where: { key: WORKOUT_CATEGORY },
    select: { id: true },
  });
  if (!category) {
    throw new Error("운동 카테고리가 없습니다 — `pnpm attrs:workout` 을 먼저 돌리세요");
  }

  await assertVocabulary();
  const actorId = await seedActorId();

  let created = 0;
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const s of SEED) {
    const dup = await existing(category.id, s.name);
    if (dup) {
      skipped.push(s.name);
      continue;
    }
    const res = await insertExercise({
      displayName: s.name,
      fields: {
        targetMuscles: s.muscles,
        equipmentType: s.equipment,
        mechanic: s.mechanic,
        forceType: s.force,
      },
      aliases: { ja: s.ja, en: s.en },
      /*
        ⚠️ **미검증이다.** 이 목록은 사람이 검증한 값이 아니다 (D-185·D-232).
        설명도 넣지 않는다 — 미검증 도감의 설명 자리는 원문 전용이다
        (`codex` FR-07-A-05)
      */
      verification: "UNVERIFIED",
      actorId,
    });
    if (res.ok) {
      created++;
      console.log(`  + ${s.name}`);
    } else {
      // ⚠️ 여기 오는 것은 **진짜 실패**다 (중복은 위에서 걸러졌다)
      failed.push(`${s.name} — ${res.error}`);
      console.log(`  ! ${s.name} — ${res.error}`);
    }
  }

  console.log(`\n신규 ${created}건 · 이미 있음 ${skipped.length}건 · 실패 ${failed.length}건`);
  if (skipped.length > 0) console.log(`  이미 있음: ${skipped.join(", ")}`);
  if (failed.length > 0) {
    console.log(`\n⚠️ 실패 ${failed.length}건 — 위 목록을 확인하세요`);
  }

  await report();
}

/**
 * 커버리지 리포트.
 *
 * ⚠️ **0건인 근육이 있으면 근육맵이 그 부위를 영원히 못 칠하는데 화면은 정상으로
 * 보인다.** 이 저장소가 반복해 겪은 실패 유형이다 — 그래서 세고 경고한다.
 */
async function report() {
  const rows = await prisma.exercise.findMany({
    select: { targetMuscles: true, equipmentType: true, mechanic: true, forceType: true },
  });
  console.log(`\n운동 마스터 총 ${rows.length}건`);

  const half = await prisma.codexItem.count({
    where: { category: { key: WORKOUT_CATEGORY }, exercise: null },
  });
  console.log(`반쪽 도감(\`Exercise\` 없음) ${half}건${half > 0 ? "  ⚠️ 도감 상세가 빈 배지를 띄웁니다" : ""}`);

  const noMuscle = rows.filter((r) => r.targetMuscles.length === 0).length;
  console.log(`자극부위 0개 ${noMuscle}건${noMuscle > 0 ? "  ⚠️ 근육맵이 칠할 것이 없습니다" : ""}`);

  console.log("\n부위별 (근육맵 14종):");
  const zero: string[] = [];
  for (const k of MUSCLE_KEYS) {
    const n = rows.filter((r) => r.targetMuscles.includes(k)).length;
    if (n === 0) zero.push(k);
    console.log(`  ${k.padEnd(12)} ${String(n).padStart(3)}${n === 0 ? "  ⚠️ 영원히 안 칠해집니다" : ""}`);
  }

  const group = (pick: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(pick(r) ?? "(없음)", (m.get(pick(r) ?? "(없음)") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log("\n기구별:");
  for (const [k, n] of group((r) => r.equipmentType)) console.log(`  ${k.padEnd(12)} ${String(n).padStart(3)}`);
  console.log("\n동작 유형 / 힘 방향:");
  for (const [k, n] of group((r) => r.mechanic)) console.log(`  ${k.padEnd(12)} ${String(n).padStart(3)}`);
  for (const [k, n] of group((r) => r.forceType)) console.log(`  ${k.padEnd(12)} ${String(n).padStart(3)}`);

  if (zero.length > 0) {
    console.log(`\n⚠️ 운동 0건인 부위 ${zero.length}종 — ${zero.join(", ")}`);
    console.log("   그 부위는 근육맵에서 영원히 칠해지지 않습니다. 목록에 추가하세요.");
  } else {
    console.log("\n근육맵 14종 전부 커버됨 ✓");
  }
  console.log("\n미검증으로 들어갔습니다 — A-05 검수 큐에서 확인하세요 (D-185).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
