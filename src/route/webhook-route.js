import { Router } from 'express';
import express from 'express';
import paymentController from '../controller/payment-controller.js';

const router = Router();

// Important: Must use express.raw() middleware
router.post('/payment-webhook', 
    express.raw({ type: 'application/json' }),
    paymentController.handlePaymentNotification
);

export default router;