// import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prismaClient } from '../src/application/database.js';

// const prisma = new PrismaClient();

async function seedAdmin() {
  const adminData = {
    fullName: 'Admin Sawangan',
    email: 'tokosawangan@gmail.com',
    phone: '085227100200',
    password: await bcrypt.hash('sawangan123', 10),
    role: 'ADMIN'
  };

  const existingAdmin = await prismaClient.user.findFirst({
    where: { email: adminData.email }
  });

  if (!existingAdmin) {
    await prismaClient.user.create({ data: adminData });
    console.log('Admin user created');
  }
}

seedAdmin()
  .catch(e => console.error(e))
  .finally(() => prismaClient.$disconnect());