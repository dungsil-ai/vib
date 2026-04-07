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
4. **Deploy** 버튼 클릭

### 방법 2 — GitHub Actions 자동 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 자동으로 빌드 · 배포합니다.

저장소의 **Settings → Secrets and variables → Actions**에 다음 시크릿을 등록하세요:

| 시크릿 | 설명 |
|--------|------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens에서 생성 |
| `DATABASE_URL` | 프로덕션 PostgreSQL 연결 URL |
| `NEXTAUTH_SECRET` | 프로덕션용 비밀 키 |
| `NEXTAUTH_URL` | 배포된 앱 URL |

### 첫 배포 후 DB 마이그레이션

```bash
# 로컬에서 프로덕션 DB에 스키마 적용 (최초 1회)
DATABASE_URL="<production-db-url>" npx prisma db push
```

## 주요 기능

- **사용자 인증** — 이메일/비밀번호 회원가입·로그인
- **복식부기 원장** — 계정 관리 (자산/부채/자본/수익/비용), 차변·대변 거래 입력
- **예산 관리** — 월별 비용 예산 설정 및 실적 대비 현황

