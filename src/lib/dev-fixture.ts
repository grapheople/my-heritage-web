import type { FeedItem } from "@/components/domain/feed-card";
import type { ItemThumbData } from "@/components/domain/item-thumb";
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
