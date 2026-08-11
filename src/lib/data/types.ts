import type { CurrencyCode } from "@/lib/format";

/**
 * 화면이 소비하는 데이터 형태.
 *
 * ⚠️ **Prisma 모델을 그대로 화면에 넘기지 않는다.** 여기서 한 번 좁히는 것이
 * D-019·D-078·D-083 을 지키는 장치다 — 예를 들어 타인에게 보이면 안 되는
 * 구매가는 `ItemDetail.owner` 안에 있고, 조회 계층이 **비소유자에게는 채우지
 * 않는다.** 모델을 그대로 넘기면 그 판정이 화면마다 흩어진다.
 */

/** 소유자 설정 언어 — NEW 피드 언어권 필터의 기준 (D-027, FR-03-B-02) */
export type OwnerLang = "ko" | "ja" | "en";

/**
 * 유저 별칭 (D-112). **명칭을 대체하지 않고 옆에 붙는다.**
 * 같은 도감 아이템을 2개 보유했을 때 유저가 자기 것을 구분하는 수단이다.
 */
export type ItemNickname = string | undefined;

/** 도감·아이템 속성 한 줄. 값이 비면 렌더하지 않는다 (FR-06-A-02) */
/**
 * 표시용 속성 한 줄.
 *
 * ⚠️ **이미 번역된 라벨**이다. i18n 키가 아니다 (D-135) — 속성은 어드민이
 * 추가할 수 있어 메시지 파일로 덮을 수 없다
 */
export type CodexAttr = {
  /** 속성 key — 수정 폼이 값을 되돌려 넣을 때 쓴다 */
  key: string;
  label: string;
  value: string;
};

export type CodexEntry = {
  id: string;
  /** 원문 1개 고정. 번역하지 않는다 (D-009) */
  displayName: string;
  categoryKey: string;
  uniqueId: string;
  verified: boolean;
  /**
   * ⚠️ **로그인 유저에게만 준다** (D-078·D-096). 서버 렌더 경로는 이 필드가
   * 없는 `CodexPublic` 을 쓴다 — 타입으로 막는다.
   */
  ownerCount: number;
  /** 언어별 검색용 별칭. 화면에 표시하지 않고 매칭에만 쓴다 (D-009·D-043) */
  aliases: string[];
  /**
   * 대표 이미지 (D-110). **연결된 공개 아이템의 사진을 빌려 쓴다** —
   * 도감에는 사진 필드가 없다. 후보가 없으면 `undefined`
   */
  imageUrl?: string;
};


export type MarketListing = {
  id: string;
  name: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
  /** 판매자 지정 통화 그대로. **환산하지 않는다** (D-011) */
  price: number;
  currency: CurrencyCode;
  /** 대표 사진 = 첫 장 (FR-07-A-04) */
  photoUrl?: string;
};

export type ItemDetail = {
  id: string;
  /** 파생값. 저장하지 않는다 (D-073, FR-06-A-11) */
  name: string;
  /** 유저 별칭 (D-112). 명칭과 **함께** 표시한다 */
  nickname?: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
  ownerLevel: number;
  visibility: "PUBLIC" | "PRIVATE";
  saleStatus: "DISPLAYED" | "ON_SALE" | "SOLD";
  /** 이 카테고리를 마켓에 올릴 수 있는가 (D-173) — 판매 UI 노출 판정 */
  sellable: boolean;
  /** 방 공개 상태 — 공개 판정은 Room AND Item (M-06, D-019) */
  roomPublic: boolean;
  /** 도감 연결. 없으면 "같은 물건 가진 사람"에 나타나지 않는다 (D-032) */
  codexId?: string;
  /**
   * 사진 URL — **순서가 표시 순서이고 첫 장이 대표**다 (D-037, FR-07-A-04).
   * 아이템은 1장 이상이 보장된다 (FR-07-A-03)
   */
  photos: string[];
  /** 활성 속성값만. 값이 빈 항목은 렌더하지 않는다 (FR-06-A-01·02) */
  attrs: CodexAttr[];
  /** ⚠️ 타인에게는 **조회 계층이 채우지 않는다** (FR-06-A-05, D-019) */
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
  /**
   * 속성 key → 표시 라벨 (D-135). 소유자 전용 항목·참고 링크가 이름을
   * 얻는 곳이다 — 메시지 파일을 쓰면 어드민이 이름을 바꿔도 안 따라간다
   */
  labels: Record<string, string>;
};

export type DiaryEntry = {
  id: string;
  roomId: string;
  roomName: string;
  /** 작성 시각 역순으로 표시 (FR-04-A-01) */
  createdAt: string;
  visibility: "PUBLIC" | "PRIVATE";
  /** 플레인 텍스트. 개행 보존, 마크다운·URL 링크화 없음 (FR-01-B-01~04) */
  body: string;
  /** 사진 URL. 최대 10장, **필수 아님** (FR-01-A-05·06) */
  photos: string[];
  /**
   * 연결된 아이템 (N:M, D-054).
   *
   * `visibility` 는 **아이템의** 공개 상태 — 비공개면 링크를 비활성화하되
   * **일기 자체는 계속 노출한다** (FR-02-A-08). D-083 의 유일한 예외다.
   */
  items: { id: string; name: string; visibility: "PUBLIC" | "PRIVATE" }[];
};

/** 인앱 알림 종류 (D-087). 경험치·레벨업은 없다 (FR-08-B-05) */
export type NotificationKind =
  | "BRAND_REQUEST_RESULT"
  | "REPORT_RESULT"
  | "SANCTION"
  | "CODEX_MERGED";

export type NotificationItem = {
  id: string;
  type: NotificationKind;
  /** 문구 치환값. **본문은 3개 언어 i18n 리소스로 만든다** (FR-08-A-09) */
  params: Record<string, string>;
  /** 이동 대상 (FR-08-A-06) */
  href?: string;
  createdAt: string;
  read: boolean;
};

export type SanctionLevel = "WARNING" | "SUSPENDED" | "BANNED";
