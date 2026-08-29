import { getViewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n/routing";
import { displayLangOrder } from "@/lib/display-name";

/**
 * **관심 언어권** — 홈 피드가 쓰는 축 (D-274).
 *
 * ## ⚠️ 이 축이 거르는 것은 **소유자의 설정 언어**다
 * 아이템의 언어가 아니다 (D-027, FR-03-B-02). 아이템 본문은 번역하지 않고
 * 원문으로 두므로(D-003) 아이템에는 언어가 없다 — 대신 **누가 올렸는가**로
 * 언어권을 가른다. 조건이 방(→유저)에 걸리는 이유다.
 *
 * ## ⚠️ `User.language` 와 **다른 것이다**
 * | | 무엇 | 어디에 |
 * |---|---|---|
 * | `User.language` | *내* 화면이 보이는 말 | S-12 언어 설정 |
 * | `preferredLanguages` | *남의* 방을 볼지 말지 | S-11 프로필 설정 |
 *
 * 둘을 한 필드로 합치면 **한국어 UI 를 쓰는 사람이 일본 컬렉터를 못 본다.**
 * 언어권 기본값이 `전체` 였던 것(D-027)이 정확히 그 이유다.
 *
 * ## ⚠️ **절대 빈 배열을 내지 않는다**
 * `myCategoryKeys()` 와 같은 규칙이다 (D-271). 관심 언어가 없다고 피드를
 * 비우면 **D-069**(관람자가 콘텐츠 대신 벽을 만난다)와 **D-109**(크롤러가
 * 받는 HTML 에 아이템이 하나도 없다)가 동시에 깨진다.
 *
 * | 상황 | 결과 |
 * |---|---|
 * | 로그인 + 관심 언어 있음 | 그 집합 |
 * | 로그인 + 관심 언어 없음 | **전체** |
 * | 비로그인 | **전체** |
 *
 * ## ⚠️ `category-scope.ts` 에 합치지 않는다
 * 거기는 **카테고리 축 하나**의 규칙을 모아둔 파일이다 (D-271). 다른 축을
 * 끌어들이면 "축의 단일 출처" 라는 성질이 사라진다 — 규칙을 쪼개지 말라는
 * 것과 서로 다른 규칙을 한 통에 담지 말라는 것은 같은 이야기의 양면이다.
 */

/** 서비스가 지원하는 언어 — `i18n/routing.ts` 가 단일 출처다 */
export function allLanguages(): string[] {
  return [...locales];
}

export async function myLanguages(): Promise<string[]> {
  const all = allLanguages();
  const viewer = await getViewer();
  if (!viewer) return all;

  const row = await prisma.user.findUnique({
    where: { id: viewer.userId },
    select: { preferredLanguages: true },
  });
  /*
    마이그레이션 전 행은 `NULL` 이라 Prisma 가 `[]` 로 준다 — 고른 적 없는
    사람이 지금까지처럼 전 언어권을 보는 것이 맞다
  */
  const usable = (row?.preferredLanguages ?? []).filter((l) => all.includes(l));
  return usable.length > 0 ? usable : all;
}

/**
 * 뷰어의 **표시명 우선순위** — 서버에서 한 번 읽어 클라이언트로 넘긴다 (D-276).
 *
 * ## ⚠️ 여기에 있는 이유
 * `display-name.ts` 는 클라이언트 컴포넌트가 직접 부르므로 **순수해야 한다.**
 * 뷰어를 읽으려면 `prisma` 가 필요하고, 그것이 순수 모듈에 들어가면
 * `pg` 가 브라우저 번들에 딸려 들어가 빌드가 깨진다.
 *
 * ⚠️ **행마다 부르지 않는다.** 요청당 한 번 읽어 목록 전체에 재사용한다
 */
export async function viewerLangOrder(): Promise<string[]> {
  return displayLangOrder(await myLanguages());
}
