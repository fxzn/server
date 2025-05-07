import { Router } from 'express';
import { adminMiddleware, authMiddleware } from '../middleware/auth-middleware.js';
import { deleteUser, getAllUsersForAdmin } from '../controller/user-controller.js';
import { addProduct, deleteProduct, updateProduct } from '../controller/product-controller.js';
import { uploadProductImageOptional } from '../utils/upload.js';
import { adminDeleteOrder, adminUpdateOrder } from '../controller/order-controller.js';




const adminRouter = Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);

adminRouter.get('/api/v1/admin/users', getAllUsersForAdmin);
adminRouter.delete('/api/v1/admin/users/:id', deleteUser);
adminRouter.post('/api/v1/admin/products', addProduct);
adminRouter.patch('/api/v1/admin/products/:id', uploadProductImageOptional, updateProduct);
adminRouter.delete('/api/v1/admin/products/:id', deleteProduct);
adminRouter.patch('/api/v1/admin/orders/:orderId', adminUpdateOrder);
adminRouter.delete('/api/v1/admin/orders/:orderId', adminDeleteOrder);



export default adminRouter;