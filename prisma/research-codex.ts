import "./env";
import { categoryFields, matchingKeyFields } from "../src/lib/bot/fields";
import { researchCodexEntries } from "../src/lib/bot/claude";
import { categoryLabelKo } from "../src/lib/category-label";
import { insertCodex } from "../src/lib/codex-insert";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 도감 **브랜드별 대량 시딩** (D-185).
 *
 * ## ⚠️ 어드민 화면(A-04)과 같은 경로를 쓴다
 * `researchCodexEntries` → `insertCodex`. 스크립트 전용 저장 경로를 만들면
 * 브랜드 마스터 게이트·중복 판정·미검증 규칙이 갈린다 — 규칙이 갈리는 순간
 * "도감은 있는데 보유자 0명"이 조용히 생긴다.
 *
 * 화면은 한 브랜드씩 확인하며 넣는 용도고, 이 스크립트는 **브랜드 수십 개를
 * 훑는 용도**다. CLI 호출이 건당 수십 초라 80개 브랜드를 화면으로 넣을 수 없다.
 *
 * ## ⚠️ 등록되는 도감은 전부 `미검증`이다
 * 사람이 식별 값을 확인하지 않았다 (D-185). A-05 검수를 거쳐야 검증 배지가
 * 붙는다 — 여기서 `VERIFIED` 로 넣을 방법을 만들지 않는다.
 *
 * ## ⚠️ 프로덕션 DB 에 쓴다 — 대상을 먼저 출력한다
 * 로컬에서 돌지만 `DATABASE_URL` 이 Supabase 를 가리킨다 (D-117). 어디에 쓰는지
 * 보이지 않는 쓰기가 D-116 의 본질이었다. 카테고리 인자를 **필수**로 둔 것도
 * 같은 이유다 — 인자 없이 실행하면 아무것도 쓰지 않는다.
 *
 * ```
 * pnpm db:research-codex watch 5          # 시계 브랜드마다 5건
 * pnpm db:research-codex shoes 5 Nike     # 특정 브랜드만
 * ```
 */
/**
 * 카테고리별 기본 힌트.
 *
 * ⚠️ **"대표 제품"의 의미가 카테고리마다 다르다.** 신발의 스타일 코드는
 * **배색 단위**라(D-189) "대표 모델 5개"로는 하나의 코드로 특정되지 않는다 —
 * 실제로 Nike·Adidas 등 23개 브랜드가 빈 배열을 냈다 (D-188).
 *
 * ⚠️ 힌트로 **확실하지 않은 코드를 짜내게 만들지 않는다** (D-186). 배색을
 * 지정하라고만 말하고, 모르면 내지 말라는 규칙은 프롬프트에 그대로 둔다.
 *
 * ## ⚠️ **"대표 제품"은 카테고리를 지키지 않는다** (D-216)
 * 캠핑 223건 중 **19건이 의류·신발**이었다 — `Arc'teryx Alpha SV Jacket`,
 * `Patagonia Down Sweater Jacket`, `Merrell Trail Glove 7`. 옷·캠핑 **겸업
 * 브랜드가 10개**(Arc'teryx·Patagonia·Columbia·The North Face…)인데,
 * 그 브랜드에서 **가장 유명한 것은 옷이기 때문**이다.
 *
 * 즉 기본 힌트는 브랜드만 말하고 **무엇을 만드는 브랜드인지는 말하지 않는다.**
 * 겸업 브랜드에서 그 공백을 유명세가 메운다. **카테고리를 힌트에 박는다.**
 */
