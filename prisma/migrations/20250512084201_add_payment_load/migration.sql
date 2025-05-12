/*
  Warnings:

  - The `payload` column on the `PaymentLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "PaymentLog" DROP COLUMN "payload",
ADD COLUMN     "payload" JSONB;
