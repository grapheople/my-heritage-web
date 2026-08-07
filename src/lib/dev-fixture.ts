import type { FeedItem } from "@/components/domain/feed-card";
import type { ItemThumbData } from "@/components/domain/item-thumb";
import type { CurrencyCode } from "@/lib/format";
import type { RoomSection } from "@/components/domain/room-display";

/**
 * ⚠️ **개발용 고정 데이터.** 디자인 시스템을 브라우저에서 검증하기 위한 것이고
 * 제품 데이터가 아니다.
 *
 * 인증(D-021·D-092)이 아직 없어 "본인 방"을 조회할 수 없다. 인증이 붙으면
 * 이 파일을 지우고 Prisma 조회로 바꾼다 — 화면 코드는 그대로 둘 수 있게
 * `ItemThumbData` 형태로만 노출한다.
 *
 * 아이템 명칭은 **저장하지 않는 파생값**이므로(D-073, M-14) 여기서도 이미
 * 파생된 문자열로 둔다. `brand + model` 조립 규칙은 실제 조회 계층의 몫이다.
 */

function make(
  prefix: string,
  names: string[],
  marks: { sale?: number[]; priv?: number[] } = {},
): ItemThumbData[] {
  return names.map((name, i) => ({
    id: `${prefix}-${i + 1}`,
    name,
    // 사진은 비워 둔다 — ItemThumb이 id 기반 결정적 그라디언트로 대체한다.
    // 외부 이미지 호스트에 의존하지 않기 위해서다
    onSale: marks.sale?.includes(i),
    isPrivate: marks.priv?.includes(i),
  }));
}

const WATCH = [
  "Rolex Submariner 116610LN", "Omega Speedmaster 3570.50", "Seiko SKX007",
  "Tudor Black Bay 58", "Grand Seiko SBGA211", "Cartier Santos WSSA0018",
  "IWC Mark XVIII", "Longines Spirit 40", "Oris Aquis Date",
  "Hamilton Khaki Field Mechanical", "Sinn 556 A", "Nomos Tangente 38",
  "Zenith Chronomaster Sport", "Breitling Navitimer B01", "Panerai Luminor Due",
  "Tag Heuer Carrera 39", "Casio Oceanus OCW-S400", "Citizen Series 8 831",
];
const CAMP = [
  "Snow Peak Land Station M", "YETI Tundra 45", "MSR WhisperLite Universal",
  "Helinox Chair One", "Coleman 413H", "Nordisk Asgard 12.6",
  "Trangia Storm Cooker 25", "Petromax HK500", "Zippo Hand Warmer",
];
const SHOES = [
  "Nike Air Max 1 Patta", "New Balance 990v6", "Adidas Samba OG",
  "Alden 405 Indy Boot", "Paraboot Michael", "Common Projects Achilles",
];
const DESK = ["HHKB Professional HYBRID", "Grovemade Desk Shelf", "BenQ ScreenBar Halo"];

/** 카테고리 섹션 — **개수 내림차순** (D-075). 순서 자체가 규칙이다 */
export const DEV_ROOM_SECTIONS = [
  { categoryKey: "category.watch", slug: "watch",
    items: make("w", WATCH, { sale: [0, 12], priv: [4, 8, 15] }) },
  { categoryKey: "category.camping", slug: "camping",
    items: make("c", CAMP, { sale: [1] }) },
  { categoryKey: "category.shoes", slug: "shoes",
    items: make("s", SHOES, { priv: [3] }) },
  { categoryKey: "category.deskterior", slug: "deskterior",
    items: make("d", DESK) },
] as const;

/** 떠난 아이템 — 카테고리 진열·개수 집계에서 제외된다 (D-023, FR-01-A-07) */
export const DEV_GONE_ITEMS = make("g", [
  "Rolex Explorer I 214270", "Seiko SARB033", "Snow Peak Takibi Fire & Grill",
]);

export const DEV_PROFILE = {
  roomName: "시계쟁이 준",
  bio: "빈티지 다이버만 모읍니다. 서울 · 2019년부터.",
  level: 6,
};

/* ─────────────────────────────────────────────────────────────
   S-01 NEW 피드 · S-03 타인 방
   ───────────────────────────────────────────────────────────── */


/** 소유자 언어 설정 — 언어권 필터의 기준이다 (FR-03-B-02, D-027) */
export type OwnerLang = "ko" | "ja" | "en";

export type DevRoom = {
  id: string;
  name: string;
  bio?: string;
  level: number;
  lang: OwnerLang;
  /** 방 공개 상태 — 비공개면 소유자만 볼 수 있다 (D-019, FR-01-B-05) */
  isPublic: boolean;
  sections: RoomSection[];
  gone: ItemThumbData[];
};

