-- 월간 대시보드 조회 경로 최적화를 위한 인덱스 추가/정리
DROP INDEX IF EXISTS "Transaction_userId_date_idx";
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

CREATE INDEX IF NOT EXISTS "Entry_debitAccountId_transactionId_idx" ON "Entry"("debitAccountId", "transactionId");
CREATE INDEX IF NOT EXISTS "Entry_creditAccountId_transactionId_idx" ON "Entry"("creditAccountId", "transactionId");
