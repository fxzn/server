import Joi from 'joi';

// Common UUID validation pattern
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const orderQueryValidation = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10)
});

export const orderAdminUpdateValidation = Joi.object({
  status: Joi.string()
    .valid('PENDING', 'PACKAGED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
    .required(),
  trackingNumber: Joi.string()
    .pattern(/^[A-Za-z0-9]{10,20}$/)
    .message('Nomor resi harus 10-20 karakter alfanumerik')
    .when('status', {
      is: 'SHIPPED',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
}).options({ abortEarly: false });

export const orderTrackingValidation = {
  orderId: Joi.string().required()
};

export const orderIdValidation = Joi.string()
  .pattern(uuidPattern)
  .required()
  .messages({
    'string.pattern.base': 'Order ID must be a valid UUID format',
    'any.required': 'Order ID is required'
  });
