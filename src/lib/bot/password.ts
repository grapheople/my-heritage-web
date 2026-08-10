import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * 봇 비밀번호 해시 (D-146).
 *
 * ## ⚠️ 평문을 저장하지 않는다
 * 로컬 전용 기능이지만 **DB 는 프로덕션(Supabase)** 이다 (D-117). 평문을 넣으면
 * 그 DB 를 보는 누구나 읽는다.
 *
 * `scrypt` 를 쓰는 이유: **의존성을 늘리지 않는다.** `bcrypt`·`argon2` 는
 * 네이티브 빌드가 필요하고, 이 기능 하나 때문에 배포 파이프라인에 부담을
 * 주는 것은 맞지 않다. `scrypt` 는 Node 표준이고 이 용도에 충분하다.
 *
 * ## ⚠️ 비교는 `timingSafeEqual` 로 한다
 * `===` 는 앞에서부터 비교해 **일치하는 길이만큼 시간이 늘어난다.** 로컬
 * 전용이라도 습관을 다르게 들일 이유가 없다.
 */
const KEYLEN = 64;

export async function hashBotPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, KEYLEN);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyBotPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scryptAsync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  // 길이가 다르면 `timingSafeEqual` 이 던진다 — 먼저 막는다
  if (expected.length !== key.length) return false;
  return timingSafeEqual(expected, key);
}