export const DEV_ROOMS: DevRoom[] = [
  {
    id: "r-jun", name: "시계쟁이 준",
    bio: "빈티지 다이버만 모읍니다. 서울 · 2019년부터.",
    level: 6, lang: "ko", isPublic: true,
    sections: DEV_ROOM_SECTIONS.map((s) => ({ ...s, items: [...s.items] })),
    gone: DEV_GONE_ITEMS,
  },
  {
    id: "r-tokyo", name: "tokyo_wrist",
    bio: "国産時計とキャンプ道具。",
    level: 9, lang: "ja", isPublic: true,
    sections: [
      { categoryKey: "category.watch", slug: "watch",
        items: make("t", ["Seiko SBDC101","Citizen NB6021","Casio MRG-B5000",
          "Grand Seiko SBGW231","Orient Bambino V4"], { sale: [2] }) },
      { categoryKey: "category.camping", slug: "camping",
        items: make("tc", ["Snow Peak Amenity Dome M","SOTO Regulator Stove"]) },
    ],
    gone: [],
  },
  {
    id: "r-mel", name: "mel.collects",
    bio: "Sneakers and desk gear. Melbourne.",
    level: 4, lang: "en", isPublic: true,
    sections: [
      { categoryKey: "category.shoes", slug: "shoes",
        items: make("m", ["Nike Dunk Low Panda","Asics Gel-Kayano 14",
          "Salomon XT-6"], { sale: [1] }) },
      { categoryKey: "category.deskterior", slug: "deskterior",
        items: make("md", ["Keychron Q1 Pro","Balolo Setup Cockpit"]) },
    ],
    gone: [],
  },
  {
    id: "r-secret", name: "비공개 컬렉터",
    level: 3, lang: "ko", isPublic: false,
    sections: [], gone: [],
  },
];

export function findRoom(id: string): DevRoom | undefined {
  return DEV_ROOMS.find((r) => r.id === id);
}

/**
 * NEW 피드 — 아이템 등록 시각 역순 (FR-03-A-01, D-070).
 * 픽스처에는 시각이 없으므로 배열 순서를 등록순으로 보고 뒤집는다.
 *
 * 비공개 방·비공개 아이템은 **애초에 들어가지 않는다** (FR-03-A-04, D-019).
 */
export const DEV_FEED: (FeedItem & { lang: OwnerLang })[] = DEV_ROOMS
  .filter((r) => r.isPublic)
  .flatMap((r) =>
    r.sections.flatMap((s) =>
      s.items
        .filter((i) => !i.isPrivate)
        .map((i) => ({
          id: i.id, name: i.name, categoryKey: s.categoryKey,
          roomId: r.id, roomName: r.name, onSale: i.onSale, lang: r.lang,
        })),
    ),
  )
  .reverse();

/* ─────────────────────────────────────────────────────────────
   S-09 마켓 · S-08 검색
   ───────────────────────────────────────────────────────────── */

export type MarketListing = {
  id: string;
  name: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
  price: number;
  currency: CurrencyCode;
};

/** 소유자 언어 → 판매자 지정 통화. 환산하지 않는다 (D-011) */
const CURRENCY_BY_LANG: Record<OwnerLang, CurrencyCode> = {
  ko: "KRW", ja: "JPY", en: "USD",
};

const PRICE_BY_CURRENCY: Record<CurrencyCode, number[]> = {
  KRW: [12_400_000, 890_000, 2_150_000],
  JPY: [148_000, 62_000],
  USD: [1_240, 320],
};

/**
 * 마켓 매물 — 판매중 + 공개 아이템만 (FR-02-A-01·02).
 * 기본 정렬은 판매 전환 시각 역순 (FR-02-A-03). 픽스처에는 시각이 없어
 * 배열 순서를 전환순으로 보고 뒤집는다.
 */
export const DEV_MARKET: MarketListing[] = DEV_ROOMS
  .filter((r) => r.isPublic)
  .flatMap((r) => {
    const currency = CURRENCY_BY_LANG[r.lang];
    const prices = PRICE_BY_CURRENCY[currency];
    let n = 0;
    return r.sections.flatMap((s) =>
      s.items
        .filter((i) => i.onSale && !i.isPrivate)
        .map((i) => ({
          id: i.id, name: i.name, categoryKey: s.categoryKey,
          roomId: r.id, roomName: r.name,
          currency, price: prices[n++ % prices.length],
        })),
    );
  })
  .reverse();

/* ── 검색 (S-08) ── */

export type CodexEntry = {
  id: string;
  /** 원문 1개 고정. 번역하지 않는다 (D-009) */
  displayName: string;
  categoryKey: string;
  uniqueId: string;
  verified: boolean;
  ownerCount: number;
  /** 언어별 검색용 별칭. 화면에 표시하지 않고 매칭에만 쓴다 (D-009·D-043) */
  aliases: string[];
};

export const DEV_CODEX: CodexEntry[] = [
  { id: "cx-116610", displayName: "Rolex Submariner Date 116610LN",
    categoryKey: "category.watch", uniqueId: "116610LN", verified: true,
    ownerCount: 128, aliases: ["롤렉스 서브마리너", "ロレックス サブマリーナ", "sub date"] },
  { id: "cx-3570", displayName: "Omega Speedmaster Professional 3570.50",
    categoryKey: "category.watch", uniqueId: "3570.50", verified: true,
    ownerCount: 74, aliases: ["오메가 스피드마스터", "オメガ スピードマスター", "moonwatch"] },
  { id: "cx-skx007", displayName: "Seiko SKX007",
    categoryKey: "category.watch", uniqueId: "SKX007", verified: false,
    ownerCount: 213, aliases: ["세이코 SKX", "セイコー SKX"] },
  { id: "cx-tundra45", displayName: "YETI Tundra 45",
    categoryKey: "category.camping", uniqueId: "TUNDRA45", verified: true,
    ownerCount: 41, aliases: ["예티 툰드라", "イエティ タンドラ"] },
  { id: "cx-dunklow", displayName: "Nike Dunk Low Retro White Black",
    categoryKey: "category.shoes", uniqueId: "DD1391-100", verified: true,
    ownerCount: 96, aliases: ["나이키 덩크 로우 판다", "ナイキ ダンク ロー", "panda dunk"] },
];

