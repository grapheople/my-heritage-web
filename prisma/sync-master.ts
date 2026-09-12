import "./env";
import { spawnSync } from "node:child_process";
import { describeDatabase } from "../src/lib/db-url";

/**
 * 마스터 데이터를 **한 방향으로** 옮긴다 (D-318). `diff-db.ts` 의 짝.
 *
 * ## ⚠️ 왜 사람이 export → import 를 손으로 치면 안 되는가
 * 두 스크립트는 **각자 `DATABASE_URL` 이 가리키는 DB** 를 본다. 그래서 순서를
 * 맞추는 것만으로는 부족하고 **매번 환경변수를 갈아끼워야** 한다. 실제로 그
 * 과정에서 `.env.local` 이 덮여 로컬 개발이 운영 DB 를 보게 된 적이 있다.
 * 방향을 한 단어(`--pull`/`--push`)로 고르게 하고, **URL 은 이 파일이 박는다.**
 *
 * ## ⚠️ 옮기는 것은 마스터뿐이다
 * 유저 데이터(방·아이템·일기)는 **옮기지 않는다.** 로컬의 시험 아이템이 운영에
 * 올라가면 남의 방에 나타나고 되돌릴 수 없다. 도감은 유저 등록으로 자동
 * 생성되므로(D-005) 운영에서 계속 늘어나는 것이 정상이고, 그래서 `--pull` 이
 * 주기적으로 필요하다.
 *
 * ## ⚠️ 이 명령이 **맞추지 못하는 층이 있다** (OI-118)
 * 종류(`CategorySubtype`)·카테고리속성(`CategoryAttribute`)·매칭키정의는 덤프
 * 경로가 없고 `setup-*.ts` 12 개에 흩어져 있다. 어드민 A-02 에서도 편집되므로
 * **운영에서 바뀌면 돌아올 길이 없다.** `db:diff` 가 어긋남을 보여주기는 한다.
 *
 * ```
 * pnpm db:diff                  # 먼저 무엇이 어긋났는지 본다
 * pnpm db:pull-master           # 운영 → 로컬  (안전. 로컬은 버려도 된다)
 * pnpm db:push-master --dry-run # 로컬 → 운영  ⚠️ 반드시 먼저 이걸로
 * pnpm db:push-master
 * ```
 */

const LOCAL_FALLBACK =
  "postgresql://heritage:heritage@localhost:5434/my_heritage?schema=public";

const argv = process.argv.slice(2);
const flag = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const PULL = argv.includes("--pull");
const PUSH = argv.includes("--push");
const DRY = argv.includes("--dry-run");

const LOCAL = flag("local") ?? process.env.LOCAL_DATABASE_URL ?? LOCAL_FALLBACK;
/**
 * ⚠️ **직접 연결(5432)** 을 쓴다. 도감 2,700건 upsert 는 길고, transaction 풀러는
 * 중간에 끊는다 — 실제로 운영 import 가 5초 상한에서 터진 적이 있다.
 */
const REMOTE =
  flag("remote") ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DIRECT_URL;

/**
 * 자식 프로세스를 **URL 을 박아서** 부른다.
 *
 * ⚠️ `DATABASE_URL` 과 `DIRECT_URL` 을 **둘 다** 넘긴다. 하나만 넘기면 나머지가
 * `.env.local` 에서 채워져 **읽기와 쓰기가 다른 DB 로 갈린다.**
 */
function run(script: string, args: string[], url: string) {
  const label = describeDatabase(url);
  console.log(`\n▶ ${script} ${args.join(" ")}  →  ${label}`);
  const res = spawnSync(
    "npx",
    ["tsx", `prisma/${script}`, ...args],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    },
  );
  if (res.status !== 0) {
    console.error(`\n❌ ${script} 실패 (종료코드 ${res.status}). 여기서 멈춘다.`);
    process.exit(res.status ?? 1);
  }
}

function main() {
  if (PULL === PUSH) {
    console.error(
      "사용법: pnpm tsx prisma/sync-master.ts (--pull | --push) [--dry-run]\n" +
        "  --pull  운영 → 로컬\n" +
        "  --push  로컬 → 운영",
    );
    process.exit(1);
  }
  if (!REMOTE) {
    console.error(
      "❌ 운영 DB URL 이 없다. POSTGRES_URL_NON_POOLING 을 설정하거나 --remote= 로 넘기세요.",
    );
    process.exit(1);
  }

  const from = PULL ? REMOTE : LOCAL;
  const to = PULL ? LOCAL : REMOTE;
  console.log();
  console.log(`  방향   ${PULL ? "운영 → 로컬" : "로컬 → 운영"}`);
  console.log(`  읽기   ${describeDatabase(from)}`);
  console.log(`  쓰기   ${describeDatabase(to)}${DRY ? "  (--dry-run — 쓰지 않는다)" : ""}`);

  /*
    ⚠️ **덤프 파일을 먼저 통째로 만든 뒤에 넣는다.** export 와 import 를 테이블마다
    번갈아 돌리면 중간에 실패했을 때 **어디까지 갔는지 알 수 없는 상태**가 된다.
    파일이 남으면 같은 파일로 다시 넣으면 된다 (import 는 멱등하다).
  */
  run("export-brands.ts", [], from);
  run("export-codex.ts", [], from);

  const dry = DRY ? ["--dry-run"] : [];
  /*
    ⚠️ **브랜드를 먼저 넣는다.** 도감의 노출 우선순위는 `Brand.displayOrder` 를
    복사한 값이고(`CodexItem.displayOrder`), 브랜드 스코프가 없으면 유저 화면의
    브랜드 선택에 나오지 않는다 (D-044).

    ⚠️ `--prune` 은 **쓰지 않는다.** 덤프에 없다는 이유로 상대 DB 의 브랜드를
    비활성화하면, 운영에서 방금 추가된 것이 로컬 덤프 한 번에 사라진다.
    덤프는 **덧붙이는 것**이지 상대 DB 의 진실이 아니다 (import-codex.ts 와 같은 태도).
  */
  run("import-brands.ts", ["prisma/brands.csv", ...dry], to);
  run("import-codex.ts", ["prisma/codex.json", ...dry], to);

  console.log("\n✅ 완료. `pnpm db:diff` 로 확인하세요.");
  if (PUSH && !DRY) {
    console.log(
      "   ⚠️ 덤프 파일(prisma/brands.csv · prisma/codex.json)이 바뀌었다 — 커밋할 것",
    );
  }
  console.log(
    "   ⚠️ 종류·카테고리속성·매칭키정의는 이 명령이 옮기지 않는다 (OI-118)\n",
  );
}

main();
