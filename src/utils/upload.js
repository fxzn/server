import multer from 'multer';
import { productStorage } from '../middleware/cloudinary-middleware.js';

const upload = multer({ 
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    console.log('Uploading file with mimetype:', file.mimetype);
    if (['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpeg/jpg/png files are allowed'), false);
    }
  }
});

export const uploadProductImage = upload.single('image');

// Optional upload version
export const uploadProductImageOptional = (req, res, next) => {
  // Skip if no multipart/form-data content
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    return next();
  }

  // Handle the upload
  upload.single('image')(req, res, (err) => {
    if (err) {
      // Handle specific multer errors
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.message.includes('Unexpected field')) {
        return next(); // Skip if no file was uploaded
      }
      return next(err); // Pass other errors
    }
    next();
  });
};