/* ─────────────────────────────────────────────────────────────
   S-10 도감 상세
   ───────────────────────────────────────────────────────────── */

export type CodexAttr = { labelKey: string; value: string };

/** 도감 속성값. 비어 있으면 렌더하지 않는다 (E-07-06) */
export const DEV_CODEX_ATTRS: Record<string, CodexAttr[]> = {
  "cx-116610": [
    { labelKey: "attr.brand", value: "Rolex" },
    { labelKey: "attr.movement", value: "Automatic" },
    { labelKey: "attr.caseSize", value: "40mm" },
    { labelKey: "attr.year", value: "2010–2020" },
  ],
  "cx-3570": [
    { labelKey: "attr.brand", value: "Omega" },
    { labelKey: "attr.movement", value: "Manual" },
    { labelKey: "attr.caseSize", value: "42mm" },
  ],
  "cx-skx007": [{ labelKey: "attr.brand", value: "Seiko" }],
  "cx-tundra45": [{ labelKey: "attr.brand", value: "YETI" }],
  "cx-dunklow": [{ labelKey: "attr.brand", value: "Nike" }],
};

/**
 * 도감 설명.
 *
 * ⚠️ **검증 상태에 따라 번역 여부가 갈린다.**
 * - **검증된 도감**: 운영자가 ko/ja/en 3개를 입력한다 (D-010, D-030)
 * - **미검증 도감**: 유저가 쓴 원문 1개. **번역하지 않고 그대로 표시**
 *   (FR-07-A-05, `policies/i18n` Case 1)
 *
 * 미검증인데 번역하면 운영자가 검수하지 않은 내용을 서비스가 보증하는 것처럼
 * 보인다. 그래서 원문으로 둔다.
 */
export type CodexDesc =
  | { kind: "verified"; text: Partial<Record<OwnerLang, string>> }
  | { kind: "original"; text: string };

export const DEV_CODEX_DESC: Record<string, CodexDesc> = {
  "cx-116610": {
    kind: "verified",
    text: {
      ko: "세라믹 베젤을 처음 적용한 서브마리너 데이트. 2010년 발매, 2020년 단산.",
      ja: "セラミックベゼルを初採用したサブマリーナ デイト。2010年発売、2020年生産終了。",
      en: "The first Submariner Date with a ceramic bezel. Released 2010, discontinued 2020.",
    },
  },
  "cx-3570": {
    kind: "verified",
    text: {
      ko: "달에 간 시계. 수동 무브먼트 1861 탑재.",
      ja: "月に行った時計。手巻きムーブメント1861搭載。",
      en: "The watch that went to the Moon. Manual-wind caliber 1861.",
    },
  },
  // 미검증 — 유저가 쓴 원문. 번역하지 않는다 (FR-07-A-05)
  "cx-skx007": { kind: "original", text: "다이버 입문의 정석. 7S26 무브먼트." },
};

/**
 * 표시할 설명을 고른다.
 * 검증본은 **요청 언어 → en → ko** 폴백 (D-012). 미검증본은 원문 그대로.
 */
export function resolveCodexDesc(
  codexId: string,
  locale: OwnerLang,
): { text: string; translated: boolean } | null {
  const d = DEV_CODEX_DESC[codexId];
  if (!d) return null;
  if (d.kind === "original") return { text: d.text, translated: false };
  const text = d.text[locale] ?? d.text.en ?? d.text.ko;
  return text ? { text, translated: true } : null;
}

/** 도감 소유자 — ⚠️ 서버 렌더 결과에 포함되면 안 된다 (FR-07-A-08, D-078) */
export type CodexOwner = {
  roomId: string;
  roomName: string;
  level: number;
};

/**
 * 도감별 소유자 목록.
 *
 * 실제 구현에서는 아래를 모두 걸러야 한다:
 * - 비공개 아이템·비공개 방 제외 (FR-07-B-01·02)
 * - 판매완료(떠난 아이템) 제외 — 현재 보유자가 아니다 (E-07-05)
 * - 탈퇴 유저 제외 (E-07-03)
 * - **조회 유저와 차단 관계 제외 → 보유자 수가 조회 유저마다 달라진다** (E-07-07)
 * - 한 유저가 2개 이상 보유해도 1회만 (E-07-01)
 */
export const DEV_CODEX_OWNERS: Record<string, CodexOwner[]> = {
  "cx-116610": [
    { roomId: "r-jun", roomName: "시계쟁이 준", level: 6 },
    { roomId: "r-tokyo", roomName: "tokyo_wrist", level: 9 },
  ],
  "cx-3570": [{ roomId: "r-jun", roomName: "시계쟁이 준", level: 6 }],
  "cx-skx007": [{ roomId: "r-jun", roomName: "시계쟁이 준", level: 6 }],
  "cx-tundra45": [{ roomId: "r-jun", roomName: "시계쟁이 준", level: 6 }],
  "cx-dunklow": [{ roomId: "r-mel", roomName: "mel.collects", level: 4 }],
};

export function findCodex(id: string): CodexEntry | undefined {
  return DEV_CODEX.find((c) => c.id === id);
}

/**
 * 도감 ↔ 아이템 연결. 실제 구현에서는 `Item.codexItemId` 다 (M-05).
 * 픽스처에는 연결 필드가 없어 명시 매핑으로 둔다 — 카테고리로 매칭하면
 * 엉뚱한 물건이 "이 물건의 판매중 매물"에 뜬다.
 */
