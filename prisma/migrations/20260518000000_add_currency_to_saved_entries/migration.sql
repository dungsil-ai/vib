-- AlterTable: 반복 거래 분개에 통화 및 환율 컬럼 추가
ALTER TABLE "RecurringEntry" ADD COLUMN "currency" TEXT;
ALTER TABLE "RecurringEntry" ADD COLUMN "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1;

-- AlterTable: 거래 템플릿 분개에 통화 및 환율 컬럼 추가
ALTER TABLE "TemplateEntry" ADD COLUMN "currency" TEXT;
ALTER TABLE "TemplateEntry" ADD COLUMN "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1;
