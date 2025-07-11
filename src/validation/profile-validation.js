import Joi from 'joi';


const updateProfileValidation = Joi.object({
  fullName: Joi.string().max(100).optional(),
  phone: Joi.string().pattern(/^[0-9]{10,13}$/).optional().allow('').messages({
    'string.pattern.base': 'Phone number must be between 10 to 13 digits and contain only numbers'
  })
});


// const updateProfileValidation = Joi.object({
//   fullName: Joi.string().max(100).optional(),
//   phone: Joi.string().max(20).optional()
// });

const changePasswordValidation = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
    .messages({ 'any.only': 'Passwords do not match' })
});

const avatarValidation = Joi.object({
  avatar: Joi.any()
    .meta({ swaggerType: 'file' })
    .description('Image file (JPEG/PNG/WEBP) max 5MB')
});


export {
  updateProfileValidation,
  changePasswordValidation,
  avatarValidation
}