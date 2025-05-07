import { prismaClient } from '../application/database.js';
import { validate } from '../validation/validation.js';
import { wishlistActionValidation, wishlistQueryValidation } from '../validation/wishlist-validation.js';
import { ResponseError } from '../error/response-error.js';
import { userUuidValidation } from '../validation/user-validation.js';

const addToWishlist = async (userId, productId) => {
  userId = validate(userUuidValidation, userId);
  productId = validate(wishlistActionValidation, { productId }).productId;

  // Cek apakah produk ada
  const product = await prismaClient.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new ResponseError(404, 'Product not found');
  }

  // Cek apakah sudah ada di wishlist
  const existingWishlist = await prismaClient.wishlist.findUnique({
    where: {
      userId_productId: {
        userId,
        productId
      }
    }
  });

  if (existingWishlist) {
    throw new ResponseError(400, 'Product already in wishlist');
  }

  return await prismaClient.wishlist.create({
    data: {
      userId,
      productId
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          ratingAvg: true
        }
      }
    }
  });
};

const removeFromWishlist = async (userId, productId) => {
  userId = validate(userUuidValidation, userId);
  productId = validate(wishlistActionValidation, { productId }).productId;

  const wishlistItem = await prismaClient.wishlist.findUnique({
    where: {
      userId_productId: {
        userId,
        productId
      }
    }
  });

  if (!wishlistItem) {
    throw new ResponseError(404, 'Product not found in wishlist');
  }

  return await prismaClient.wishlist.delete({
    where: {
      userId_productId: {
        userId,
        productId
      }
    }
  });
};

const getUserWishlist = async (userId, query) => {
  userId = validate(userUuidValidation, userId);
  const { page, limit } = validate(wishlistQueryValidation, query);

  const skip = (page - 1) * limit;

  const [wishlist, total] = await Promise.all([
    prismaClient.wishlist.findMany({
      where: { userId },
      skip,
      take: limit,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            imageUrl: true,
            ratingAvg: true,
            reviewCount: true,
            category: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prismaClient.wishlist.count({
      where: { userId }
    })
  ]);

  return {
    data: wishlist.map(item => item.product),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const checkInWishlist = async (userId, productId) => {
  userId = validate(userUuidValidation, userId);
  productId = validate(wishlistActionValidation, { productId }).productId;

  const wishlistItem = await prismaClient.wishlist.findUnique({
    where: {
      userId_productId: {
        userId,
        productId
      }
    }
  });

  return {
    isInWishlist: !!wishlistItem
  };
};

export default {
  addToWishlist,
  removeFromWishlist,
  getUserWishlist,
  checkInWishlist
};