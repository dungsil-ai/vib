-- 월간 집계 및 거래 목록 필터 성능 개선 인덱스
-- 주의: Prisma 마이그레이션은 PostgreSQL에서 트랜잭션 안에서 실행되므로
-- CREATE INDEX CONCURRENTLY를 사용할 수 없습니다.
-- 대용량 운영 DB에서는 아래 인덱스 생성이 쓰기를 잠시 블로킹할 수 있어
-- 트래픽이 낮은 시간대에 적용하거나, 필요 시 운영 절차에서 별도로 concurrent 생성하세요.
CREATE INDEX "Transaction_userId_date_asc_idx" ON "Transaction"("userId", "date" ASC);
CREATE INDEX "Entry_transactionId_debitAccountId_idx" ON "Entry"("transactionId", "debitAccountId");
CREATE INDEX "Entry_transactionId_creditAccountId_idx" ON "Entry"("transactionId", "creditAccountId");

-- 거래 설명 부분 일치 검색 성능 개선용 trigram 인덱스
-- 전제 조건: infra 단계에서 pg_trgm 확장을 미리 설치해야 합니다.
CREATE INDEX "Transaction_description_trgm_idx" ON "Transaction" USING GIN ("description" gin_trgm_ops);
