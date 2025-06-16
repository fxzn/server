import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { prismaClient } from '../application/database.js';
import jwt from 'jsonwebtoken';
import { validate } from '../validation/validation.js';
import { loginValidation, registerValidation, userUuidValidation,  } from '../validation/user-validation.js';
import { ResponseError } from '../error/response-error.js';
import { sendResetPasswordEmail } from '../utils/email-sender.js';
import { compareTokens, generateResetToken, hashToken } from '../utils/token-utils.js';
import { verifyGoogleToken } from '../utils/google-oauth.js';
import { cloudinary } from '../middleware/cloudinary-middleware.js';
import reviewService from './review-service.js';




const register = async (request) => {
    // Validasi request
    const user = validate(registerValidation, request);
    
    // Cek email sudah terdaftar
    const existingUser = await prismaClient.user.findUnique({
      where: { email: user.email }
    });

    if (existingUser) {
      throw new ResponseError(400, "Email already exists"); // HTTP 400 Bad Request
    }

    // Hash password
    user.password = await bcrypt.hash(user.password, 10);
    
    // Buat user baru
    return await prismaClient.user.create({
      data: {
        id: uuid(),
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        password: user.password,
        provider: 'LOCAL',
        isVerified: false
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        createdAt: true
      }
    });

};


const login = async (request) => {
  // Validasi request
  const loginRequest = validate(loginValidation, request);

  // Cari user
  const user = await prismaClient.user.findUnique({
      where: {
          email: loginRequest.email,
      },
      select: {
          id: true,
          email: true,
          password: true,
          fullName: true,
          phone: true,
          role: true,
          avatar: true,
          provider: true
      }
  });

  if (!user) {
      throw new ResponseError(401, "Email or password wrong");
  }


  // if (user.provider !== 'LOCAL') {
  //   throw new ResponseError(401, `Please login using ${user.provider}`);
  // }


  // Verifikasi password
  const isPasswordValid = await bcrypt.compare(loginRequest.password, user.password);
  if (!isPasswordValid) {
      throw new ResponseError(401, "Email or password wrong");
  }

  // Generate JWT token
  const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
  );

  // Update token di database
  await prismaClient.user.update({
      where: { id: user.id },
      data: { token: token }
  });

  // Return data user + token
  return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      token: token
  };
};


const logout = async (userId) => {
  // Validasi userId
  userId = validate(userUuidValidation, userId);

  // Cek dan update token
  const user = await prismaClient.user.findUnique({
    where: { 
      id: userId,
      // deleteAt: null
    },
    select: { token: true }
  });
  
  if (!user?.token) {
    throw new ResponseError(400, "User already logged out");
  }
  
  const updatedUser = await prismaClient.user.update({
    where: { id: userId },
    data: { token: null }
  });

  // Return dalam format yang diinginkan
  return {
    id: updatedUser.id,
    message: "Logout successful"
  };
};



const forgotPassword = async (email) => {
  const user = await prismaClient.user.findUnique({ 
    where: { 
      email,
      provider: 'LOCAL',
    } 
  });
  
  if (!user) throw new ResponseError(404, "User not found");

  // Generate token dan hash
  const resetToken = generateResetToken();
  const hashedToken = await hashToken(resetToken);
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const expireTime = new Date(Date.now() + 3600000); // 1 jam

  await prismaClient.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: hashedToken, 
      resetPasswordExpire: expireTime
    }
  });

  await sendResetPasswordEmail(email, resetUrl);
};



const resetPassword = async (token, password, confirmPassword) => {
  // 1. Validasi password match
  if (password !== confirmPassword) {
    throw new ResponseError(400, "Password and confirm password do not match");
  }

  // 2. Temukan semua user dengan token yang belum expired
  const users = await prismaClient.user.findMany({
    where: {
      resetPasswordExpire: { gt: new Date() },
    }
  });

  // 3. Cari user dengan token yang match
  let validUser = null;
  for (const user of users) {
    const isMatch = await compareTokens(token, user.resetPasswordToken);
    if (isMatch) {
      validUser = user;
      break;
    }
  }

  if (!validUser) {
    throw new ResponseError(400, "Invalid or expired token");
  }

  // 4. Update password dan clear token
  const hashedPassword = await bcrypt.hash(password, 10);
  await prismaClient.user.update({
    where: { id: validUser.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpire: null
    }
  });
};


