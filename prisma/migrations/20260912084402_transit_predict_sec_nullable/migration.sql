-- 초를 주지 않는 노선이 있다 — 신분당선은 barvlDt 가 0 이고 정거장 수만 준다 (D-321).

-- AlterTable
ALTER TABLE "TransitArrival" ALTER COLUMN "predictSec" DROP NOT NULL;
