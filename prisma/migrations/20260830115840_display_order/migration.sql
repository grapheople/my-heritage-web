-- D-285 — 노출 우선순위. **낮을수록 앞**이고 기본값 0 이 "지정 안 됨" 이다.
--
-- ⚠️ 검색 랭킹을 이기지 않는다. 정확 일치 우선(OI-54)이 먼저고, 우선순위는
-- 같은 랭크 안의 동점을 가르는 값이다.
--
-- ⚠️ `CodexItem.displayOrder` 는 `Brand.displayOrder` 의 **복사본**이다.
-- 도감에는 브랜드 링크가 없어 매칭 키 첫 세그먼트로 찾아 채운다.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CodexItem" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;
