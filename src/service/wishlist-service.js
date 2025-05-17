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


const getUserWishlist = async (userId) => {
  userId = validate(userUuidValidation, userId);

  const wishlistItems = await prismaClient.wishlist.findMany({
    where: { userId },
    include: {
      product: {
        include: {
          Review: {
            select: {
              rating: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const productsWithRating = wishlistItems.map(item => {
    const reviews = item.product.Review;
    const ratingAvg = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : 0;

    return {
      id: item.product.id,
      name: item.product.name,
      price: item.product.price,
      imageUrl: item.product.imageUrl,
      category: item.product.category,
      ratingAvg,
      reviewCount: reviews.length
    };
  });

  return {
    data: productsWithRating
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