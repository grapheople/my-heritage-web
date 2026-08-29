-- D-276 — 표시용 언어별 명칭. **검색 alias 와 별개다.**
--
-- ⚠️ alias 를 대체하지 않는다. alias 는 정규화된 검색 토큰이라
-- `G-SHOCK` 의 en alias 가 `gshock` 이다 — 그대로 띄우면 이름이 깨진다.
-- 게다가 alias 에는 3필드로 담기지 않는 약어 89건(`gs`, `ap`, `jlc`)이
-- 들어 있어 지우면 그 검색어가 죽는다.
--
-- ⚠️ 전부 nullable 이다. 비면 원문(`Brand.name` / `CodexItem.displayName`)
-- 으로 떨어진다 — 도감은 유저 등록으로 자동 생성되므로(D-005) 3개 언어를
-- 요구할 수 없고, 그것이 D-009 선택지 B 가 탈락한 이유다.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nameJa" TEXT,
ADD COLUMN     "nameKo" TEXT;

-- AlterTable
ALTER TABLE "CodexItem" ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nameJa" TEXT,
ADD COLUMN     "nameKo" TEXT;
