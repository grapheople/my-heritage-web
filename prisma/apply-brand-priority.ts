import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildBrandIndex, inferCodexBrand } from "../src/lib/codex-brand";
import { normalizeBrandToken } from "../src/lib/brand-search";

/**
 * 브랜드 **노출 우선순위**를 지정하고 도감에 복사한다 (D-285).
 *
 * ## ⚠️ 이 목록은 **판단**이지 데이터가 아니다
 * "유명한 브랜드" 를 자동으로 계산할 신호가 없다 — 도감 수는 **수집 순서**에
 * 좌우되고 보유자 수는 아직 0 에 가깝다. 그래서 PM 합의로 **카테고리별 대표
 * 브랜드를 명시**한다.
 *
 * ⚠️ **이 파일이 그 목록의 단일 출처다.** 어드민에서 개별 값을 고칠 수 있지만,
 * 스크립트를 다시 돌리면 **여기 적힌 값으로 되돌아간다** — 목록을 바꾸려면
 * 이 파일을 고친다.
 *
 * ## 값의 뜻 — **높을수록 앞**, 0 이 기본
 * | 값 | 뜻 |
 * |---|---|
 * | `100` | 그 카테고리를 대표하는 이름. 목록 맨 위 |
 * | `50` | 널리 알려진 이름 |
 * | `0` | 지정 안 됨 — 명칭 사전순으로 뒤에 붙는다 |
 *
 * ⚠️ **방향이 "높을수록 앞" 인 것이 의도다** — 기본값 0 이 자연히 맨 뒤로
 * 간다. "낮을수록 앞" 으로 두면 0 이 가장 작아 **맨 앞**에 온다.
 *
 * ⚠️ **검색 랭킹을 이기지 않는다.** 정확 일치 우선(OI-54)이 먼저다 — 우선순위는
 * 같은 랭크 안의 동점을 가르는 값이다. `gs` 를 치면 `Grand Seiko` 가 먼저다.
 *
 * ## ⚠️ 도감은 **복사본**이다
 * `CodexItem` 에는 브랜드 링크가 없어 브랜드를 **추정해서** `displayOrder` 를
 * 복사한다. 조회 때마다 조인할 수 없기 때문이다.
 *
 * ### ⚠️ 매칭 키 첫 세그먼트만으로는 부족하다
 * 시계는 매칭 키가 `["uniqueId"]` 하나여서 키가 `wbp201a.ba0632` 다 — **브랜드
 * 토큰이 아예 없다.** 첫판은 그것만 봐서 **시계·신발 도감이 전부 0** 이었다.
 *
 * 그래서 **두 단계로 찾는다**:
 * 1. 매칭 키 첫 세그먼트 (캠핑·자전거처럼 `brand` 가 키에 있는 카테고리)
 * 2. **명칭 앞부분** — `TAG Heuer Aquaracer…` 의 `TAG Heuer`
 *
 * ⚠️ **긴 이름이 이긴다.** `Grand Seiko` 를 `Seiko` 로 잡으면 안 된다 — 후보를
 * 길이 내림차순으로 훑는다.
 *
 * ⚠️ **후보는 "우선순위가 있는 브랜드" 가 아니라 그 카테고리의 브랜드 전부**다.
 * 우선순위 있는 것만 후보로 두면 **긴 이름이 짧은 이름을 가려주지 못한다** —
 * 실제로 `Yeti Cycles`(자전거, 우선순위 없음) 도감이 `YETI`(캠핑, 100)로
 * 잘못 잡혔다. 전부를 후보에 넣고 **매칭된 브랜드의 우선순위**를 가져온다.
 *
 * ⚠️ **같은 카테고리 브랜드만 본다.** 카테고리를 넘나들며 접두를 맞추면
 * `YETI`↔`Yeti Cycles` 같은 사고가 또 난다.
 *
 * 브랜드 값을 바꾸면 **이 스크립트를 다시 돌려야** 도감에 반영된다 — 안 돌려도
 * 정렬만 옛 값일 뿐 기능은 멀쩡하다.
 *
 * ```
 * pnpm tsx prisma/apply-brand-priority.ts          # 미리보기
 * pnpm tsx prisma/apply-brand-priority.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");
const SEP = String.fromCharCode(31);

/** 카테고리 대표 (100) — 그 분야를 모르는 사람도 아는 이름 */
const TIER1: Record<string, string[]> = {
  watch: ["Rolex", "Omega", "Seiko", "Grand Seiko", "Casio", "G-SHOCK", "Cartier", "TAG Heuer", "Tudor", "IWC"],
  shoes: ["Nike", "Adidas", "New Balance", "Converse", "Vans", "Asics", "Dr. Martens", "Birkenstock"],
  apparel: ["Uniqlo", "Nike", "Adidas", "The North Face", "Patagonia", "Arc'teryx", "Carhartt", "Levi's"],
  bicycle: ["Shimano", "Trek", "Specialized", "Giant", "SRAM", "Brompton", "Cannondale", "Bianchi"],
  camping: ["Snow Peak", "Coleman", "Helinox", "Kovea", "MSR", "Jetboil", "Nordisk", "YETI"],
  hiking: ["Arc'teryx", "Osprey", "Gregory", "Deuter", "Mammut"],
  deskterior: ["Apple", "Logitech", "Samsung", "LG", "Herman Miller", "Dell", "Keychron"],
};