const CODEX_ITEM_IDS: Record<string, string[]> = {
  "cx-116610": ["w-1"],
  "cx-3570": ["w-2"],
  "cx-skx007": ["w-3"],
  "cx-tundra45": ["c-2"],
  "cx-dunklow": ["m-1"],
};

/**
 * 이 도감의 판매중 매물 (FR-07-A-04) — 색인 대상이라 서버에서 낸다.
 *
 * 판매자 방 이름이 색인되는 것은 의도된 것이다 — 마켓 매물 카드에 판매자
 * 방 이름을 표시하도록 정해져 있고(FR-02-A-04) 마켓 자체가 색인 대상이다
 * (D-078·D-093). **소유자 목록**(누가 보유하는가)과는 다르다.
 */
export function codexListings(codexId: string): MarketListing[] {
  const ids = CODEX_ITEM_IDS[codexId] ?? [];
  return DEV_MARKET.filter((l) => ids.includes(l.id));
}

/* ─────────────────────────────────────────────────────────────
   S-05 아이템 상세 · S-18 판매 전환
   ───────────────────────────────────────────────────────────── */

export type ItemDetail = {
  id: string;
  /** 파생값. 저장하지 않는다 (D-073, FR-06-A-11) */
  name: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
  ownerLevel: number;
  visibility: "PUBLIC" | "PRIVATE";
  saleStatus: "DISPLAYED" | "ON_SALE" | "SOLD";
  /** 방 공개 상태 — 공개 판정은 Room AND Item (M-06, D-019) */
  roomPublic: boolean;
  /** 도감 연결. 없으면 "같은 물건 가진 사람"에 나타나지 않는다 (D-032) */
  codexId?: string;
  /** 활성 속성값만. 값이 빈 항목은 렌더하지 않는다 (FR-06-A-01·02) */
  attrs: CodexAttr[];
  /** ⚠️ 타인에게 표시하지 않는다 (FR-06-A-05, D-019) */
  owner: {
    purchasedFrom?: string;
    purchaseDate?: string;
    purchasePrice?: string;
  };
  /** 연결된 공개 일기 (FR-06-A-04, 원칙 1) */
  diaries: { id: string; date: string; excerpt: string }[];
  /** 판매중일 때만 (D-050) */
  sale?: { price: number; currency: CurrencyCode; url: string };
  /** 아이템 `url` 속성 — 외부 링크 경고를 경유해야 한다 (D-040) */
  refUrl?: string;
};

export const DEV_ITEMS: Record<string, ItemDetail> = {
  "w-1": {
    id: "w-1",
    name: "Rolex Submariner 116610LN",
    categoryKey: "category.watch",
    roomId: "r-jun", roomName: "시계쟁이 준", ownerLevel: 6,
    visibility: "PUBLIC", saleStatus: "ON_SALE", roomPublic: true,
    codexId: "cx-116610",
    attrs: [
      { labelKey: "attr.brand", value: "Rolex" },
      { labelKey: "attr.model", value: "Submariner Date" },
      { labelKey: "attr.uniqueId", value: "116610LN" },
      { labelKey: "attr.condition", value: "사용감 적음" },
    ],
    owner: {
      purchasedFrom: "명동 백화점",
      purchaseDate: "2023-03-14",
      purchasePrice: "₩11,800,000",
    },
    diaries: [
      { id: "d-1", date: "2026-06-30", excerpt: "드디어 데려왔다. 3년 기다린 시계." },
      { id: "d-2", date: "2026-07-21", excerpt: "오버홀 맡기고 왔다. 3주 걸린다고." },
    ],
    sale: { price: 12_400_000, currency: "KRW", url: "https://cafe.example.com/watch/12345" },
    refUrl: "https://www.rolex.com/watches/submariner",
  },
  "w-2": {
    id: "w-2",
    name: "Omega Speedmaster 3570.50",
    categoryKey: "category.watch",
    roomId: "r-jun", roomName: "시계쟁이 준", ownerLevel: 6,
    visibility: "PUBLIC", saleStatus: "DISPLAYED", roomPublic: true,
    codexId: "cx-3570",
    attrs: [
      { labelKey: "attr.brand", value: "Omega" },
      { labelKey: "attr.model", value: "Speedmaster Professional" },
      { labelKey: "attr.uniqueId", value: "3570.50" },
    ],
    owner: { purchaseDate: "2021-11-02" },
    diaries: [],
  },
  // 비공개 아이템 — 소유자만 볼 수 있다 (D-019). 색인 대상 아님 (D-093)
  "w-5": {
    id: "w-5",
    name: "Patek Philippe Aquanaut 5167A",
    categoryKey: "category.watch",
    roomId: "r-jun", roomName: "시계쟁이 준", ownerLevel: 6,
    visibility: "PRIVATE", saleStatus: "DISPLAYED", roomPublic: true,
    attrs: [{ labelKey: "attr.brand", value: "Patek Philippe" }],
    owner: { purchasedFrom: "지인" },
    diaries: [],
  },
  // 떠난 아이템 — 방에는 남지만 현재 보유자가 아니다 (D-023). 색인 제외
  "g-1": {
    id: "g-1",
    name: "Rolex Explorer I 214270",
    categoryKey: "category.watch",
    roomId: "r-jun", roomName: "시계쟁이 준", ownerLevel: 6,
    visibility: "PUBLIC", saleStatus: "SOLD", roomPublic: true,
    attrs: [{ labelKey: "attr.brand", value: "Rolex" }],
    owner: {}, diaries: [],
  },
};

