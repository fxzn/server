import Joi from 'joi';

export const cartItemValidation = Joi.object({
  productId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().min(1).required()
});

export const updateCartItemValidation = Joi.object({
  quantity: Joi.number().integer().min(1).required()
});