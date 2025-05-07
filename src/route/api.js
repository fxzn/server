import { Router } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { logout } from '../controller/user-controller.js';
import upload from '../utils/avatar.js';
import { addItemToCart, clearCart, getCart, removeItemFromCart, updateCartItem } from '../controller/cart-controller.js';
import { searchDestinations } from '../controller/checkout-controller.js';
import { getShippingOptions } from '../controller/checkout-controller.js';
import { checkout } from '../controller/checkout-controller.js';
import { handleMidtransNotification } from '../controller/midtrans-controller.js';
import { cancelUserOrder, getOrderDetails, getOrderTracking, getUserOrders } from '../controller/order-controller.js';
import { completeOrder, createReview, getProductReviews } from '../controller/review-controller.js';
import { addToWishlist, checkProductInWishlist, getWishlist, removeFromWishlist } from '../controller/wishlist-controller.js';
import { changePassword, getProfile, updateProfile, uploadAvatar } from '../controller/profile-controller.js';


const router = Router();
router.use(authMiddleware);


// auth router
router.delete('/api/v1/auth/logout', logout);

// profile router
router.get('/api/v1/profile', getProfile);
router.patch('/api/v1/profile', updateProfile);
router.post('/api/v1/profile/avatar', upload.single('avatar'), uploadAvatar);
router.patch('/api/v1/profile/changepassword', changePassword);


// keranjang router
router.get('/api/v1/cart', getCart);
router.post('/api/v1/cart/items', addItemToCart);
router.patch('/api/v1/cart/items/:productId', updateCartItem);
router.delete('/api/v1/cart/items/:productId', removeItemFromCart);
router.delete('/api/v1/cart', clearCart);

    
// Checkout router
router.post('/api/v1/checkout', checkout);


// Raja ongkir route
router.get('/api/v1/shipping/options', getShippingOptions);
router.get('/api/v1/shipping/destinations', searchDestinations);

// midtrans
router.post('/api/v1/payment/notification', handleMidtransNotification);


// Order route
router.get('/api/v1/orders', getUserOrders);  
router.get('/api/v1/orders/:orderId', getOrderDetails);
router.get('/api/v1/orders/tracking/:orderId', getOrderTracking);



// Review route
router.patch('/api/v1/orders/complete/:orderId', completeOrder);
router.post('/api/v1/orders/cancel/:orderId', cancelUserOrder);
router.post('/api/v1/orders/reviews/:orderId', createReview);
router.get('/api/v1/products/reviews/:productId', getProductReviews);



// Whislist
router.post('/api/v1/wishlist', addToWishlist);
router.delete('/api/v1/wishlist/:productId', removeFromWishlist);
router.get('/api/v1/wishlists', getWishlist);
router.get('/api/v1/wishlist/check/:productId', checkProductInWishlist);

export default router
