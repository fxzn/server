import { prismaClient } from '../application/database.js';
// import { validate } from '../validation/validation.js';
import { ResponseError } from '../error/response-error.js';

const getCart = async (userId) => {
  return await prismaClient.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true,
              stock: true
            }
          }
        }
      }
    }
  });
};

const addItemToCart = async (userId, request) => {
  // Cek stok produk
  const product = await prismaClient.product.findUnique({
    where: { id: request.productId },
    select: { stock: true }
  });

  if (!product) {
    throw new ResponseError(404, 'Product not found');
  }

  if (product.stock < request.quantity) {
    throw new ResponseError(400, 'Insufficient product stock');
  }

  return await prismaClient.cart.upsert({
    where: { userId },
    create: {
      userId,
      items: {
        create: {
          productId: request.productId,
          quantity: request.quantity
        }
      }
    },
    update: {
      items: {
        upsert: {
          where: {
            cartId_productId: {
              cartId: userId,
              productId: request.productId
            }
          },
          create: {
            productId: request.productId,
            quantity: request.quantity
          },
          update: {
            quantity: {
              increment: request.quantity
            }
          }
        }
      }
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true
            }
          }
        }
      }
    }
  });
};

const updateCartItem = async (userId, productId, request) => {
  // Cek stok produk
  const product = await prismaClient.product.findUnique({
    where: { id: productId },
    select: { stock: true }
  });

  if (!product) {
    throw new ResponseError(404, 'Product not found');
  }

  if (product.stock < request.quantity) {
    throw new ResponseError(400, 'Insufficient product stock');
  }

  // Ambil cartId berdasarkan userId
  const cart = await prismaClient.cart.findUnique({
    where: { userId }
  });

  if (!cart) {
    throw new ResponseError(404, 'Cart not found');
  }

  // Update item-nya
  await prismaClient.cartItem.update({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: productId
      }
    },
    data: {
      quantity: request.quantity
    }
  });

  return await getCart(userId);
};


const removeItemFromCart = async (userId, productId) => {
   // Ambil cart dulu berdasarkan userId
   const cart = await prismaClient.cart.findUnique({
    where: { userId }
  });

  if (!cart) {
    throw new ResponseError(404, 'Cart not found');
  }

  await prismaClient.cartItem.delete({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: productId
      }
    }
  });

  return await getCart(userId);
};

const clearCart = async (userId) => {
    const cart = await prismaClient.cart.findUnique({
        where: { userId }
      });
    
      if (!cart) {
        throw new ResponseError(404, 'Cart not found');
      }
    
      await prismaClient.cartItem.deleteMany({
        where: {
          cartId: cart.id
        }
      });
    };

export default {
  getCart,
  addItemToCart,
  updateCartItem,
  removeItemFromCart,
  clearCart
};