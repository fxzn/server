import axios from 'axios';
import { ResponseError } from '../error/response-error.js';

class KomerceService {
  constructor(axiosInstance = null) {
    // Mengambil API key dan base URL dari environment variable
    this.apiKey = process.env.KOMERCE_API_KEY_SHIPPING_DELIVERY;
    this.baseUrl = process.env.KOMERCE_API_URL;

    // Inisialisasi axios instance jika belum ada, dengan konfigurasi default
    this.axiosInstance = axiosInstance || axios.create({
      baseURL: this.baseUrl,
      headers: { 
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 20000 // Timeout request dalam 20 detik
    });
  }

  // Fungsi untuk mencari daftar tujuan pengiriman berdasarkan keyword
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
      params: { keyword: keyword.trim() }
    });

    console.log("Full Komerce response:", JSON.stringify(response.data, null, 2));

    // ✅ Perubahan utama: Kembalikan response.data langsung TANPA transformasi
    return response.data;

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


  // Fungsi untuk menghitung ongkos kirim berdasarkan parameter tertentu
async calculateShippingCost(params) {
  try {
    // Validate required parameters
    const requiredParams = ['shipper_destination_id', 'receiver_destination_id', 'weight', 'courier'];
    const missingParams = requiredParams.filter(param => !params[param]);
    
    if (missingParams.length > 0) {
      throw new ResponseError(400, `Missing required parameters: ${missingParams.join(', ')}`);
    }

    console.log('Sending shipping calculation request to Komerce API:', {
      params: {
        shipper_destination_id: params.shipper_destination_id,
        receiver_destination_id: params.receiver_destination_id,
        weight: params.weight,
        item_value: params.item_value || 0,
        courier: params.courier,
        cod: params.cod || false,
        origin_pin_point: params.origin_pin_point || '',
        destination_pin_point: params.destination_pin_point || ''
      }
    });

    const weightInKg = parseFloat(params.weight).toFixed(2);

    const response = await this.axiosInstance.get('/tariff/api/v1/calculate', {
      params: {
        shipper_destination_id: params.shipper_destination_id,
        receiver_destination_id: params.receiver_destination_id,
        weight: weightInKg,
        item_value: params.item_value || 0,
        courier: params.courier.toLowerCase(),
        cod: params.cod ? 'yes' : 'no',
        origin_pin_point: params.origin_pin_point || '',
        destination_pin_point: params.destination_pin_point || ''
      }
    });

    console.log('Raw Komerce API response:', JSON.stringify(response.data, null, 2));

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

    // MODIFIED: Remove the .filter(service => service.available) since the API doesn't include this field
    const availableServices = response.data.data.calculate_reguler
      .map(service => ({
        shipping_name: service.shipping_name,
        service_name: service.service_name,
        price: service.shipping_cost,
        etd: service.etd,
        cod_available: service.is_cod,
        shipping_cost: service.shipping_cost,
        shipping_cost_net: service.shipping_cost_net,
        grandtotal: service.grandtotal,
        service_code: service.service_code || service.service_name // Fallback to service_name if code not available
      }));

    // MODIFIED: Only throw error if array is completely empty
    if (availableServices.length === 0) {
      throw new ResponseError(404, 'No shipping services available for the selected parameters');
    }

    return availableServices;

  } catch (error) {
    console.error('Shipping calculation failed:', {
      error: {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      },
      requestParams: params,
      timestamp: new Date().toISOString()
    });

    if (error instanceof ResponseError) {
      throw error;
    }

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

async getValidDestinationId({ districtName, cityName }) {
  const destinations = await this.searchDestinations(districtName);

  console.log('Destinations result:', destinations);

  const matched = destinations.find(dest => {
    return (
      dest.district_name?.toLowerCase() === districtName.toLowerCase() &&
      dest.city_name?.toLowerCase().includes(cityName.toLowerCase())
    );
  });

  if (!matched || !matched.id) {
    throw new ResponseError(400, 'Kecamatan tidak cocok dengan kota yang dipilih');
  }

  return matched.id;
}


}

// Inisialisasi instance default dari KomerceService untuk langsung digunakan
const defaultKomerceService = new KomerceService();

// Mengekspor instance default dan juga kelas KomerceService untuk fleksibilitas penggunaan
export default defaultKomerceService;
export { KomerceService };
