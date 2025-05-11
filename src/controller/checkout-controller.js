import { ResponseError } from '../error/response-error.js';
import checkoutService from '../service/checkout-service.js';
import komerceService from '../service/komerce-service.js';
import { checkoutValidation } from '../validation/checkout-validation.js';
import { validate } from '../validation/validation.js';



export const checkout = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const request = validate(checkoutValidation, req.body);
    const order = await checkoutService.processCheckout(userId, request);
    
    res.status(201).json({
      success: true,
      data: {
        ...order,
        paymentToken: undefined // Hide sensitive data
      }
    });
  } catch (error) {
    next(error);
  }
};


// controller/checkout-controller.js
export const getShippingOptions = async (req, res, next) => {
  try {
    // Validasi dan parse parameter
    
    const { 
      shipper_destination_id,
      receiver_destination_id,
      weight,
      item_value = 0,
      cod = 'no'
    } = req.query;

    if (!shipper_destination_id || !receiver_destination_id || !weight) {
      throw new ResponseError(400, 'Missing required parameters');
    }

    // Parse nilai
    const params = {
      shipper_destination_id,
      receiver_destination_id,
      weight: parseFloat(weight),
      item_value: parseInt(item_value) || 0,
      cod: cod === 'yes'
    };

    // Debug log
    console.log('Process shipping options with:', params);

    const options = await komerceService.calculateShippingCost(params);

    res.json({
      success: true,
      data: options,
      meta: {
        currency: 'IDR',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // Format error response
    const statusCode = error.status || 500;
    const errorData = {
      code: error.code || 'SHIPPING_CALCULATION_ERROR',
      message: error.message,
      ...(error.details && { details: error.details })
    };

    console.error(`Shipping Options Error [${statusCode}]:`, errorData);

    res.status(statusCode).json({
      success: false,
      error: errorData
    });
  }
};




export const searchDestinations = async (req, res, next) => {
  try {
    const { keyword } = req.query;

    // Validasi lebih ketat
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length < 3) {
      throw new ResponseError(400, 'Keyword must be a string with at least 3 characters')
      // return res.status(400).json({
      //   success: false,
      //   error: {
      //     code: 'INVALID_INPUT',
      //     message: 'Keyword must be a string'
      //   }
      // });
    }

    const results = await komerceService.searchDestinations(keyword.trim());

    // Response format konsisten
    return res.json({
      success: true,
      data: results,
      meta: {
        searchedKeyword: keyword.trim,
        resultCount: results.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // Error handling lebih terstruktur
    const statusCode = error.status || 500;
    const errorResponse = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message,
        ...(error.details && { details: error.details })
      }
    };

    console.error(`[${new Date().toISOString()}] Destination Search Error:`, {
      query: req.query,
      statusCode,
      error: error.stack
    });

    return res.status(statusCode).json(errorResponse);
  }
};

export const handleMidtransNotification = async (req, res, next) => {
  try {
    // Log raw body untuk debugging
    console.log('[Midtrans] Raw Request Body:', req.body);

    // Handle content-type yang berbeda
    let notification;
    if (req.headers['content-type'] === 'application/json') {
      notification = req.body;
    } else {
      // Handle x-www-form-urlencoded jika diperlukan
      notification = JSON.parse(JSON.stringify(req.body));
    }

    const result = await checkoutService.handlePaymentNotification(notification);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Midtrans] Notification Error:', {
      headers: req.headers,
      body: req.body,
      error: error.stack
    });
    
    // Return 200 ke Midtrans meskipun error (untuk menghindari retry)
    res.status(200).json({
      success: false,
      message: 'Notification processed with errors',
      error: error.message
    });
  }
};