export function findItem(id: string): ItemDetail | undefined {
  return DEV_ITEMS[id];
}

/**
 * 조건부 색인 판정 (D-093).
 *
 * **판매중 + 아이템 공개 + 방 공개**일 때만 색인한다. 판매 의사가 없는
 * 소장품이 검색엔진에 색인되면 D-031 절도 리스크를 아이템 단위로 다시 키운다.
 * 떠난 아이템(SOLD)도 제외한다 — 현재 보유자가 아니다 (D-023).
 */
export function isItemIndexable(item: ItemDetail): boolean {
  return (
    item.saleStatus === "ON_SALE" &&
    item.visibility === "PUBLIC" &&
    item.roomPublic
  );
}

/* ─────────────────────────────────────────────────────────────
   S-06 일기 작성·수정 · S-07 일기 상세 · 기록 목록
   ───────────────────────────────────────────────────────────── */

export type DiaryEntry = {
  id: string;
  roomId: string;
  roomName: string;
  /** 작성 시각 역순으로 표시 (FR-04-A-01) */
  createdAt: string;
  visibility: "PUBLIC" | "PRIVATE";
  /** 플레인 텍스트. 개행 보존, 마크다운·URL 링크화 없음 (FR-01-B-01~04) */
  body: string;
  /** 최대 10장. 필수 아님 (FR-01-A-05·06) */
  photoCount: number;
  /**
   * 연결된 아이템 (N:M, D-054).
   * `visibility` 는 **아이템의** 공개 상태 — 비공개면 링크를 비활성화하되
   * 일기 자체는 계속 노출한다 (FR-02-A-08).
   */
  items: { id: string; name: string; visibility: "PUBLIC" | "PRIVATE" }[];
};

export const DEV_DIARIES: DiaryEntry[] = [
  {
    id: "d-3", roomId: "r-jun", roomName: "시계쟁이 준",
    createdAt: "2026-08-02", visibility: "PUBLIC", photoCount: 3,
    body: "주말에 처음 데려간 캠핑. 텐트 세우는 데 40분 걸렸다.\n다음엔 20분 안에 해보자.",
    items: [
      { id: "c-1", name: "Snow Peak Land Station", visibility: "PUBLIC" },
      { id: "c-2", name: "YETI Tundra 45", visibility: "PUBLIC" },
    ],
  },
  {
    id: "d-2", roomId: "r-jun", roomName: "시계쟁이 준",
    createdAt: "2026-07-21", visibility: "PUBLIC", photoCount: 1,
    body: "오버홀 맡기고 왔다. 3주 걸린다고.",
    items: [{ id: "w-1", name: "Rolex Submariner 116610LN", visibility: "PUBLIC" }],
  },
  {
    // 비공개 일기 — 소유자만 (FR-03-A-03)
    id: "d-4", roomId: "r-jun", roomName: "시계쟁이 준",
    createdAt: "2026-07-05", visibility: "PRIVATE", photoCount: 0,
    body: "가격이 또 올랐다. 지금 팔까 고민 중.",
    items: [{ id: "w-5", name: "Patek Philippe Aquanaut 5167A", visibility: "PRIVATE" }],
  },
  {
    // 공개 일기인데 연결된 아이템이 비공개 — 링크만 비활성 (FR-02-A-08)
    id: "d-5", roomId: "r-jun", roomName: "시계쟁이 준",
    createdAt: "2026-07-02", visibility: "PUBLIC", photoCount: 2,
    body: "케이스에 넣어두기만 하는 것도 나쁘지 않다.",
    items: [{ id: "w-5", name: "Patek Philippe Aquanaut 5167A", visibility: "PRIVATE" }],
  },
  {
    id: "d-1", roomId: "r-jun", roomName: "시계쟁이 준",
    createdAt: "2026-06-30", visibility: "PUBLIC", photoCount: 4,
    body: "드디어 데려왔다. 3년 기다린 시계.",
    items: [{ id: "w-1", name: "Rolex Submariner 116610LN", visibility: "PUBLIC" }],
  },
];

export function findDiary(id: string): DiaryEntry | undefined {
  return DEV_DIARIES.find((d) => d.id === id);
}

/**
 * 방의 일기 목록 — 작성 시각 역순 (FR-04-A-01).
 * 타인 뷰에서는 **공개 일기만** (FR-04-A-03).
 */
export function roomDiaries(roomId: string, isOwner: boolean): DiaryEntry[] {
  return DEV_DIARIES.filter(
    (d) => d.roomId === roomId && (isOwner || d.visibility === "PUBLIC"),
  );
}

/** 일기 본문 최대 길이. 언어 무관 유니코드 문자 수 (D-053, FR-01-A-01·02) */
export const DIARY_MAX_LENGTH = 1000;
/** 사진 최대 장수 (D-037, FR-01-A-05) */
export const DIARY_MAX_PHOTOS = 10;

/* ─────────────────────────────────────────────────────────────
   설정류 — S-11 프로필 · S-12 언어 · S-14 레벨 · S-19 차단 · S-20 문의
   ───────────────────────────────────────────────────────────── */