function defaultHint(
  categoryKey: string,
  perBrand: number,
  /** D-262 — 종류를 지정했으면 **그 종류만** 요청한다 */
  subtypeLabel?: string,
): string {
  /*
    ⚠️ **종류가 곧 힌트다 — 이게 없으면 조용히 오분류된다.**

    실제로 겪었다: `--subtype=sleeping-bag` 으로 돌렸는데 힌트는 "대표 캠핑
    장비" 였다. 모델이 Coleman **버너·쿨러·텐트**, Barebones **랜턴**,
    Arc'teryx **배낭**을 냈고 그것이 전부 **침낭으로 저장**됐다.

    화면상으로는 정상으로 보이는데 유저가 침낭을 등록하면 그 도감들과 만난다.
    D-216(겸업 브랜드가 카테고리를 넘어옴)의 **종류 층 재현**이다.

    ⚠️ **그 브랜드가 그 종류를 안 만들면 0건이 정답이다.** 50개 브랜드에
    같은 종류를 물으면 대부분은 안 만든다 — 억지로 채우면 지어낸 제품이 온다.
  */
  if (subtypeLabel) {
    return (
      `이 브랜드의 **${subtypeLabel}** 제품 ${perBrand}개. ` +
      `**${subtypeLabel} 가 아닌 것은 절대 내지 마세요** — 같은 브랜드의 다른 장비도 제외합니다. ` +
      `이 브랜드가 ${subtypeLabel} 를 만들지 않으면 **빈 배열**을 내세요. 0건이 정답일 수 있습니다`
    );
  }

  if (categoryKey === "shoes") {
    return `이 브랜드에서 가장 유명한 신발 ${perBrand}개. 스타일 코드는 배색 단위이므로 확실히 아는 대표 배색의 스타일 코드를 쓰고, 명칭에 배색 이름을 넣으세요`;
  }
  if (categoryKey === "camping") {
    // ⚠️ 제외를 명시한다 — 이 브랜드들의 대표 제품이 옷이라 안 막으면 옷이 온다
    return `이 브랜드의 대표 **캠핑·아웃도어 장비** ${perBrand}개 (텐트·타프·침낭·매트·버너·랜턴·의자/테이블·쿨러·배낭). **의류(재킷·플리스·팬츠)와 신발은 제외합니다** — 그것은 다른 카테고리입니다`;
  }
  if (categoryKey === "apparel") {
    /*
      ⚠️ D-195 의 입도를 그대로 옮긴다 — `model` 정식 값은 **제품 라인 + 모델명**
      이고 색상·사이즈는 뺀다. 안 적으면 `Nano Puff Jacket Black M` 같은 값이
      섞여 같은 옷의 도감이 갈린다 (D-188 이 신발에서 겪은 자리)
    */
    return `이 브랜드에서 가장 널리 알려진 **의류** ${perBrand}개. 모델명은 **제품 라인 + 모델명**까지만 쓰고 **색상·사이즈는 넣지 마세요** (예: \`Nano Puff Jacket\`, \`Tech Fleece Hoodie\`). 가방·신발·모자 같은 액세서리는 제외합니다`;
  }
  return `이 브랜드에서 가장 널리 알려진 대표 제품 ${perBrand}개`;
}

/** 동시 CLI 호출 수. 올리면 기기가 버겁고, 1이면 80개 브랜드가 2시간을 넘는다 */
const CONCURRENCY = 3;

type Outcome = {
  brand: string;
  found: number;
  created: number;
  dup: number;
  failed: string[];
  /**
   * ⚠️ **정제 단계에서 버린 후보의 사유.** 초판은 이것을 버렸다 — 신발 30개 중
   * 23개 브랜드가 0건인데 **왜인지 알 수 없었다.** 어드민 화면은 제외 목록을
   * 보여주는데(FR-04-A-08) 스크립트만 안 보여주면, 대량 시딩에서 프롬프트 문제와
   * 정상 동작(식별자가 없는 브랜드)을 구분할 수 없다.
   */
  dropped: string[];
};

async function seedBrand(
  categoryKey: string,
  categoryLabel: string,
  brand: string,
  perBrand: number,
  hint: string,
  /**
   * D-253 — 종류. `key` 는 프롬프트 필드 해석에, `id` 는 저장에 쓴다.
   * ⚠️ 둘이 같은 종류를 가리켜야 한다 — 갈리면 프롬프트가 본 속성과 저장되는
   * 스코프가 어긋난다
   */
  subtype: { key: string; id: string } | null,
): Promise<Outcome> {
  const out: Outcome = { brand, found: 0, created: 0, dup: 0, failed: [], dropped: [] };

  const fields = await categoryFields(categoryKey, subtype?.key);
  let r;
  try {
    r = await researchCodexEntries({
      fields,
      categoryKey,
      categoryLabel,
      brand,
      // ⚠️ 힌트를 비우지 않는다. 비우면 모델이 희귀·한정판을 고르는 경향이 있고,
      // 그런 제품은 확실도가 낮아 제외되거나 도감에 아무도 안 붙는다
      hint,
      count: perBrand,
    });
  } catch (e) {
    // 한 브랜드의 실패가 전체를 멈추지 않는다 — 80개를 도는 작업이다
    out.failed.push(`조사 실패 — ${(e as Error).message}`);
    return out;
  }
  out.found = r.candidates.length;
  out.dropped = r.dropped;

  for (const c of r.candidates) {
    const res = await insertCodex({
      categoryKey,
      // ⚠️ 비우면 카테고리 스코프에 들어가 종류 스코프 아이템과 안 만난다
      subtypeId: subtype?.id ?? null,
      displayName: c.displayName,
      keyValues: c.keyValues,
      // ⚠️ 사람이 확인하지 않았다 (D-185). A-05 검수 대기 상태로 들어간다
      verification: "UNVERIFIED",
      actorId: "research-seed",
    });
    if (res.ok) out.created++;
    else if (res.error.startsWith("이미 있는 도감")) out.dup++;
    else out.failed.push(`${c.displayName} — ${res.error}`);
  }
  return out;
}

