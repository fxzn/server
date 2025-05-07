import multer from 'multer';
import { avatarStorage } from '../middleware/cloudinary-middleware.js';


const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG/JPGPNG/WEBP images are allowed (max 10MB)'), false);
  }
};

export default multer({
  storage: avatarStorage, // Gunakan Cloudinary storage
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});