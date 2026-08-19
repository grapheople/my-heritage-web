-- D-236 — 루틴의 구성 단위를 **항목**으로 (운동 + 휴식), 횟수를 **세트별**로
--
-- ⚠️ **자동 생성된 diff 를 쓰지 않았다.** `migrate diff` 는
--    `DROP TABLE "RoutineExercise"` + `CREATE TABLE "RoutineEntry"` 를 낸다 —
--    테이블 이름이 바뀌었으니 당연하지만, 그러면 **운영 루틴의 6항목이 사라진다**
--    (D-235 로 만든 봇 방 루틴). 이름 변경 + 컬럼 변환으로 **데이터를 옮긴다.**
--
-- ⚠️ **`sets` → `reps` 변환 규칙** (D-236)
--    `sets` 만큼 `repsPerSet` 을 반복해 배열로 채운다:
--      sets=4, repsPerSet='6-8'  →  ARRAY['6-8','6-8','6-8','6-8']
--    의미가 보존된다("4세트 모두 6-8회"). `sets` 가 비면 `repsPerSet` 1칸,
--    둘 다 비면 빈 배열이다.

-- 1. 항목 종류 enum
CREATE TYPE "RoutineEntryKind" AS ENUM ('EXERCISE', 'REST');

-- 2. 테이블·제약·인덱스 이름 변경 (데이터 보존)
ALTER TABLE "RoutineExercise" RENAME TO "RoutineEntry";
ALTER TABLE "RoutineEntry" RENAME CONSTRAINT "RoutineExercise_pkey" TO "RoutineEntry_pkey";
ALTER TABLE "RoutineEntry" RENAME CONSTRAINT "RoutineExercise_routineItemId_fkey" TO "RoutineEntry_routineItemId_fkey";
ALTER TABLE "RoutineEntry" RENAME CONSTRAINT "RoutineExercise_exerciseId_fkey" TO "RoutineEntry_exerciseId_fkey";
ALTER INDEX "RoutineExercise_routineItemId_displayOrder_idx" RENAME TO "RoutineEntry_routineItemId_displayOrder_idx";
ALTER INDEX "RoutineExercise_exerciseId_idx" RENAME TO "RoutineEntry_exerciseId_idx";
ALTER INDEX "RoutineExercise_routineItemId_exerciseId_key" RENAME TO "RoutineEntry_routineItemId_exerciseId_key";

-- 3. 새 컬럼
ALTER TABLE "RoutineEntry"
  ADD COLUMN "kind" "RoutineEntryKind" NOT NULL DEFAULT 'EXERCISE',
  ADD COLUMN "reps" TEXT[],
  ADD COLUMN "restDurationSeconds" INTEGER;

-- 4. `sets` + `repsPerSet` → `reps` 배열 (위 규칙)
UPDATE "RoutineEntry"
SET "reps" = CASE
    WHEN "repsPerSet" IS NULL THEN ARRAY[]::TEXT[]
    WHEN "sets" IS NULL OR "sets" < 1 THEN ARRAY["repsPerSet"]
    -- ⚠️ 상한을 둔다. `sets` 에 이상값이 있으면 배열이 폭발한다
    ELSE ARRAY(SELECT "repsPerSet" FROM generate_series(1, LEAST("sets", 99)))
  END;

-- 5. ⚠️ **휴식 항목은 `exerciseId` 가 비어야 하므로** 운동 항목의 FK 는 nullable 이 된다
ALTER TABLE "RoutineEntry" ALTER COLUMN "exerciseId" DROP NOT NULL;

-- 6. 이관된 옛 컬럼 제거
ALTER TABLE "RoutineEntry" DROP COLUMN "sets", DROP COLUMN "repsPerSet";
