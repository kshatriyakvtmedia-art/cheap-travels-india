require('dotenv').config();
const { prisma } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@cheaptravels.in';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';

  console.log(`Seeding Super Admin user...`);
  console.log(`Email: ${email}`);
  console.log(`Password configured in .env: ${password ? 'YES' : 'NO'}`);

  const hashedPassword = await hashPassword(password);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      role: 'super_admin'
    },
    create: {
      email,
      name: 'Super Admin',
      passwordHash: hashedPassword,
      role: 'super_admin',
      mobile: '9999999999'
    }
  });

  console.log(`Super Admin user seeded successfully:`, adminUser);
}

seed()
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
