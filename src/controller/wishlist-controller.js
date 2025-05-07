import wishlistService from '../service/wishlist-service.js';

export const addToWishlist = async (req, res, next) => {
  try {
    const result = await wishlistService.addToWishlist(
      req.user.id,
      req.body.productId
    );
    
    res.status(201).json({
      success: true,
      data: result.product
    });
  } catch (error) {
    next(error);
  }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    await wishlistService.removeFromWishlist(
      req.user.id,
      req.params.productId
    );
    
    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist'
    });
  } catch (error) {
    next(error);
  }
};

export const getWishlist = async (req, res, next) => {
  try {
    const result = await wishlistService.getUserWishlist(
      req.user.id,
      req.query
    );
    
    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};

export const checkProductInWishlist = async (req, res, next) => {
  try {
    const result = await wishlistService.checkInWishlist(
      req.user.id,
      req.params.productId
    );
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};