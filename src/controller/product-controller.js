import productService from '../service/product-service.js';
import { uploadProductImage } from '../utils/upload.js';
import { cloudinary } from '../middleware/cloudinary-middleware.js';
import { ResponseError } from '../error/response-error.js';
import { validate } from '../validation/validation.js';
import { productIdValidation, updateProductValidation } from '../validation/product-validation.js';


export const addProduct = [
  uploadProductImage,
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new Error('Product image is required');
      }

      console.log('Raw request body:', JSON.stringify(req.body, null, 2));
      console.log('Raw weight:', req.body.weight, 'Type:', typeof req.body.weight);

      // Konversi gram ke kilogram (dibagi 1000)
      const weightInGrams = parseFloat(req.body.weight);
      if (isNaN(weightInGrams)) {
        throw new Error('Weight must be a valid number');
      }
      // const weightInKg = weightInGrams / 1000;

      const cleanBody = {
        ...req.body,
        weight: weightInGrams, // Simpan dalam gram
        price: parseFloat(req.body.price),
        stock: parseInt(req.body.stock, 10),
      };

       // Jika kategori Aksesoris, hapus expiryDate dari body
       if (req.body.category === 'Aksesoris') {
        delete cleanBody.expiryDate;
      }
      
      console.log('Processed body:', cleanBody);

      const result = await productService.addProduct(
        req.user.id,
        cleanBody,
        req.file
      );

      res.status(201).json({
        success: true,
        data: {
          ...result,
          weightInGrams: weightInGrams, // Tambahkan berat dalam gram di response
          weightInKg: result.weight // Berat dalam kg dari database
        }
      });
    } catch (error) {
      if (req.file?.path) {
        await cloudinary.uploader.destroy(req.file.filename); 
      }
      next(error);
    }
  }
];



export const getAllProducts = async (req, res, next) => {
  try {
    const products = await productService.getAllProducts(req.body);
    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    next(error);
  }
};


export const getProductById = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      throw new ResponseError(404, "Product not found");
    }
    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};



// export const updateProduct = async (req, res, next) => {
//   try {
//     const productId = validate(productIdValidation, req.params.id);
//     const request = validate(updateProductValidation, req.body);

//     if (req.body.imageUrl) {
//       throw new ResponseError(400, "Use image upload to change product image");
//     }

//     const result = await productService.updateProduct(
//       productId,
//       request,
//       req.file
//     );

//     res.status(200).json({
//       success: true,
//       data: result
//     });
//   } catch (error) {
//     if (req.file?.path) {
//       await cloudinary.uploader.destroy(req.file.filename);
//     }
//     next(error);
//   }
// };

export const updateProduct = async (req, res, next) => {
  try {
    // Hapus validasi ganda, cukup validasi di service saja
    const productId = req.params.id;
    const request = req.body;

    // Debugging log
    console.log('Product ID:', productId);
    console.log('Request body:', request);
    console.log('Uploaded file:', req.file);

    const result = await productService.updateProduct(
      productId,
      request,
      req.file // File akan dihandle oleh middleware
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    // Cleanup file jika error
    if (req.file?.path) {
      await cloudinary.uploader.destroy(req.file.filename);
    }
    next(error);
  }
};




export const deleteProduct = async (req, res, next) => {
  try {
    const productId = validate(productIdValidation, req.params.id);
    const result = await productService.deleteProduct(productId);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};