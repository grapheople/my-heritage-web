-- D-227~D-232 — 운동 카테고리 전면 개편: 운동은 아이템이 아니다
--
-- ⚠️ 전제: `RoutineExercise` 가 **비어 있어야** 한다.
--    아래 `exerciseId TEXT NOT NULL`(기본값 없음) 추가는 행이 있으면 실패한다.
--    2026-08-18 실측 — 로컬 0건 · 운영 0건. 루틴은 운영에 켜진 적이 없다 (D-225·D-230).
--    행이 있는 환경이라면 이관 대상이 없으므로 먼저 비운다:
--      DELETE FROM "RoutineExercise";
--
-- 이 마이그레이션은 스키마만 바꾼다. 데이터 셋업(카테고리 플래그·속성·시드)은
-- `pnpm attrs:workout-master` 가 한다.
-- DropForeignKey
ALTER TABLE "RoutineExercise" DROP CONSTRAINT "RoutineExercise_exerciseItemId_fkey";

-- DropIndex
DROP INDEX "RoutineExercise_exerciseItemId_idx";

-- DropIndex
DROP INDEX "RoutineExercise_routineItemId_exerciseItemId_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "userCodexCreation" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "RoutineExercise" DROP COLUMN "exerciseItemId",
ADD COLUMN     "exerciseId" TEXT NOT NULL,
ADD COLUMN     "machineSetting" TEXT,
ADD COLUMN     "repsPerSet" TEXT,
ADD COLUMN     "restSeconds" INTEGER,
ADD COLUMN     "rpe" DECIMAL(3,1),
ADD COLUMN     "sets" INTEGER,
ADD COLUMN     "tempo" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "workingWeight" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "codexItemId" TEXT NOT NULL,
    "targetMuscles" TEXT[],
    "equipmentType" TEXT,
    "mechanic" TEXT,
    "forceType" TEXT,
    "referenceUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestedName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "BrandRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "resolvedExerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_codexItemId_key" ON "Exercise"("codexItemId");

-- CreateIndex
CREATE INDEX "Exercise_active_idx" ON "Exercise"("active");

-- CreateIndex
CREATE INDEX "ExerciseRequest_status_createdAt_idx" ON "ExerciseRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExerciseRequest_normalizedName_idx" ON "ExerciseRequest"("normalizedName");

-- CreateIndex
CREATE INDEX "RoutineExercise_exerciseId_idx" ON "RoutineExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineExercise_routineItemId_exerciseId_key" ON "RoutineExercise"("routineItemId", "exerciseId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_codexItemId_fkey" FOREIGN KEY ("codexItemId") REFERENCES "CodexItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRequest" ADD CONSTRAINT "ExerciseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