/** 널리 알려진 이름 (50) */
const TIER2: Record<string, string[]> = {
  watch: ["Longines", "Breitling", "Panerai", "Citizen", "Orient", "Hamilton", "Tissot", "Oris", "Sinn", "Nomos Glashütte", "Zenith", "Patek Philippe", "Audemars Piguet", "Jaeger-LeCoultre"],
  shoes: ["Puma", "Reebok", "Salomon", "Hoka", "On", "Timberland", "Red Wing", "Crocs", "Onitsuka Tiger", "Mizuno"],
  apparel: ["Ralph Lauren", "Lacoste", "Champion", "Burberry", "Stone Island", "Montbell", "Snow Peak", "Gucci", "Prada", "Louis Vuitton", "Muji", "Gap", "Zara", "H&M", "Descente", "Goldwin"],
  bicycle: ["Pinarello", "Colnago", "Canyon", "Cervélo", "Scott", "Merida", "Santa Cruz", "Campagnolo", "Maxxis", "Continental", "Bontrager", "Zipp", "DT Swiss", "Brooks", "Fizik"],
  camping: ["DOD", "Logos", "Captain Stag", "Iwatani", "SOTO", "Primus", "Big Agnes", "Nemo", "Therm-a-Rest", "Stanley", "Hydro Flask", "Hilleberg", "Sea to Summit", "Montbell"],
  hiking: ["Fjällräven", "Patagonia", "Hyperlite Mountain Gear", "Zpacks"],
  deskterior: ["Anker", "Razer", "SteelSeries", "Belkin", "BenQ", "Steelcase", "HHKB", "Realforce", "Leopold", "Satechi", "Elgato"],
};

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  /*
    ⚠️ 같은 브랜드가 여러 카테고리에 있으면 **가장 높은 순위(가장 큰 값)** 를
    쓴다. `Nike` 는 신발·의류 양쪽 대표이고, `Patagonia` 는 등산에서는 2단계
    의류에서는 1단계다 — 낮은 쪽이 이긴다
  */
  const want = new Map<string, number>();
  for (const [tier, table] of [[100, TIER1], [50, TIER2]] as const) {
    for (const names of Object.values(table)) {
      for (const n of names) {
        const cur = want.get(n);
        // ⚠️ **큰 값이 이긴다** — `Patagonia` 는 등산 2단계·의류 1단계다
        if (cur === undefined || tier > cur) want.set(n, tier);
      }
    }
  }

  // ⚠️ **DB 에 없는 이름을 조용히 넘기지 않는다** — 오타면 우선순위가 안 붙는다
  const all = await prisma.brand.findMany({ select: { id: true, name: true, displayOrder: true } });
  const byName = new Map(all.map((b) => [b.name, b]));
  const missing = [...want.keys()].filter((n) => !byName.has(n));
  if (missing.length) {
    console.log(`⚠️ DB 에 없는 이름 ${missing.length}건 — 오타이거나 아직 없는 브랜드다`);
    for (const m of missing) console.log(`   · ${m}`);
    console.log("");
  }

  let changed = 0;
  for (const b of all) {
    const next = want.get(b.name) ?? 0;
    if (b.displayOrder === next) continue;
    if (APPLY) await prisma.brand.update({ where: { id: b.id }, data: { displayOrder: next } });
    changed++;
  }
  const t1 = [...want.values()].filter((v) => v === 100).length;
  const t2 = [...want.values()].filter((v) => v === 50).length;
  console.log(`브랜드 ${all.length}개 · 1단계 ${t1} · 2단계 ${t2} · ${APPLY ? "변경" : "변경할 것"} ${changed}건`);

  // ── 도감에 복사 ──
  const codex = await prisma.codexItem.findMany({
    select: {
      id: true,
      displayName: true,
      normalizedKey: true,
      displayOrder: true,
      category: { select: { key: true } },
    },
  });
  const tokenOrder = new Map<string, number>();
  for (const b of all) {
    const v = want.get(b.name) ?? 0;
    if (v > 0) tokenOrder.set(normalizeBrandToken(b.name), v);
  }
  /*
    ⚠️ 브랜드 추정 규칙은 **`lib/codex-brand.ts` 하나**에 있다 (D-289).
    A-11 의 "연결 도감 수" 도 같은 함수를 쓴다 — 여기에 복사해 두면 한쪽만
    고쳐져 조용히 갈린다
  */
  const scopes = await prisma.brandScope.findMany({
    select: { category: { select: { key: true } }, brand: { select: { name: true } } },
  });
  const brandIndex = buildBrandIndex(
    scopes.map((sc) => ({ categoryKey: sc.category.key, brandName: sc.brand.name })),
  );

  let copied = 0;
  let viaKey = 0;
  let viaName = 0;
  let unmatched = 0;

  for (const c of codex) {
    const brandName = inferCodexBrand(
      {
        normalizedKey: c.normalizedKey,
        displayName: c.displayName,
        categoryKey: c.category.key,
      },
      brandIndex,
    );
    // ⚠️ **매칭된 브랜드의 우선순위**를 가져온다 — 0 이면 0 이다
    const next = brandName ? (want.get(brandName) ?? 0) : 0;

    // 집계만 — 어느 경로로 찾았는지 로그에 남긴다
    if (next > 0) {
      if (tokenOrder.has(c.normalizedKey.split(SEP)[0])) viaKey++;
      else viaName++;
    } else {
      unmatched++;
    }

    if (c.displayOrder === next) continue;
    if (APPLY) await prisma.codexItem.update({ where: { id: c.id }, data: { displayOrder: next } });
    copied++;
  }
  console.log(
    `도감 ${codex.length}건 · ${APPLY ? "복사" : "복사할 것"} ${copied}건` +
      ` (매칭키 ${viaKey} · 명칭 ${viaName}) · 우선순위 없음 ${unmatched}건`,
  );

  if (APPLY) {
    const top = await prisma.brand.findMany({
      where: { displayOrder: { gt: 0 } },
      select: { name: true, displayOrder: true },
      orderBy: [{ displayOrder: "desc" }, { name: "asc" }],
      take: 12,
    });
    console.log(`\n검산 — 상위 12개: ${top.map((t) => `${t.name}(${t.displayOrder})`).join(" · ")}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
