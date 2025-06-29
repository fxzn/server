import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';
import komerceService from './komerce-service.js';
import midtransService from './midtrans-service.js';



const createMidtransTransaction = async (order, user) => {
  try {
    // Gunakan ID order dari database sebagai order_id di Midtrans agar mudah dilacak
    const midtransOrderId = order.id;
    // const midtransOrderId = `ORDER-${order.id}-${Date.now()}`;

    // Susun item yang akan ditampilkan di Midtrans
    const itemDetails = order.items.map(item => ({
      id: item.productId,                                // ID produk
      name: item.product.name.substring(0, 50),          // Nama produk (maks 50 karakter)
      price: item.price,                                 // Harga per item
      quantity: item.quantity,                           // Jumlah item
      category: 'General'                                // Kategori (umum)
    }));

    // Tambahkan biaya pengiriman sebagai item tambahan jika ada
    if (order.shippingCost > 0) {
      itemDetails.push({
        id: 'SHIPPING_FEE',
        name: `${order.shipping_name} ${order.service_name} Shipping`, // Nama layanan pengiriman
        price: order.shippingCost,
        quantity: 1,
        category: 'Shipping'
      });
    }

    // Buat parameter transaksi sesuai format Midtrans
    const parameter = {
      transaction_details: {
        order_id: midtransOrderId,         // Gunakan ID order dari database
        gross_amount: order.totalAmount    // Total biaya yang dibayarkan
      },

      // tambahkan metode yang kamu izinkan, selain "credit_card"
      enabled_payments: [
        'gopay',
        'bca_va',
        'permata_va',
        'bank_transfer',
        'indomaret',
        'shopeepay'
      ],
    
    
      item_details: itemDetails,           // Daftar item yang dibeli
      customer_details: {
        first_name: user.fullName?.split(' ')[0] || 'Customer',     // Nama depan
        last_name: user.fullName?.split(' ')[1] || '',              // Nama belakang
        email: user.email,
        phone: user.phone || '',
        billing_address: {
          address: order.shippingAddress,
          city: order.shippingCity,
          postal_code: order.shippingPostCode,
          country_code: 'IDN'
        }
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/orders`,                                 // Redirect setelah selesai
        error: `${process.env.FRONTEND_URL}/orders/${order.id}?status=failed`,        // Redirect jika gagal
        pending: `${process.env.FRONTEND_URL}/orders/${order.id}?status=pending`      // Redirect jika pending
      },
      expiry: {
        unit: 'hours',
        duration: 24                              // Transaksi kedaluwarsa setelah 24 jam
      },
      metadata: {
        internal_order_id: order.id,               // Metadata tambahan (bisa untuk pelacakan internal)
        shipping_subdistrict: matchingSubdistrict.subdistrict_name,
        shipping_district: matchingSubdistrict.district_name,
        shipping_city: matchingSubdistrict.city_name
      }
    };

    // Buat transaksi ke Midtrans menggunakan Snap API
    const transaction = await midtransService.snap.createTransaction(parameter);

    // Kembalikan URL pembayaran dan token Midtrans
    return {
      paymentUrl: transaction.redirect_url,
      token: transaction.token,
      midtransOrderId
    };

  } catch (error) {
    // Jika gagal, lempar error internal server
    throw new ResponseError(500, 'Failed to create payment transaction');
  }
};




const processCheckout = async (userId, checkoutData) => {
  return await prismaClient.$transaction(async (prisma) => {
    // Validasi input shipping
    if (!checkoutData.shippingDistrict || !checkoutData.shippingCity) {
      throw new ResponseError(400, 'Kecamatan dan kota pengiriman harus diisi');
    }

    // Ambil keranjang user
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: true }
    });

    if (!cart?.items?.length) throw new ResponseError(400, 'Cart is empty');

    // Ambil data user dan produk (sama seperti sebelumnya)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, phone: true }
    });

    const productIds = cart.items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));
    const itemsWithPrice = cart.items.map(item => {
      const product = productMap[item.productId];
      if (!product) {
        throw new ResponseError(404, `Product ID ${item.productId} not found`);
      }
      return {
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
        weight: product.weight,
        product: product
      };
    });

    // Validasi stok
    const outOfStockItems = itemsWithPrice.filter(item => item.product.stock < item.quantity);
    if (outOfStockItems.length > 0) {
      throw new ResponseError(400, 'Insufficient stock', {
        outOfStockItems: outOfStockItems.map(item => ({
          productId: item.product.id,
          productName: item.product.name,
          requested: item.quantity,
          available: item.product.stock
        }))
      });
    }

    // Hitung subtotal dan berat
    const subTotal = itemsWithPrice.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalWeight = itemsWithPrice.reduce((sum, item) => sum + item.weight * item.quantity, 0);

    // Fungsi untuk mencari kecamatan yang lebih toleran
const findMatchingSubdistrict = async (subdistrictName, districtName, cityName) => {
  try {
    const response = await komerceService.searchDestinations(subdistrictName);

    console.log('Raw Komerce API Response:', JSON.stringify(response, null, 2));

    if (!response || !response.meta || response.meta.code !== 200 || !Array.isArray(response.data)) {
      throw new ResponseError(500, 'Invalid response from shipping service');
    }

    const normalizedSubdistrict = subdistrictName.toLowerCase().trim();
    const normalizedDistrict = districtName.toLowerCase().trim();
    const normalizedCity = cityName.toLowerCase().trim();

    const match = response.data.find(item => {
      const itemSubdistrict = item.subdistrict_name?.toLowerCase() || '';
      const itemDistrict = item.district_name?.toLowerCase() || '';
      const itemCity = item.city_name?.toLowerCase() || '';

      return (
        itemSubdistrict === normalizedSubdistrict &&
        itemDistrict === normalizedDistrict &&
        itemCity === normalizedCity
      );
    });

    if (!match) {
      throw new ResponseError(404, `Kombinasi '${subdistrictName}', '${districtName}', '${cityName}' tidak cocok`);
    }

    console.log('Found matching subdistrict:', match);
    return match;
  } catch (error) {
    console.error('Error in findMatchingSubdistrict:', error);
    if (error instanceof ResponseError) throw error;
    throw new ResponseError(500, 'Gagal memproses data alamat pengiriman');
  }
};


    // Cari kecamatan yang cocok
    const matchingSubdistrict = await findMatchingSubdistrict(
    checkoutData.shippingSubdistrict,
  checkoutData.shippingDistrict,
  checkoutData.shippingCity
    );

    if (!checkoutData.shippingSubdistrict || !checkoutData.shippingDistrict || !checkoutData.shippingCity) {
  throw new ResponseError(400, 'Subdistrict, district, dan city pengiriman harus diisi');
}

    // if (!matchingSubdistrict) {
    //   throw new ResponseError(404, 
    //     `Kombinasi kecamatan '${checkoutData.shippingDistrict}' dan kota '${checkoutData.shippingCity}' tidak ditemukan`
    //   );
    // }

    // Hitung ongkir menggunakan ID kecamatan
    const shippingOptions = await komerceService.calculateShippingCost({
      shipper_destination_id: process.env.WAREHOUSE_LOCATION_ID,
      receiver_destination_id: matchingSubdistrict.id,
      weight: totalWeight,
      item_value: subTotal,
      courier: checkoutData.courier
    });

    // Validasi layanan pengiriman yang dipilih
    const selectedService = shippingOptions.find(service =>
      service.shipping_name.toLowerCase() === checkoutData.courier.toLowerCase() &&
      service.service_name.toLowerCase() === checkoutData.shippingService.toLowerCase()
    );

    if (!selectedService) {
      const availableServices = shippingOptions.map(s => `${s.shipping_name} - ${s.service_name}`).join(', ');
      throw new ResponseError(400, 
        `Layanan pengiriman yang dipilih tidak tersedia. Pilihan tersedia: ${availableServices}`
      );
    }

    // Kurangi stok produk
    await Promise.all(
      itemsWithPrice.map(item =>
        prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        })
      )
    );

    // Buat order
    const order = await prisma.order.create({
      data: {
        userId,
        items: {
          create: itemsWithPrice.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            productName: item.product.name,
            weight: item.weight
          }))
        },
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: subTotal + selectedService.price,
        customerName: user.fullName,
        customerEmail: user.email,
        customerPhone: user.phone,
        shippingAddress: checkoutData.shippingAddress,
        shippingCity: checkoutData.shippingCity,
        shippingDistrict: checkoutData.shippingDistrict,
        shippingSubdistrict: checkoutData.shippingSubdistrict, // tambahkan field district
        shippingProvince: checkoutData.shippingProvince,
        shippingPostCode: checkoutData.shippingPostCode,
        shippingCost: selectedService.price,
        shipping_name: selectedService.shipping_name,
        service_name: selectedService.service_name,
        estimatedDelivery: selectedService.etd || '1-3 days',
        paymentMethod: checkoutData.paymentMethod,
        shippingSubdistrictId: matchingSubdistrict.subdistrict_id // simpan ID kecamatan untuk referensi
      },
      include: { items: { include: { product: true } } }
    });

    // Kosongkan cart
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    // Buat transaksi Midtrans
    const paymentData = await createMidtransTransaction(order, user);

    return await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentToken: paymentData.token,
        paymentUrl: paymentData.paymentUrl,
        midtransOrderId: paymentData.midtransOrderId
      },
      include: { items: { include: { product: true } } }
    });
  }, {
    maxWait: 20000,
    timeout: 15000
  });
};




export default {
  processCheckout,
};

