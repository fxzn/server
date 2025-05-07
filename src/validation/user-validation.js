import Joi from "joi";
import { v4 as uuid, validate as uuidValidate } from 'uuid';


const uuidValidation = (value, helpers) => {
  if (!uuidValidate(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};


// export const userUuidserValidation = Joi.string().custom(uuidValidation, 'UUID validation').required();
const userUuidValidation = Joi.string().custom(uuidValidation, 'UUID validation').required();

const registerValidation = Joi.object({
    fullName: Joi.string().max(100).required(),
    email: Joi.string().email().max(100).required(),
    phone: Joi.string().max(20).required(),
    password: Joi.string().min(8).max(100).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Password confirmation does not match password'
    })
});

const loginValidation = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});


const forgotPasswordValidation = Joi.object({
  email: Joi.string().email().required()
});

 const resetPasswordValidation = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'Passwords do not match' })
});

// const googleAuthValidation = Joi.object({
//   token: Joi.string().required().messages({
//     'string.empty': 'Google token is required',
//     'any.required': 'Invalid Google token'
//   })
// });

const googleAuthValidation = Joi.object({
  access_token: Joi.string().required().messages({
    'string.empty': 'Google access token is required',
    'any.required': 'Invalid Google access token'
  })
});



export  {
    registerValidation,
    loginValidation,
    userUuidValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    googleAuthValidation

};