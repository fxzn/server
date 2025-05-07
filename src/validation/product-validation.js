import Joi from 'joi';



export const addProductValidation = Joi.object({
  name: Joi.string().max(100).required(),
  price: Joi.number().positive().required(),
  description: Joi.string().required(),
  category: Joi.string().valid("Makanan", "Minuman", "Aksesoris").required(),
  weight: Joi.number().positive().required()
    .messages({
      'number.base': 'Weight must be a number in grams',
      'number.positive': 'Weight must be a positive number',
      'any.required': 'Weight is required'
    }),
  stock: Joi.number().integer().min(0).required(),
  expiryDate: Joi.date().min('now').optional()
    .when('category', {
      is: Joi.string().valid("Makanan", "Minuman"),
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
});


export const productIdValidation = Joi.string().uuid().required();

export const updateProductValidation = Joi.object({
  name: Joi.string().max(100).optional(),
  price: Joi.number().positive().optional(),
  description: Joi.string().optional(),
  imageUrl: Joi.string().uri().optional().forbidden().messages({
    'string.uri': 'Image URL must be a valid URI',
    'any.unknown': 'Use image upload endpoint to change product image'
  }),
  category: Joi.string().valid('Makanan', 'Minuman', 'Aksesoris').optional(),
  weight: Joi.number().positive().optional(),
  stock: Joi.number().integer().min(0).optional(),
  expiryDate: Joi.date().min('now').optional()
    .when('category', {
      is: 'Aksesoris',
      then: Joi.forbidden().messages({
        'any.unknown': 'Aksesoris products cannot have expiryDate'
      }),
      otherwise: Joi.optional()
    })
}).min(1); // Minimal 1 field yang di-update