const googleAuth = async (googleToken) => {
  try {
    // Verifikasi token Google
    const { name, email, picture } = await verifyGoogleToken(googleToken);

    // Cek apakah email sudah ada
    let user = await prismaClient.user.findUnique({
      where: { 
        email,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        provider: true
      }
    });

    // Jika user belum ada, buat baru
    if (!user) {
      user = await prismaClient.user.create({
        data: {
          id: uuid(),
          email,
          fullName: name || email.split('@')[0], // Default name jika tidak ada
          avatar: picture || null,
          provider: 'GOOGLE',
          role: 'USER',
          isVerified: true
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          provider: true
        }
      });
    } else if (user.provider !== 'GOOGLE') {
      // Jika user sudah ada tapi bukan dari Google
      throw new ResponseError(400, `Email already registered with ${user.provider} provider`);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Update token di database
    await prismaClient.user.update({
      where: { id: user.id },
      data: { token }
    });

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      token,
      provider: user.provider
    };

  } catch (error) {
    // console.error('Google Auth Error:', error);
    throw new ResponseError(401, error.message || 'Google authentication failed');
  }
};



const getAllUsersForAdmin = async () => {
  return await prismaClient.user.findMany({
    where: {
      role: 'USER', // Hanya ambil data USER biasa
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
      provider: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};



const deleteUser = async (userId) => {
  // Validasi input
  userId = validate(userUuidValidation, userId);

  // Cek apakah user ada dan dapatkan semua relasinya
  const user = await prismaClient.user.findUnique({
    where: { 
      id: userId,
    },
    include: {
      products: {
        select: {
          id: true,
          imageUrl: true
        }
      },
      carts: {
        include: {
          items: true
        }
      },
      orders: {
        include: {
          items: true,
          paymentLogs: true,
          reviews: true
        }
      },
      reviews: true
    }
  });

  if (!user) {
    throw new ResponseError(404, 'User not found');
  }

  // Soft delete semua review yang dibuat user
  await reviewService.deleteReviewsByUser(userId);

  // Hapus semua gambar produk yang dimiliki user
  for (const product of user.products) {
    if (product.imageUrl) {
      const publicId = product.imageUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`product_images/${publicId}`);
    }
  }

  // if (user.products.length > 0) {
  //   for (const product of user.products) {
  //     if (product.imageUrl) {
  //       const publicId = product.imageUrl.split('/').pop().split('.')[0];
  //       await cloudinary.uploader.destroy(`product_images/${publicId}`);
  //     }
  //   }
  // }

  // Hapus semua cart items dan carts
  if (user.carts.length > 0) {
    // Delete cart items first
    await prismaClient.cartItem.deleteMany({
      where: {
        cartId: {
          in: user.carts.map(cart => cart.id)
        }
      }
    });
    
    // Then delete the carts
    await prismaClient.cart.deleteMany({
      where: {
        userId: userId
      }
    });
  }

  // Hapus semua order-related data
  await prismaClient.paymentLog.deleteMany({
    where: { orderId: { 
      in: user.orders.map(o => o.id) 
    }}
  });

  await prismaClient.orderItem.deleteMany({
    where: { orderId: { 
      in: user.orders.map(o => o.id) 
    }}
  });

  await prismaClient.review.deleteMany({
    where: { orderId: { 
      in: user.orders.map(o => o.id) } }
  });

  await prismaClient.order.deleteMany({
    where: { 
      userId
    }
  });

  // if (user.orders.length > 0) {
  //   // Delete payment logs first
  //   await prismaClient.paymentLog.deleteMany({
  //     where: {
  //       orderId: {
  //         in: user.orders.map(order => order.id)
  //       }
  //     }
  //   });

  //   // Delete order items
  //   await prismaClient.orderItem.deleteMany({
  //     where: {
  //       orderId: {
  //         in: user.orders.map(order => order.id)
  //       }
  //     }
  //   });

  //   // Delete order reviews
  //   await prismaClient.review.deleteMany({
  //     where: {
  //       orderId: {
  //         in: user.orders.map(order => order.id)
  //       }
  //     }
  //   });

  //   // Finally delete the orders
  //   await prismaClient.order.deleteMany({
  //     where: {
  //       userId: userId
  //     }
  //   });
  // }

  // hapus reviews yang dibuat user
  // await prismaClient.review.deleteMany({
  //   where: { userId }
  // });


  // if (user.reviews.length > 0) {
  //   await prismaClient.review.deleteMany({
  //     where: {
  //       userId: userId
  //     }
  //   });
  // }

  // hapus user soft delete
  // await prismaClient.user.update({
  //   where: { id: userId },
  //   data: { deletedAt: new Date() }
  // });
  await prismaClient.user.delete({
    where: { id: userId }
  });

  return {
    id: userId,
    message: 'User and all associated data deleted successfully'
  };
};


export default {
  register,
  login,
  // loginAdmin,
  logout,
  forgotPassword,
  resetPassword,
  googleAuth,
  getAllUsersForAdmin,
  deleteUser
}