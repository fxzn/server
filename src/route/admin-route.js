import { Router } from 'express';
import { adminMiddleware, authMiddleware } from '../middleware/auth-middleware.js';
import { deleteUser, getAllUsersForAdmin } from '../controller/user-controller.js';
import { addProduct, deleteProduct, updateProduct } from '../controller/product-controller.js';
import { uploadProductImageOptional } from '../utils/upload.js';
import { adminDeleteOrder, adminUpdateOrder, getAllOrdersAdmin, getOrderDetailAdmin } from '../controller/order-controller.js';
import { getOrderStats, getProductStats, getRevenueStats, getUserStats } from '../controller/dashboard-controller.js';




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
adminRouter.get('/api/v1/admin/orders', getAllOrdersAdmin);
adminRouter.get('/api/v1/admin/orders/:orderId', getOrderDetailAdmin);


adminRouter.get('/api/v1/admin/dashboard/orders', getOrderStats);
adminRouter.get('/api/v1/admin/dashboard/products', getProductStats);
adminRouter.get('/api/v1/admin/dashboard/revenue', getRevenueStats);
adminRouter.get('/api/v1/admin/dashboard/users', getUserStats);



export default adminRouter;