/** 레벨 테이블. seed 의 값은 자리만 잡은 것이고 A-09 확정본으로 교체된다 */
export const DEV_LEVELS: { level: number; required: number }[] = [
  { level: 1, required: 0 }, { level: 2, required: 100 },
  { level: 3, required: 300 }, { level: 4, required: 700 },
  { level: 5, required: 1500 }, { level: 6, required: 3000 },
  { level: 7, required: 5500 }, { level: 8, required: 9000 },
  { level: 9, required: 14000 }, { level: 10, required: 20000 },
];

export const MAX_LEVEL = 10;
/** 1일 획득 상한 (D-026, FR-01-A-07) */
export const DAILY_EXP_CAP = 60;

/** 경험치 사유 3종. 각 1일 1회 (D-026) */
export const EXP_RULES = [
  { reason: "login", amount: 10 },
  { reason: "item", amount: 30 },
  { reason: "diary", amount: 20 },
] as const;

export type ExpLog = {
  id: string;
  reason: (typeof EXP_RULES)[number]["reason"];
  amount: number;
  /** 유저 타임존 기준 날짜 (D-056) */
  localDate: string;
};

export const DEV_EXP = {
  total: 3_420,
  /** 오늘 이미 받은 사유 — "오늘 안 한 것"을 보여주는 것이 이 화면의 핵심이다 */
  todayEarned: ["login"] as string[],
  logs: [
    { id: "e1", reason: "login", amount: 10, localDate: "2026-08-08" },
    { id: "e2", reason: "diary", amount: 20, localDate: "2026-08-02" },
    { id: "e3", reason: "login", amount: 10, localDate: "2026-08-02" },
    { id: "e4", reason: "item", amount: 30, localDate: "2026-07-28" },
    { id: "e5", reason: "login", amount: 10, localDate: "2026-07-28" },
  ] satisfies ExpLog[],
};

/**
 * 현재 레벨과 구간 진행률 (FR-02-A-02).
 * **Lv.10 은 다음 레벨 진행률을 표시하지 않는다** (D-057, FR-02-A-03).
 * 누적 경험치는 계속 적립·표시한다 (FR-02-A-04).
 */
export type LevelProgress =
  | { isMax: true; level: number; total: number }
  | {
      isMax: false;
      level: number;
      total: number;
      /** 현재 레벨 구간 내 경험치 (FR-02-A-02) */
      inLevel: number;
      /** 현재 구간의 폭 */
      span: number;
      /** 다음 레벨까지 남은 경험치 */
      toNext: number;
    };

export function levelProgress(total: number): LevelProgress {
  const current =
    [...DEV_LEVELS].reverse().find((l) => total >= l.required) ?? DEV_LEVELS[0];
  const next = DEV_LEVELS.find((l) => l.level === current.level + 1);
  // Lv.10 은 다음 레벨 진행률을 내지 않는다 (D-057, FR-02-A-03)
  if (!next) return { isMax: true, level: current.level, total };
  return {
    isMax: false,
    level: current.level,
    total,
    inLevel: total - current.required,
    span: next.required - current.required,
    toNext: next.required - total,
  };
}

/** 차단 목록 (D-051). 상대에게 알리지 않는다 (FR-05-B-04) */
export const DEV_BLOCKS = [
  { roomId: "r-x1", roomName: "spam_seller_01", blockedAt: "2026-07-30" },
  { roomId: "r-x2", roomName: "느린배송", blockedAt: "2026-06-11" },
];

/** 프로필 (S-11) */
export const DEV_PROFILE_SETTINGS = {
  roomName: "시계쟁이 준",
  bio: "빈티지 다이버만 모읍니다. 서울 · 2019년부터.",
  /** 방 공개 상태 (D-019) */
  roomPublic: true,
  /** 방 비공개 전환 시 마켓에서 내려가는 매물 수 (FR-02-A-05·07) */
  onSaleCount: 3,
  language: "ko" as OwnerLang,
  timezone: "Asia/Seoul",
};

/* ─────────────────────────────────────────────────────────────
   운영 — S-15 신고 · S-17 브랜드 요청 · S-21 제재
   ───────────────────────────────────────────────────────────── */

/**
 * 신고 사유 (FR-05-A-02, D-035·D-052).
 * **금지품목 6종 + 사기·피싱 링크 + 부적절한 콘텐츠 + 정보 오류.**
 * 자동 판정하지 않는다 (FR-06-A-04) — 신고 기반 사후 조치다.
 */
export const REPORT_REASONS = [
  // 금지품목 6종 (D-052)
  "fake", "stolen", "weapon", "drug", "alcohol", "nonphysical",
  // 그 외
  "phishing", "inappropriate", "wrongInfo",
] as const;

export type ReportTarget = "item" | "diary" | "room" | "codex" | "link";

/** 신고 가능 대상 (FR-05-A-01, D-029·D-035·D-040) */
export const REPORT_TARGETS: ReportTarget[] = [
  "item", "diary", "room", "codex", "link",
];

/** 브랜드 마스터 — 요청 전 중복 검사에 쓴다 (FR-09-A-07) */
export const DEV_BRANDS = [
  { name: "Rolex", aliases: ["롤렉스", "ロレックス"] },
  { name: "Omega", aliases: ["오메가", "オメガ"] },
  { name: "Seiko", aliases: ["세이코", "セイコー"] },
  { name: "Snow Peak", aliases: ["스노우피크", "スノーピーク"] },
  { name: "Nike", aliases: ["나이키", "ナイキ"] },
];

/** 대기 중인 브랜드 요청 — 같은 요청은 병합한다 (FR-09-A-06) */
export const DEV_BRAND_REQUESTS = [
  { name: "Grand Seiko", categoryKey: "category.watch", count: 4 },
];

