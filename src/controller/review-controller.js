import { validate } from '../validation/validation.js';
import reviewService from '../service/review-service.js';
import { 
  createReviewValidation,
  getReviewsValidation 
} from '../validation/review-validation.js';
import { ResponseError } from '../error/response-error.js';


export const createReview = async (req, res, next) => {
  try {
    if (!req.body) {
      throw new ResponseError(400, 'Request body is required');
    }

    const userId = req.user.id;
    const orderId = req.params.orderId;
    const request = validate(createReviewValidation, req.body);
    
    const review = await reviewService.createReview(userId, orderId, request);

    res.status(201).json({
      status: 'success',
      data: review
    });
  } catch (error) {
    console.error('Controller error:', error);
    next(error);
  }
};

export const completeOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.orderId;
    
    const result = await reviewService.completeOrder(userId, orderId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

export const getProductReviews = async (req, res, next) => {
  try {
    const productId = req.params.productId;
    const query = validate(getReviewsValidation, req.query);
    
    const result = await reviewService.getProductReviews(productId, query);

    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};