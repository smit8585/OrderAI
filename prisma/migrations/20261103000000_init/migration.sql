CREATE TYPE "PaymentMode" AS ENUM ('COD', 'PREPAID');
CREATE TYPE "AddressStatus" AS ENUM ('VALID', 'AMBIGUOUS', 'UNKNOWN');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CALLING', 'CONFIRMED', 'ADDRESS_UPDATED', 'CANCEL_REQUESTED', 'NO_ANSWER', 'NEEDS_REVIEW');
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'RINGING', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED');
CREATE TYPE "CallOutcome" AS ENUM ('CONFIRMED', 'ADDRESS_CORRECTED', 'CANCEL_ORDER', 'NOT_ANSWERED', 'VOICEMAIL', 'UNCLEAR');
CREATE TYPE "Provider" AS ENUM ('SHIPROCKET', 'VOICE');

CREATE TABLE "Setting" (
  "id" INTEGER NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "autoUpdate" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Connection" (
  "provider" "Provider" NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "secretEnc" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "accountLabel" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Connection_pkey" PRIMARY KEY ("provider")
);

CREATE TABLE "KeyValue" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KeyValue_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "orderName" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "address1" TEXT NOT NULL,
  "address2" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "paymentMode" "PaymentMode" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "channelStatus" TEXT NOT NULL DEFAULT 'New',
  "orderedAt" TIMESTAMP(3) NOT NULL,
  "addressStatus" "AddressStatus" NOT NULL DEFAULT 'UNKNOWN',
  "addressReasons" JSONB NOT NULL DEFAULT '[]',
  "addressSource" TEXT NOT NULL DEFAULT 'check',
  "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
  "isSample" BOOLEAN NOT NULL DEFAULT false,
  "syncState" TEXT NOT NULL DEFAULT 'NONE',
  "syncError" TEXT,
  "originalAddress" JSONB,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_externalId_key" ON "Order"("externalId");
CREATE INDEX "Order_status_orderedAt_idx" ON "Order"("status", "orderedAt");
CREATE INDEX "Order_addressStatus_idx" ON "Order"("addressStatus");

CREATE TABLE "Call" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'WEB',
  "status" "CallStatus" NOT NULL DEFAULT 'INITIATED',
  "outcome" "CallOutcome",
  "language" TEXT,
  "providerCallId" TEXT,
  "toNumber" TEXT,
  "transcript" TEXT,
  "summary" TEXT,
  "extracted" JSONB,
  "recordingUrl" TEXT,
  "durationSec" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Call_providerCallId_key" ON "Call"("providerCallId");
CREATE INDEX "Call_orderId_startedAt_idx" ON "Call"("orderId", "startedAt");
ALTER TABLE "Call" ADD CONSTRAINT "Call_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