/** 제재 상태 (D-064·D-066) */
export type SanctionLevel = "WARNING" | "SUSPENDED" | "BANNED";
export const DEV_SANCTION = {
  level: "SUSPENDED" as SanctionLevel,
  reasonKey: "report.reason.inappropriate",
  /** 영구 정지면 없다 */
  until: "2026-08-15",
  issuedAt: "2026-08-08",
};

/* ─────────────────────────────────────────────────────────────
   S-22 알림함 (D-087)
   ───────────────────────────────────────────────────────────── */

/**
 * 알림 4종 (D-087). **경험치·레벨업은 대상이 아니다** (FR-08-B-05) —
 * 인앱에서만 발생하므로 그 자리에서 보여주면 되고, 알림함에 쌓으면
 * 나머지 4종이 묻힌다 (원칙 7).
 */
export type NotificationKind =
  | "BRAND_REQUEST_RESULT"
  | "REPORT_RESULT"
  | "SANCTION"
  | "CODEX_MERGED";

export type NotificationItem = {
  id: string;
  type: NotificationKind;
  /** 문구 치환값. 본문은 3개 언어 i18n 리소스로 만든다 (FR-08-A-09) */
  params: Record<string, string>;
  /** 이동 대상 (FR-08-A-06) */
  href?: string;
  createdAt: string;
  read: boolean;
};

export const DEV_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n-1", type: "BRAND_REQUEST_RESULT",
    params: { brand: "Grand Seiko", result: "approved" },
    href: "/items/new", createdAt: "2026-08-08", read: false,
  },
  {
    id: "n-2", type: "REPORT_RESULT",
    params: { result: "hidden" },
    href: undefined, createdAt: "2026-08-07", read: false,
  },
  {
    id: "n-3", type: "CODEX_MERGED",
    params: { codex: "Rolex Submariner Date 116610LN" },
    href: "/codex/cx-116610", createdAt: "2026-08-05", read: true,
  },
  {
    id: "n-4", type: "SANCTION",
    params: { level: "warning" },
    href: "/suspended", createdAt: "2026-08-01", read: true,
  },
];

export function unreadCount(): number {
  return DEV_NOTIFICATIONS.filter((n) => !n.read).length;
}

/* ─────────────────────────────────────────────────────────────
   S-04 아이템 등록·수정
   ───────────────────────────────────────────────────────────── */

/** 동적 속성 8종 (D-038). 어드민이 카테고리별로 추가·삭제한다 */
export type AttrType =
  | "text" | "textarea" | "number" | "select"
  | "multiselect" | "date" | "boolean" | "url";

export type AttrDef = {
  key: string;
  /** i18n 키. **속성명은 번역 대상**이다 (D-010) */
  labelKey: string;
  type: AttrType;
  required: boolean;
  /** `number` 전용 — 단위도 번역 대상 (D-010) */
  unit?: string;
  /** `select`·`multiselect` 전용. **선택지도 번역 대상** — 가장 흔한 누락 */
  optionKeys?: string[];
  /** 이 속성이 도감 매칭 키인가 (D-013) */
  matchingKey?: boolean;
  /** 브랜드는 자유 텍스트가 아니라 마스터 select 다 (D-043) */
  brandSelect?: boolean;
};

/**
 * 카테고리별 활성 속성. **순서대로 표시한다** (FR-05-A-02, FR-02-A-10).
 * 비활성 속성은 여기 들어오지 않는다 (D-036).
 */
export const CATEGORY_ATTRS: Record<string, AttrDef[]> = {
  watch: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
    { key: "uniqueId", labelKey: "attr.uniqueId", type: "text", required: true, matchingKey: true },
    { key: "movement", labelKey: "attr.movement", type: "select", required: false,
      optionKeys: ["opt.auto", "opt.quartz", "opt.manual"] },
    { key: "caseSize", labelKey: "attr.caseSize", type: "number", required: false, unit: "mm" },
    { key: "year", labelKey: "attr.year", type: "number", required: false, unit: "unit.year" },
    { key: "condition", labelKey: "attr.condition", type: "select", required: false,
      optionKeys: ["cond.new", "cond.unused", "cond.light", "cond.used"] },
    { key: "accessories", labelKey: "attr.accessories", type: "multiselect", required: false,
      optionKeys: ["acc.warranty", "acc.links", "acc.pouch", "acc.manual"] },
    { key: "hasBox", labelKey: "attr.hasBox", type: "boolean", required: false },
    { key: "purchasedFrom", labelKey: "attr.purchasedFrom", type: "text", required: false },
    { key: "purchaseDate", labelKey: "attr.purchaseDate", type: "date", required: false },
    { key: "note", labelKey: "attr.note", type: "textarea", required: false },
    { key: "refUrl", labelKey: "attr.refUrl", type: "url", required: false },
  ],
  camping: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
    { key: "uniqueId", labelKey: "attr.uniqueId", type: "text", required: false, matchingKey: true },
    { key: "purchaseDate", labelKey: "attr.purchaseDate", type: "date", required: false },
    { key: "note", labelKey: "attr.note", type: "textarea", required: false },
  ],
  shoes: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
    { key: "uniqueId", labelKey: "attr.uniqueId", type: "text", required: false, matchingKey: true },
    { key: "condition", labelKey: "attr.condition", type: "select", required: false,
      optionKeys: ["cond.new", "cond.unused", "cond.light", "cond.used"] },
  ],
  bicycle: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
  ],
  apparel: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
  ],
  deskterior: [
    { key: "brand", labelKey: "attr.brand", type: "select", required: true, brandSelect: true },
    { key: "model", labelKey: "attr.model", type: "text", required: true },
  ],
};

