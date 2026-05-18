-- 월간 집계 및 거래 목록 필터 성능 개선 인덱스
CREATE INDEX "Transaction_userId_date_asc_idx" ON "Transaction"("userId", "date" ASC);
CREATE INDEX "Entry_transactionId_debitAccountId_idx" ON "Entry"("transactionId", "debitAccountId");
CREATE INDEX "Entry_transactionId_creditAccountId_idx" ON "Entry"("transactionId", "creditAccountId");

-- 거래 설명 부분 일치 검색 성능 개선용 trigram 인덱스
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Transaction_description_trgm_idx" ON "Transaction" USING GIN ("description" gin_trgm_ops);
