ALTER TABLE "Order" ADD COLUMN "orderSeq" BIGINT;
UPDATE "Order" SET "orderSeq" = NULLIF(LEFT(regexp_replace("orderName", '\D', '', 'g'), 18), '')::bigint;
CREATE INDEX "Order_orderSeq_idx" ON "Order"("orderSeq");
