import { prismaClient } from '../application/database.js';
import midtransClient from 'midtrans-client';

const validateMidtransNotification = (notification) => {
    // Validasi signature untuk keamanan
    const crypto = require('crypto');
    const signatureKey = notification.signature_key;
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    
    const expectedSignature = crypto.createHash('sha512')
        .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`)
        .digest('hex');
        
    if (signatureKey !== expectedSignature) {
        throw new Error('Invalid Midtrans signature');
    }
};

const handlePaymentNotification = async (req, res) => {
    try {
        const notification = req.body;
        
        // Validasi notifikasi
        validateMidtransNotification(notification);
        
        // Core API untuk verifikasi status
        const core = new midtransClient.CoreApi({
            isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
            serverKey: process.env.MIDTRANS_SERVER_KEY,
            clientKey: process.env.MIDTRANS_CLIENT_KEY
        });
        
        // Verifikasi status transaksi langsung ke Midtrans
        const statusResponse = await core.transaction.notification(notification);
        
        // Data yang akan diupdate
        const updateData = {
            paymentStatus: mapMidtransStatus(statusResponse.transaction_status),
            paymentMethod: statusResponse.payment_type,
            midtransResponse: JSON.stringify(statusResponse)
        };
        
        // Set paidAt jika pembayaran berhasil
        if (statusResponse.transaction_status === 'settlement') {
            updateData.paidAt = new Date(statusResponse.settlement_time || statusResponse.transaction_time);
        }
        
        // Set VA number jika metode pembayaran VA
        if (statusResponse.payment_type.includes('bank_transfer')) {
            updateData.paymentVaNumber = statusResponse.va_numbers?.[0]?.va_number || statusResponse.permata_va_number;
            updateData.paymentBank = statusResponse.va_numbers?.[0]?.bank || 
                                    (statusResponse.payment_type === 'permata' ? 'permata' : null);
        }
        
        // Update order di database
        await prismaClient.order.update({
            where: { midtransOrderId: statusResponse.order_id },
            data: updateData
        });
        
        // Buat payment log
        await prismaClient.paymentLog.create({
            data: {
                orderId: statusResponse.order_id,
                paymentMethod: statusResponse.payment_type,
                amount: parseFloat(statusResponse.gross_amount),
                status: mapMidtransStatus(statusResponse.transaction_status),
                transactionId: statusResponse.transaction_id,
                paymentVaNumber: updateData.paymentVaNumber,
                paymentTime: new Date(statusResponse.transaction_time),
                paidAt: updateData.paidAt,
                payload: statusResponse
            }
        });
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling payment notification:', error);
        res.status(400).send('Error processing notification');
    }
};

// Mapping status Midtrans ke status internal
const mapMidtransStatus = (midtransStatus) => {
    switch (midtransStatus) {
        case 'capture':
        case 'settlement':
            return 'PAID';
        case 'pending':
            return 'PENDING';
        case 'deny':
        case 'cancel':
        case 'expire':
            return 'FAILED';
        case 'refund':
            return 'REFUNDED';
        case 'challenge':
            return 'CHALLENGE';
        default:
            return 'PENDING';
    }
};

export default {
    handlePaymentNotification
};