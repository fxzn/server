import { prismaClient } from '../application/database.js';
import midtransClient from 'midtrans-client';
import crypto from 'crypto';

const core = new midtransClient.CoreApi({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

const validateSignature = (notification, serverKey) => {
    const signatureKey = notification.signature_key;
    const hash = crypto.createHash('sha512')
        .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`)
        .digest('hex');
    
    return signatureKey === hash;
};

const handlePaymentNotification = async (req, res) => {
    try {
        // Get raw body for signature verification
        const rawBody = req.body.toString();
        const notification = JSON.parse(rawBody);
        
        console.log('Received Midtrans notification:', notification);

        // 1. Validate signature
        if (!validateSignature(notification, process.env.MIDTRANS_SERVER_KEY)) {
            console.error('Invalid signature detected');
            return res.status(401).send('Invalid signature');
        }

        // 2. Verify transaction with Midtrans
        const statusResponse = await core.transaction.notification(notification);
        console.log('Midtrans verification response:', statusResponse);

        // 3. Prepare update data
        const updateData = {
            paymentStatus: mapMidtransStatus(statusResponse.transaction_status),
            paymentMethod: statusResponse.payment_type,
            midtransResponse: JSON.stringify(statusResponse),
            ...(statusResponse.transaction_status === 'settlement' && {
                paidAt: new Date(statusResponse.settlement_time || statusResponse.transaction_time)
            }),
            ...(statusResponse.payment_type.includes('bank_transfer') && {
                paymentVaNumber: statusResponse.va_numbers?.[0]?.va_number || statusResponse.permata_va_number,
                paymentBank: statusResponse.va_numbers?.[0]?.bank || 
                           (statusResponse.payment_type === 'permata' ? 'permata' : null)
            })
        };

        // 4. Update order
        const updatedOrder = await prismaClient.order.update({
            where: { midtransOrderId: statusResponse.order_id },
            data: updateData
        });

        console.log('Updated order:', updatedOrder.id);

        // 5. Create payment log
        await prismaClient.paymentLog.create({
            data: {
                orderId: statusResponse.order_id,
                paymentMethod: statusResponse.payment_type,
                amount: parseFloat(statusResponse.gross_amount),
                status: mapMidtransStatus(statusResponse.transaction_status),
                transactionId: statusResponse.transaction_id,
                paymentTime: new Date(statusResponse.transaction_time),
                ...(statusResponse.transaction_status === 'settlement' && {
                    paidAt: new Date(statusResponse.settlement_time || statusResponse.transaction_time)
                }),
                payload: statusResponse
            }
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Payment notification error:', {
            error: error.message,
            stack: error.stack,
            notification: req.body?.toString()
        });
        res.status(500).send('Error processing notification');
    }
};

const mapMidtransStatus = (status) => {
    const statusMap = {
        'capture': 'PAID',
        'settlement': 'PAID',
        'pending': 'PENDING',
        'deny': 'FAILED',
        'cancel': 'FAILED',
        'expire': 'FAILED',
        'refund': 'REFUNDED',
        'challenge': 'CHALLENGE'
    };
    return statusMap[status] || 'PENDING';
};

export default {
    handlePaymentNotification
};