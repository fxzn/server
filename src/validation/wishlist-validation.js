import Joi from 'joi';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const wishlistActionValidation = Joi.object({
  productId: Joi.string()
    .pattern(uuidPattern)
    .required()
    .messages({
      'string.pattern.base': 'Product ID must be a valid UUID',
      'any.required': 'Product ID is required'
    })
});

export const wishlistQueryValidation = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(50).default(10)
});