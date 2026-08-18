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

/**
 * 루틴 안의 한 운동에 대한 **내 설정** (D-227 `FR-10-B-04`).
 *
 * ⚠️ **마스터가 아니라 관계 행의 값**이다. 세트·중량은 사람마다·루틴마다 다르다.
 * ⚠️ `reps` 가 문자열인 것은 실무 표기가 범위이기 때문이다 ("6-8", "AMRAP", D-166).
 * ⚠️ 숫자는 **문자열로 내려보낸다** — `Decimal` 을 클라이언트 컴포넌트 경계로
 * 넘길 수 없고, 표시는 어차피 문자열이다. 입력 폼도 문자열을 그대로 쓴다.
 */
export type RoutineSettings = {
  sets?: string;
  reps?: string;
  restSeconds?: string;
  weight?: string;
  rpe?: string;
  tempo?: string;
  machineSetting?: string;
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
   * D-211 — **구성 부품.** 자전거의 프레임·구동계·휠셋.
   * 부품도 각자 도감에 연결되므로 `Ultegra R8100` 소유자 목록에 들어간다 (원칙 4)
   */
  parts: { id: string; name: string; subtypeLabel?: string; codexId?: string }[];
  /** 값이 있으면 **이 아이템 자체가 부품**이다 — 부모로 돌아가는 길을 준다 */
  parent?: { id: string; name: string };
  /**
   * D-221 — **이 아이템이 루틴인가** (운동 제품군 `routine`).
   * ⚠️ `exercises.length === 0` 과 구분해야 한다 — 종목 0개인 루틴은 정상
   * 상태이고(E-10-01) 화면이 "종목을 추가하세요"를 내야 한다
   */
  isRoutine: boolean;
  /**
   * 루틴이 담은 **운동 + 내 설정**. **순서가 곧 내용**이다 (`FR-10-B-02`).
   *
   * ⚠️ `id` 는 **관계 행(`RoutineExercise`)의 id** 가 아니라 **운동 마스터의
   * id** 다 — 액션이 `(routineId, exerciseId)` 로 대상을 지목하기 때문이다.
   * ⚠️ `settings` 는 **이 루틴에서의** 값이다. 같은 운동이 다른 루틴에서 다른
   * 값을 갖는다 (`FR-10-B-05`)
   */
  exercises: {
    id: string;
    name: string;
    muscles: string[];
    /** 도감(운동) 상세로 가는 길 — 운동은 언제나 도감을 갖는다 (D-228) */
    codexId: string;
    /** 어드민이 내린 운동. **루틴에서 빼지 않고 흐리게 표시한다** (`FR-10-B-08`) */
    inactive: boolean;
    /** 내 설정 7종. 전부 선택이라 비어 있을 수 있다 (`FR-10-B-06`) */
    settings: RoutineSettings;
  }[];
  /**
   * 자극부위 — 루틴이면 담긴 운동의 **합집합** (`FR-10-D-01`).
   * 저장하지 않는 파생값이다 (`FR-10-D-02`)
   */
  muscles: string[];
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

/**
 * 인앱 알림 종류 (D-087). 경험치·레벨업은 없다 (FR-08-B-05).
 *
 * ⚠️ `NEW_FOLLOWER`·`WEAR_SHOT_COMMENT` 는 **성격이 다르다** (D-178) — 나머지
 * 4종은 드물게 오는 처리 결과인데 이 둘은 **다른 유저의 행동**으로 발생한다.
 * 빈도가 훨씬 높아 알림함의 성격을 바꾼다 (OI-87 에서 짚은 것).
 */
export type NotificationKind =
  | "BRAND_REQUEST_RESULT"
  | "REPORT_RESULT"
  | "SANCTION"
  | "CODEX_MERGED"
  | "NEW_FOLLOWER"
  | "WEAR_SHOT_COMMENT"
  /** 운동 추가 요청 결과 (D-229, `FR-11-D-06`) — 브랜드 요청과 같은 성격이다 */
  | "EXERCISE_REQUEST_RESULT";

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
