import Joi from 'joi';


export const createReviewValidation = Joi.object({
  productId: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/)
    .message('Invalid product ID format'),
    
  rating: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.base': 'Rating must be a number',
      'number.integer': 'Rating must be an integer',
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5',
      'any.required': 'Rating is required'
    }),
    
  comment: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Comment cannot exceed 500 characters'
    })
});

export const getReviewsValidation = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  sort: Joi.string().valid('newest', 'highest', 'lowest').default('newest')
});