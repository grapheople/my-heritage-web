import { redirect } from "next/navigation";

/**
 * A-03 매칭 키 정의는 **카테고리 상세 `매칭 키` 탭으로 흡수됐다** (D-246).
 * → `/admin/categories/[key]/matching-key`
 *
 * ## ⚠️ 삭제하지 않고 redirect 로 남긴다 (D-249)
 * 기획 문서·북마크·과거 커밋 메시지가 이 경로를 가리킨다. 지우면 404 만
 * 남고 어디로 가야 하는지 알 수 없다.
 *
 * ## ⚠️ A-03 번호는 회수하되 재사용하지 않는다 (D-220)
 *
 * 카테고리를 특정할 수 없으므로 목록으로 보낸다.
 */
export default function AdminMatchingKeysRedirect() {
  redirect("/admin/categories");
}
