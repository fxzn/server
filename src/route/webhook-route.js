import { Router } from 'express';
import express from 'express';
import paymentController from '../controller/payment-controller.js';

const webhookRouter = Router();

webhookRouter.post('/payment-webhook', 
    express.raw({ type: 'application/json' }),
    paymentController.handlePaymentNotification
);

export default webhookRouter;