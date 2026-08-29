-- D-274 — 관심 언어권. 홈 피드에서 볼 "소유자의 설정 언어" 집합이다.
--
-- ⚠️ `User.language` 와 다른 것이다. 그쪽은 내 화면이 보이는 말이고,
-- 이것은 남의 방을 볼지 말지의 기준이다.
--
-- additive 하고 기존 행은 NULL(= 빈 목록 = 전체)로 남는다. 관심 언어를
-- 고른 적 없는 사람이 지금까지처럼 전 언어권을 보는 것이 맞다.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLanguages" "Locale"[];
