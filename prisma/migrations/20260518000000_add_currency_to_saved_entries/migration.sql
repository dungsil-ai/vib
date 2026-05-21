-- AlterTable: 반복 거래 분개에 통화 및 환율 컬럼 추가
ALTER TABLE "RecurringEntry" ADD COLUMN "currency" TEXT;
ALTER TABLE "RecurringEntry" ADD COLUMN "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1;

-- 기존 데이터 보존: 저장 시점에는 사용자 기준 통화 의미였으므로 소유자 통화로 백필
UPDATE "RecurringEntry" re
SET "currency" = COALESCE(u."currency", 'KRW')
FROM "RecurringTransaction" rt
JOIN "User" u ON u."id" = rt."userId"
WHERE re."recurringTransactionId" = rt."id"
  AND re."currency" IS NULL;

ALTER TABLE "RecurringEntry" ALTER COLUMN "currency" SET NOT NULL;
ALTER TABLE "RecurringEntry" ALTER COLUMN "currency" SET DEFAULT 'KRW';

-- AlterTable: 거래 템플릿 분개에 통화 및 환율 컬럼 추가
ALTER TABLE "TemplateEntry" ADD COLUMN "currency" TEXT;
ALTER TABLE "TemplateEntry" ADD COLUMN "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1;

-- 기존 데이터 보존: 저장 시점에는 사용자 기준 통화 의미였으므로 소유자 통화로 백필
UPDATE "TemplateEntry" te
SET "currency" = COALESCE(u."currency", 'KRW')
FROM "TransactionTemplate" tt
JOIN "User" u ON u."id" = tt."userId"
WHERE te."templateId" = tt."id"
  AND te."currency" IS NULL;

ALTER TABLE "TemplateEntry" ALTER COLUMN "currency" SET NOT NULL;
ALTER TABLE "TemplateEntry" ALTER COLUMN "currency" SET DEFAULT 'KRW';
