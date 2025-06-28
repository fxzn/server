/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `Review` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingDistrict" TEXT;

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "deletedAt";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deletedAt";
