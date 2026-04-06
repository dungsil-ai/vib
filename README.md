# vib — 복식부기 가계부

Next.js + Prisma + NextAuth.js 기반의 복식부기(Double-Entry Bookkeeping) 가계부 웹 애플리케이션입니다.

## 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 만들고, 각 값을 설정하세요.

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | SQLite 파일 경로 (예: `file:./dev.db`) |
| `NEXTAUTH_SECRET` | JWT 서명용 비밀 키 (`openssl rand -base64 32` 으로 생성) |
| `NEXTAUTH_URL` | 앱의 기본 URL (예: `http://localhost:3000`) |

## 시작하기

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 NEXTAUTH_SECRET 등을 설정하세요

# 3. 데이터베이스 생성
npm run db:push

# 4. 개발 서버 실행
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 주요 기능

- **사용자 인증** — 이메일/비밀번호 회원가입·로그인
- **복식부기 원장** — 계정 관리 (자산/부채/자본/수익/비용), 차변·대변 거래 입력
- **예산 관리** — 월별 비용 예산 설정 및 실적 대비 현황
