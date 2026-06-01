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

  // Seed B2B Operator Providers
  console.log(`Seeding B2B Operator Providers...`);
  const { encrypt } = require('../lib/crypto');
  
  const providersToSeed = [
    {
      providerName: 'Laxmi Holidays',
      portalUrl: 'https://lxmi.laxmiholidays.com',
      username: 'lxmi.cheap',
      password: 'lxmicheap546'
    },
    {
      providerName: 'Ram Dalal',
      portalUrl: 'https://rdlh.ticketsimply.com',
      username: 'cheap',
      password: 'cheapdalal546'
    }
  ];

  for (const prov of providersToSeed) {
    const existing = await prisma.provider.findFirst({
      where: { providerName: prov.providerName }
    });

    const encUsername = encrypt(prov.username);
    const encPassword = encrypt(prov.password);

    if (existing) {
      await prisma.provider.update({
        where: { id: existing.id },
        data: {
          portalUrl: prov.portalUrl,
          encryptedUsername: encUsername,
          encryptedPassword: encPassword,
          status: 'active'
        }
      });
      console.log(`Updated provider: ${prov.providerName}`);
    } else {
      await prisma.provider.create({
        data: {
          providerName: prov.providerName,
          portalUrl: prov.portalUrl,
          encryptedUsername: encUsername,
          encryptedPassword: encPassword,
          status: 'active'
        }
      });
      console.log(`Created provider: ${prov.providerName}`);
    }
  }
}

seed()
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
