# 어드민 운영 MCP (D-201)

어드민이 **자기 Claude 클라이언트**에 붙여 도감·브랜드 운영을 대화로 한다.
273건을 화면에서 하나씩 넘기는 대신 "이 12건이 의심스럽다"로 좁힌다 (OI-95).

---

## 1. 붙이기

### Claude Code

저장소 루트에서 한 번만:

```bash
claude mcp add zroom-admin -- pnpm --dir /Users/pax/Documents/GitHub/my-heritage-web mcp
```

또는 저장소 루트 `.mcp.json` 에 직접:

```json
{
  "mcpServers": {
    "zroom-admin": {
      "command": "pnpm",
      "args": ["--dir", "/Users/pax/Documents/GitHub/my-heritage-web", "mcp"]
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` 에 같은 내용을 넣고 앱을 재시작한다.

> **⚠️ `--dir` 절대 경로가 필요하다.** 클라이언트는 임의의 작업 디렉토리에서
> 서버를 띄운다. 경로가 없으면 `.env.local` 을 못 찾아 DB 연결에서 죽는다.

> **환경변수는 넣지 않아도 된다.** 서버가 `prisma/env.ts` 로 `.env.local` → `.env`
> 순서로 읽는다 (Next.js 와 같은 순서).

### 붙었는지 확인

- Claude Code: `/mcp` → `zroom-admin` 이 보이면 된다
- 직접 띄워보기: `pnpm mcp` → stderr 에 `[zroom-admin mcp] 대상 DB: …` 가 찍히면 정상
  (stdout 은 프로토콜 채널이라 조용한 것이 맞다. `Ctrl+C` 로 끈다)

---

## 2. ⚠️ 서버는 "실행 버튼"으로 켜는 것이 아니다

**stdio 서버는 클라이언트가 띄운다.** Claude 가 설정을 읽고 `pnpm mcp` 를 직접
spawn 해서 그 프로세스의 stdin/stdout 으로 대화한다.

- 미리 띄워둬도 stdin/stdout 이 그 터미널에 묶여 있어 클라이언트가 붙을 통로가 없다
- 클라이언트는 어차피 자기가 하나 더 띄운다
- **클라이언트를 열면 살아 있고 닫으면 죽는다** — 켜고 끄는 대상이 아니다

---

## 3. ⚠️ 붙기 전에 대상 DB 를 본다

서버는 기동 시 stderr 와 `codex_stats` 결과에 **쓰기가 실제로 지나가는 DB** 를 찍는다.

로컬에서 띄워도 런타임이 Supabase(운영)를 볼 수 있다 (D-117). 로컬 개발모드에서는
`localhost:5434` 여야 한다. `…supabase.com` 이 보이면 **운영 데이터를 만지는 중**이다.

```bash
pnpm db:which   # 앱 / CLI 가 각각 어느 DB 를 보는지
```

> 표시값은 `runtimeDatabaseUrl()`(= `DATABASE_URL`) 기준이다 — 쓰기가 그 경로로
> 가기 때문이다. `DIRECT_URL` 을 표시하면 둘이 다른 환경에서 **표시와 실제가
> 어긋난다** (D-202 에서 고쳤다).

---

## 4. 도구 7종

### 읽기 — 판단 재료

| 도구 | 쓰임 |
|---|---|
| `list_codex` | 도감 검색·필터. 검색은 **명칭·고유값·정식 값·명칭 alias·키 alias** 를 D-014 정규화로 훑는다 |
| `codex_stats` | 카테고리별 도감 수·미검증·도감당 아이템 수 + **매칭 결과 분포** |
| `list_merge_candidates` | 중복 가능 도감 쌍 (정규화 3규칙) |
| `list_key_alias_candidates` | 등록은 미스인데 검색으로는 나온 값 (D-198) |
| `list_brands` | 브랜드 검색·필터. `missingAliasOnly` 로 alias 빈 것만 |

### 쓰기 — 되돌릴 수 있거나 승인 게이트가 있는 것만

| 도구 | 쓰임 |
|---|---|
| `set_codex_name_aliases` | 검색용 명칭 alias. **틀려도 검색이 조금 넓어질 뿐**이라 게이트 없음 |
| `propose_key_alias` | 키 alias **제안**. `승인 대기` 로 들어가고 **승인 전에는 매칭에 쓰이지 않는다** |

### 없는 것 — 의도적이다

**검증 배지 부여** · **병합 실행** · **키 alias 승인** · 아이템·일기·유저·제재 · 삭제 전반.

AI 는 **제안까지**, 승인·실행은 사람이 화면에서 한다.

---

## 5. 실제로 뭐라고 물어보나

```
미검증 도감 중에 고유번호가 이상한 것 골라줘
  → list_codex(unverifiedOnly: true) 로 훑고 슬러그·숫자 없는 값을 지목한다
    (D-186 이 Baltic 5건에서 겪은 실패를 사람이 손으로 찾았던 작업)

신발 도감에서 스타일 코드가 배색 단위가 아닌 것 있나
  → list_codex(category: "shoes") — D-189 가 NB `990v6` 을 찾아낸 그 판정

지금 도감 매칭 미스가 단위 차이 때문인가, 도감이 없어서인가
  → codex_stats 의 missButSearchable 이 높으면 단위 차이(키 alias 가 답),
    낮으면 도감 부재(시딩량이 답). H11 을 가르는 질문이다

Dr. Martens 1460 을 배색 코드 도감에 붙이고 싶어
  → list_codex(q: "1460") 로 대상을 찾고 propose_key_alias 로 제안.
    승인은 /admin/codex/aliases 에서

alias 비어 있는 브랜드 정리해줘
  → list_brands(missingAliasOnly: true) → set_codex_name_aliases 는 도감용이므로
    브랜드 alias 는 A-11 화면에서. (브랜드 쓰기는 이 서버에 없다)

병합해야 할 도감 쌍 있나
  → list_merge_candidates. 실행은 /admin/codex/merge 에서 사람이
```

---

## 6. 관련 결정

- **D-201** 이 서버의 설계 — AI 는 제안까지, 승인·실행은 사람이
- **D-191** 유저 대면 AI 폐기(예산). MCP 는 **추론 비용을 우리가 내지 않아** 그 아래를 통과한다
- **D-185** 조사분은 미검증 · **D-194** 키 alias 승인 게이트 · **D-016** 병합은 수동
- **D-146** 로컬 전용 · **D-116·D-117** 대상 DB 표시 · **D-202** 표시 URL 정정
