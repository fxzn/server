import axios from 'axios';
import { ResponseError } from '../error/response-error.js';

class KomerceService {
  constructor() {
    this.apiKey = process.env.KOMERCE_API_KEY_SHIPPING_DELIVERY;
    this.baseUrl = process.env.KOMERCE_API_URL;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: { 
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 8000 
    });
  }

  async searchDestinations(keyword) {
    try {
      if (!keyword || keyword.trim().length < 3) {
        throw new ResponseError(400, 'Keyword must be at least 3 characters');
      }
  
      console.log('Requesting Komerce API with params:', {
        keyword: keyword.trim(),
        apiKey: this.apiKey ? 'exists' : 'missing'
      });
  
      const response = await this.axiosInstance.get('/tariff/api/v1/destination/search', {
        params: { 
          keyword: keyword.trim() 
        }
      });
  
      if (!response.data) {
        throw new ResponseError(500, 'Empty response from Komerce API');
      }
  
      if (response.data.success === false) {
        throw new ResponseError(
          response.data.code || 400,
          response.data.message || 'API request failed',
          { apiResponse: response.data }
        );
      }
  
      if (!response.data.data) {
        throw new ResponseError(404, 'No destination data found');
      }
  
      return response.data.data;
    } catch (error) {
      console.error('KOMERCE API ERROR DETAILS:', {
        errorMessage: error.message,
        stack: error.stack,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
        requestConfig: {
          url: error.config?.url,
          headers: error.config?.headers
        }
      });
  
      throw new ResponseError(
        error.response?.status || 500,
        `Failed to search destinations: ${error.response?.data?.message || error.message}`,
        {
          apiError: error.response?.data,
          internalDetails: error.message
        }
      );
    }
  }

  async calculateShippingCost(params) {
    try {
      if (!params.shipper_destination_id || !params.receiver_destination_id || !params.weight) {
        throw new ResponseError(400, 'Missing required parameters');
      }

      console.log('Sending request to Komerce API with:', {
        params,
        headers: this.axiosInstance.defaults.headers
      });

          // Pastikan berat dalam kg dengan 2 desimal
    const weightInKg = parseFloat(params.weight).toFixed(2);


      const response = await this.axiosInstance.get('/tariff/api/v1/calculate', {
        params: {
          shipper_destination_id: params.shipper_destination_id,
          receiver_destination_id: params.receiver_destination_id,
          weight: weightInKg,
          item_value: params.item_value || 0,
          cod: params.cod ? 'yes' : 'no',
          origin_pin_point: params.origin_pin_point || '',
          destination_pin_point: params.destination_pin_point || ''
        }
      });

      console.log('Raw response from Komerce:', JSON.stringify(response.data, null, 2));

      if (!response.data || typeof response.data !== 'object') {
        throw new ResponseError(502, 'Invalid API response structure');
      }

      if (response.data.success === false) {
        throw new ResponseError(
          response.data.code || 400,
          response.data.message || 'API request failed',
          response.data
        );
      }

      if (!response.data.data?.calculate_reguler) {
        throw new ResponseError(404, 'No shipping options available');
      }

      // Transform data exactly as received from API
      return response.data.data.calculate_reguler.map(service => ({
        shipping_name: service.shipping_name,
        service_name: service.service_name,
        price: service.shipping_cost,
        etd: service.etd,
        cod_available: service.is_cod,
        shipping_cost: service.shipping_cost,
        shipping_cost_net: service.shipping_cost_net,
        grandtotal: service.grandtotal
      }));

    } catch (error) {
      console.error('Shipping Calculation Error Details:', {
        error: {
          message: error.message,
          stack: error.stack,
          response: error.response?.data
        },
        requestParams: params
      });

      throw new ResponseError(
        error.response?.status || 500,
        `Failed to calculate shipping: ${error.message}`,
        {
          apiResponse: error.response?.data,
          internalError: error.message
        }
      );
    }
  }
}

export default new KomerceService();