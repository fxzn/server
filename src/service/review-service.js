import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';
import productService from './product-service.js';



const createReview = async (userId, orderId, { productId, rating, comment }) => {
  try {
    return await prismaClient.$transaction(async (prisma) => {
      // Validate order exists and is completed
      const order = await prisma.order.findUnique({
        where: { id: orderId, userId },
        include: { 
          items: {
            where: { productId },
            select: {
              price: true
            }
          }
        }
      });

      if (!order) {
        throw new ResponseError(404, 'Order not found');
      }

      if (order.status !== 'COMPLETED') {
        throw new ResponseError(400, 'Order must be completed before reviewing');
      }

      if (order.items.length === 0) {
        throw new ResponseError(400, 'Product not found in this order');
      }

      // Check for existing review
      const existingReview = await prisma.review.findFirst({
        where: { orderId, productId, userId }
      });

      if (existingReview) {
        throw new ResponseError(400, 'You have already reviewed this product');
      }

      // Create the review
      const newReview = await prisma.review.create({
        data: {
          orderId,
          productId,
          userId,
          rating,
          comment: comment || null,
          purchasedPrice: order.items[0].price
        },
        include: {
          product: {
            select: { name: true, imageUrl: true }
          },
          user: {
            select: { fullName: true, avatar: true }
          }
        }
      });

      // Update product rating stats
      await productService.updateProductRating(productId);

      return {
        ...newReview,
        message: 'Thank you for your review!'
      };
    });
  } catch (error) {
    console.error('Review creation error:', error);
    throw new ResponseError(500, 'Failed to create review', error.message);
  }
};



const completeOrder = async (userId, orderId) => {
  return await prismaClient.$transaction(async (prisma) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId, userId, status: 'SHIPPED' },
      include: { items: true }
    });

    if (!order) {
      throw new ResponseError(404, 
        order ? 'Order cannot be completed from current status' : 'Order not found'
      );
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      },
      include: {
        items: {
          select: {
            productId: true,
            product: {
              select: { name: true }
            }
          }
        }
      }
    });

    return {
      ...updatedOrder,
      message: 'Order completed. You can now review your products.'
    };
  });
};

const getProductReviews = async (productId, { page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  
  const [reviews, total] = await Promise.all([
    prismaClient.review.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            fullName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prismaClient.review.count({ where: { productId } })
  ]);

  return {
    data: reviews,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total
    }
  };
};

export default {
  createReview,
  completeOrder,
  getProductReviews
};