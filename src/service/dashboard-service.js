

import { prismaClient } from "../application/database.js";

const getOrderStats = async (filter = {}) => {
  return await prismaClient.order.count({
    where: filter
  });
};

const getProductStats = async () => {
  return await prismaClient.product.count();
};

const getRevenueStats = async (filter = {}) => {
  const result = await prismaClient.order.aggregate({
    _sum: {
      totalAmount: true
    },
    where: {
      ...filter,
      paymentStatus: 'PAID'
    }
  });
  
  return result._sum.totalAmount || 0;
};

const getUserStats = async () => {
  return await prismaClient.user.count();
};


export default {
  getOrderStats,
  getProductStats,
  getRevenueStats,
  getUserStats
};