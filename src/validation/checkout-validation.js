import Joi from 'joi';


export const checkoutValidation = Joi.object({
  shippingAddress: Joi.string().required().min(10).max(255),
  shippingCity: Joi.string().required(),
  shippingProvince: Joi.string().required(),
  shippingPostCode: Joi.string().required().pattern(/^\d+$/),
  destinationId: Joi.string().required().pattern(/^\d+$/),
  shippingService: Joi.string().required(),
  courier: Joi.string().required(),
  notes: Joi.string().max(500).optional()
}).options({ abortEarly: false });