async function main() {
  /*
    D-253 — 종류는 **명명 플래그**로 받는다. 위치 인자가 이미 4개라 5번째로
    넣으면 브랜드·힌트와 섞인다.
  */
  const argv = process.argv.slice(2);
  const subtypeKey =
    argv.find((a) => a.startsWith("--subtype="))?.slice("--subtype=".length) || undefined;
  const [categoryKey, perBrandArg, onlyBrand, hintArg] = argv.filter((a) => !a.startsWith("--"));
  if (!categoryKey) {
    console.log("사용법: pnpm db:research-codex <카테고리> [브랜드당 건수] [브랜드명] [힌트] [--subtype=키]");
    console.log("예시:   pnpm db:research-codex watch 5");
    console.log("        pnpm db:research-codex bicycle 5 Shimano --subtype=drivetrain");
    return;
  }
  const perBrand = Math.min(Math.max(Number(perBrandArg) || 5, 1), 10);
  /*
    ⚠️ **브랜드를 쉼표로 여러 개 받는다.** 실행 환경에 10분 상한이 있어서
    50개 브랜드를 한 번에 돌리면 중간에 잘린다 — 실제로 데스크테리어가 11개에서
    끊겼다. 배치로 나눠 돌리고, 중복은 `insertCodex` 가 막으므로 겹쳐도 안전하다.
  */
  const picked = (onlyBrand ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  /*
    ⚠️ 힌트를 인자로 받는다. 카테고리마다 "대표 제품"의 의미가 다르다 —
    스니커의 스타일 코드는 **컬러웨이 단위**라(`CW2288-111` = AF1 '07 White)
    "대표 모델"로는 특정되지 않고 모델이 빈 배열을 낸다.
    ⚠️ 다만 힌트로 **확실하지 않은 코드를 짜내게 만들면 안 된다** (D-186) —
    조사 결과는 사람이 표본 확인한 뒤 받아들인다.
  */
  // ⚠️ 종류 라벨은 아래에서 해석된다 — 힌트 조립을 그 뒤로 미룬다 (D-262)

  const url = migrationDatabaseUrl();
  // ⚠️ 비밀번호를 출력하지 않는다 (D-116)
  console.log(`대상 DB — ${describeDatabase(url)}`);

  const fields = await categoryFields(categoryKey);
  if (fields.length === 0) {
    console.log(`⚠️ 카테고리 '${categoryKey}' 에 속성 조합이 없습니다 (A-02)`);
    return;
  }
  const parts = matchingKeyFields(fields);
  if (parts.length === 0) {
    console.log(`⚠️ 카테고리 '${categoryKey}' 의 매칭 키가 없습니다 (A-03)`);
    return;
  }
  const categoryLabel = await categoryLabelKo(categoryKey);

  /*
    ⚠️ **종류가 필수인 카테고리에서 종류 없이 돌리면 막는다** (D-253·D-257).
    카테고리 스코프에 도감이 생기는데 유저 아이템은 전부 종류 스코프라
    **영원히 만나지 않는다** — 조사 비용만 쓰고 연결이 0 이 된다.
  */
  const cat = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: { id: true, subtypeRequired: true },
  });
  if (cat?.subtypeRequired && !subtypeKey) {
    const list = await prisma.categorySubtype.findMany({
      where: { categoryId: cat.id, active: true },
      orderBy: { displayOrder: "asc" },
      select: { key: true, labelKo: true },
    });
    console.log(`⚠️ '${categoryKey}' 는 종류가 필수입니다 — --subtype= 을 지정하세요`);
    console.log(`   ${list.map((x) => `${x.key}(${x.labelKo})`).join(" · ")}`);
    return;
  }

  let subtypeLabel = "";
  let subtype: { key: string; id: string } | null = null;
  if (subtypeKey) {
    const st = await prisma.categorySubtype.findUnique({
      where: { categoryId_key: { categoryId: cat!.id, key: subtypeKey } },
      select: { id: true, labelKo: true, active: true },
    });
    if (!st) {
      console.log(`⚠️ '${categoryKey}' 에 '${subtypeKey}' 종류가 없습니다`);
      return;
    }
    if (!st.active) {
      console.log(`⚠️ '${subtypeKey}' 는 비활성 종류입니다 — 신규 도감을 넣지 않습니다`);
      return;
    }
    subtypeLabel = st.labelKo;
    subtype = { key: subtypeKey, id: st.id };
  }

  const hint = hintArg || defaultHint(categoryKey, perBrand, subtypeLabel || undefined);

  console.log(
    `${categoryLabel}(${categoryKey})${subtypeLabel ? ` · ${subtypeLabel}(${subtypeKey})` : ""}` +
      ` · 키=[${parts.map((p) => p.key).join("+")}] · 브랜드당 ${perBrand}건`,
  );

  /*
    ⚠️ **브랜드 마스터에서 가져온다.** 목록을 스크립트에 박으면 A-11 에서
    브랜드를 추가해도 시딩이 따라오지 않고, `insertCodex` 의 마스터 게이트에
    전부 막힌다 (FR-04-A-09).
  */
  const brands = await prisma.brand.findMany({
    where: {
      active: true,
      // D-255 — 공통·종류 연결 어느 쪽이든 이 카테고리에 붙어 있으면 대상이다
      scopes: { some: { category: { key: categoryKey } } },
      ...(picked.length ? { name: { in: picked, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  if (brands.length === 0) {
    console.log("⚠️ 이 카테고리에 연결된 활성 브랜드가 없습니다 (A-11)");
    return;
  }
  console.log(`브랜드 ${brands.length}개 — 최대 ${brands.length * perBrand}건 시도\n`);

  const results: Outcome[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < brands.length) {
      const i = cursor++;
      const name = brands[i].name;
      const o = await seedBrand(categoryKey, categoryLabel, name, perBrand, hint, subtype);
      results.push(o);
      const tail =
        (o.dropped.length ? ` · 제외 ${o.dropped.length}` : "") +
        (o.failed.length ? ` · 실패 ${o.failed.length}` : "");
      console.log(
        `[${results.length}/${brands.length}] ${name} — 후보 ${o.found} · 등록 ${o.created} · 중복 ${o.dup}${tail}`,
      );
      // 제외 사유를 남긴다 — 0건이 정상인지 프롬프트 문제인지 구분하는 유일한 단서
      for (const d of o.dropped) console.log(`      · 제외 ${d}`);
      for (const f of o.failed) console.log(`      ✗ ${f}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const created = results.reduce((n, r) => n + r.created, 0);
  const dup = results.reduce((n, r) => n + r.dup, 0);
  const failed = results.reduce((n, r) => n + r.failed.length, 0);
  /*
    ⚠️ **조사 실패와 "후보 0건"을 섞지 않는다.** 초판은 둘 다 `후보 0건 브랜드`
    로 보고했다 — CLI 가 죽은 브랜드가 "이 브랜드는 식별자를 공개하지 않는다"로
    읽혔다. 캠핑에서 The North Face·YETI·Tent-Mark Designs 3개가 그렇게 묻혔다.
    앞은 **재시도 대상**이고 뒤는 **정상 동작**이다 — 성질이 정반대다.
  */
  const errored = results.filter((r) => r.failed.some((f) => f.startsWith("조사 실패")));
  const empty = results
    .filter((r) => r.found === 0 && !errored.includes(r))
    .map((r) => r.brand);

  console.log(`\n=== ${categoryLabel} 완료 ===`);
  console.log(`등록 ${created}건 (미검증) · 중복 ${dup}건 · 실패 ${failed}건`);
  if (empty.length) {
    // ⚠️ 0건은 실패가 아니다 — 확실한 후보가 없었다는 뜻이고 그것이 정상이다 (D-185)
    console.log(`후보 0건 브랜드 ${empty.length}개 (정상): ${empty.join(", ")}`);
  }
  if (errored.length) {
    // 재시도하면 결과가 달라진다 — 위 목록과 성질이 다르다
    console.log(
      `⚠️ 조사 실패 ${errored.length}개 — **재시도 대상**: ${errored.map((r) => r.brand).join(", ")}`,
    );
  }
  const total = await prisma.codexItem.count({
    where: { category: { key: categoryKey }, mergedIntoId: null },
  });
  console.log(`현재 ${categoryLabel} 도감 ${total}건`);
  console.log(`검수: /admin/codex/verification (A-05)`);
}

main().then(() => process.exit(0));
