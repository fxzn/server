-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentBank" TEXT,
ADD COLUMN     "paymentVaNumber" TEXT;

-- AlterTable
ALTER TABLE "PaymentLog" ADD COLUMN     "paymentTime" TIMESTAMP(3),
ADD COLUMN     "paymentVaNumber" TEXT;