/**
 * 매칭 키로 도감 조회 (D-013, FR-03-A-01).
 * ⚠️ **옷·자전거·데스크테리어는 매칭 키 초안이 검증되지 않았다** (D-034 조사 대기).
 */
export function lookupCodexByKey(
  category: string,
  value: string,
): CodexEntry | undefined {
  if (!value.trim()) return undefined;
  const n = value.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
  return DEV_CODEX.find(
    (c) =>
      c.categoryKey === `category.${category}` &&
      c.uniqueId.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "") === n,
  );
}

/** 도감이 보유한 속성값 — 자동 채움에 쓴다 (FR-03-A-01) */
export function codexAttrValues(codexId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of DEV_CODEX_ATTRS[codexId] ?? []) {
    const key = a.labelKey.replace(/^attr\./, "");
    out[key] = a.value;
  }
  const entry = findCodex(codexId);
  if (entry) out.uniqueId = entry.uniqueId;
  return out;
}

export const ITEM_MAX_PHOTOS = 10;

/* ─────────────────────────────────────────────────────────────
   어드민 (A-01~A-13) — ko 단일 (D-030)
   ───────────────────────────────────────────────────────────── */

/** A-13 운영 대시보드 큐 5종 (D-072) */
export const DEV_ADMIN_QUEUES = {
  mergeCandidates: 7,
  unverifiedCodex: 34,
  pendingReports: 3,
  pendingBrandRequests: 1,
  activeSanctions: 2,
};

/** A-08 신고 처리 큐. 누적 신고가 많으면 상단 (FR-05-A-07) */
export const DEV_ADMIN_REPORTS = [
  { id: "rp-1", target: "item", targetId: "w-1", targetName: "Rolex Submariner 116610LN",
    reason: "fake", count: 4, status: "PENDING", createdAt: "2026-08-08" },
  { id: "rp-2", target: "link", targetId: "w-1", targetName: "cafe.example.com/watch/12345",
    reason: "phishing", count: 2, status: "PENDING", createdAt: "2026-08-07" },
  { id: "rp-3", target: "diary", targetId: "d-3", targetName: "주말에 처음 데려간 캠핑…",
    reason: "inappropriate", count: 1, status: "RESOLVED", createdAt: "2026-08-05" },
];

/** A-10 제재. **제재 이전 공개 상태를 보존한다** (D-065, FR-07-B-03) */
export const DEV_ADMIN_SANCTIONS = [
  { id: "sc-1", roomId: "r-x1", roomName: "spam_seller_01", level: "SUSPENDED",
    reason: "fake", until: "2026-08-15", previousRoomVisibility: "PUBLIC", issuedAt: "2026-08-08" },
  { id: "sc-2", roomId: "r-x2", roomName: "느린배송", level: "WARNING",
    reason: "wrongInfo", until: null, previousRoomVisibility: "PRIVATE", issuedAt: "2026-07-20" },
];

/** A-01 카테고리 — 6개 고정. 신규 생성·삭제 불가 (D-007) */
export const DEV_ADMIN_CATEGORIES = [
  { slug: "watch", labelKey: "category.watch", order: 1, active: true, itemCount: 1240 },
  { slug: "shoes", labelKey: "category.shoes", order: 2, active: true, itemCount: 860 },
  { slug: "bicycle", labelKey: "category.bicycle", order: 3, active: true, itemCount: 210 },
  { slug: "apparel", labelKey: "category.apparel", order: 4, active: true, itemCount: 430 },
  { slug: "camping", labelKey: "category.camping", order: 5, active: true, itemCount: 690 },
  { slug: "deskterior", labelKey: "category.deskterior", order: 6, active: false, itemCount: 120 },
];

/** A-12 브랜드 요청 큐 — 요청 건수 순 (FR-09-B-01) */
export const DEV_ADMIN_BRAND_REQUESTS = [
  { id: "br-1", name: "Grand Seiko", category: "watch", count: 4, requestedAt: "2026-08-06" },
  { id: "br-2", name: "Helinox", category: "camping", count: 2, requestedAt: "2026-08-07" },
];

/** A-03 매칭 키 — ⚠️ 옷·자전거·데스크테리어는 미검증 (D-034 조사 대기) */
export const DEV_MATCHING_KEYS = [
  { category: "watch", keys: ["uniqueId"], verified: true },
  { category: "shoes", keys: ["uniqueId"], verified: true },
  { category: "camping", keys: ["uniqueId"], verified: true },
  { category: "bicycle", keys: ["model", "year"], verified: false },
  { category: "apparel", keys: [], verified: false },
  { category: "deskterior", keys: ["uniqueId"], verified: false },
];

/** A-06 병합 후보 — 되돌리기가 가능해야 한다 */
export const DEV_MERGE_CANDIDATES = [
  { id: "mg-1", a: "Rolex Submariner Date 116610LN", b: "ROLEX SUBMARINER 116610LN",
    aOwners: 128, bOwners: 3, similarity: 0.96 },
  { id: "mg-2", a: "Seiko SKX007", b: "SEIKO SKX007J1", aOwners: 213, bOwners: 41, similarity: 0.81 },
];
