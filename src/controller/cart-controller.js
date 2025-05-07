import cartService from '../service/cart-service.js';
import { validate } from '../validation/validation.js';
import { cartItemValidation, updateCartItemValidation } from '../validation/cart-validation.js';

export const getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cart = await cartService.getCart(userId);
    res.status(200).json({
      success: true,
      data: cart
    })
  } catch (error) {
    next(error)
  }
};

export const addItemToCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const request = validate(cartItemValidation, req.body);
    
    const cart = await cartService.addItemToCart(userId, request);
    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const productId = req.params.productId;
    const request = validate(updateCartItemValidation, req.body);
    
    const cart = await cartService.updateCartItem(userId, productId, request);
    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

export const removeItemFromCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const productId = req.params.productId;
    
    const cart = await cartService.removeItemFromCart(userId, productId);
    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await cartService.clearCart(userId);
    
    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    next(error);
  }
};