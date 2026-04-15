-- AlterTable: User에 기본 통화 컬럼 추가
ALTER TABLE "User" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KRW';

-- AlterTable: Account에 통화 컬럼 추가
ALTER TABLE "Account" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KRW';

-- AlterTable: Entry에 통화 및 환율 컬럼 추가
ALTER TABLE "Entry" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KRW';
ALTER TABLE "Entry" ADD COLUMN "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1;
