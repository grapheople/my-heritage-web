-- 수동 측정(3번 누르기)을 같은 이력 테이블에 담는다.
--
-- ⚠️ 앞 마이그레이션(20260910130000)을 고치지 않고 새로 추가한다. 이미 적용된
--    마이그레이션 파일을 수정하면 체크섬이 달라져 `prisma migrate` 가
--    "적용 후 변경됨"으로 막는다 — 적용 여부를 알 수 없을 때는 항상 새 파일이다.

-- CreateEnum
CREATE TYPE "SignalCalibrationSource" AS ENUM ('LIVE', 'MANUAL');

-- AlterTable
ALTER TABLE "SignalCalibration"
    ADD COLUMN     "source" "SignalCalibrationSource" NOT NULL DEFAULT 'LIVE',
    ADD COLUMN     "greenSec" INTEGER,
    ADD COLUMN     "redSec" INTEGER,
    ALTER COLUMN "liveState" DROP NOT NULL,
    ALTER COLUMN "liveRaw" DROP NOT NULL;
