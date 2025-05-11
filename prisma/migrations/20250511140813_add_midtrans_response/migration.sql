/*
  Warnings:

  - Made the column `payload` on table `PaymentLog` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "midtransResponse" TEXT;

-- AlterTable
ALTER TABLE "PaymentLog" ADD COLUMN     "paidAt" TIMESTAMP(3),
ALTER COLUMN "payload" SET NOT NULL,
ALTER COLUMN "payload" SET DATA TYPE TEXT;
