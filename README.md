# vib — 복식부기 가계부

Next.js + Prisma + NextAuth.js 기반의 복식부기(Double-Entry Bookkeeping) 가계부 웹 애플리케이션입니다.

## 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 만들고, 각 값을 설정하세요.

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 URL (예: `postgresql://user:pass@host:5432/vib`) |
| `NEXTAUTH_SECRET` | JWT 서명용 비밀 키 (`openssl rand -base64 32` 으로 생성) |
| `NEXTAUTH_URL` | 앱의 기본 URL (예: `http://localhost:3000`) |

## 시작하기

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 DATABASE_URL, NEXTAUTH_SECRET 등을 설정하세요

# 3. 데이터베이스 스키마 적용
npm run db:push

# 4. 개발 서버 실행
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## Vercel 배포

### 사전 준비

1. **PostgreSQL 데이터베이스** — [Neon](https://neon.tech) 또는 [Vercel Postgres](https://vercel.com/storage/postgres)에서 무료 DB를 생성하세요.
2. **Vercel 계정** — [vercel.com](https://vercel.com)에서 가입 후 GitHub 저장소를 연결하세요.

### 방법 1 — Vercel 대시보드 (권장)

1. [Vercel 대시보드](https://vercel.com/new)에서 **"Import Git Repository"** 클릭
2. `vib` 저장소 선택
3. **Environment Variables** 탭에서 아래 변수를 등록:
   | 변수 | 값 |
   |------|-----|
   | `DATABASE_URL` | Neon / Vercel Postgres 연결 문자열 |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` 결과 |
   | `NEXTAUTH_URL` | 배포 후 생성된 Vercel URL (예: `https://vib.vercel.app`) |
   - Vercel의 **Production** / **Preview** 환경 변수는 분리해서 관리하고, Preview에는 별도 개발용 DB의 `DATABASE_URL`을 연결하세요.
4. **Deploy** 버튼 클릭
   - Production 배포에서는 `prisma db push`가 자동 실행됩니다.
   - 마이그레이션 이력이 없는 기존 프로덕션 DB도 현재 Prisma 스키마와 동기화됩니다.
   - Preview 환경은 별도 DB를 사용해야 하며, 기본 빌드 명령에서는 `db push`를 실행하지 않습니다.
   - 이 명령은 `--accept-data-loss` 없이 실행되므로 파괴적 변경이 감지되면 실패합니다.
   - 이 경우 먼저 DB를 백업한 뒤, 마이그레이션 이력을 기준으로 정리해야 합니다.
   - 스키마 반영에 실패하면 빌드도 즉시 실패하므로 잘못된 상태로 배포되지 않습니다.

### 방법 2 — GitHub Actions CI (자동 빌드·검증)

`main` 브랜치에 푸시하거나 PR을 열면 `.github/workflows/deploy.yml`이 자동으로 린트 · 빌드를 검증합니다. 실제 배포는 Vercel GitHub App이 자동으로 처리합니다.

저장소의 **Settings → Secrets and variables → Actions**에 다음 시크릿을 등록하면 빌드 환경에서 사용됩니다:

| 시크릿 | 설명 |
|--------|------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens에서 생성 |
| `DATABASE_URL` | 프로덕션 PostgreSQL 연결 URL |
| `NEXTAUTH_SECRET` | 프로덕션용 비밀 키 |
| `NEXTAUTH_URL` | 배포된 앱 URL |

### DB 마이그레이션

```bash
# 기존 운영 DB를 현재 Prisma 스키마와 맞출 때
DATABASE_URL="<production-db-url>" npm run db:push

# 주의: 컬럼 삭제/타입 변경 같은 파괴적 변경이 예정되어 있다면
# 먼저 DB를 백업하고 마이그레이션 이력을 정리한 뒤 적용하세요.

# 마이그레이션 이력이 준비된 DB(예: CI/E2E, 신규 환경)에는
DATABASE_URL="<db-url>" npm run db:migrate
```

## 주요 기능

- **사용자 인증** — 이메일/비밀번호 회원가입·로그인
- **복식부기 원장** — 계정 관리 (자산/부채/자본/수익/비용), 차변·대변 거래 입력
- **예산 관리** — 월별 비용 예산 설정 및 실적 대비 현황
