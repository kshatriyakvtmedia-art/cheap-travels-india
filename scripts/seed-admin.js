require('dotenv').config();
const { prisma } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  console.log(`Seeding Super Admin user...`);
  console.log(`Email: ${email}`);
  console.log(`Password configured in .env: YES`);

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

  // Read operator credentials from environment variables
  const lxmiUser = process.env.LXMI_USERNAME;
  const lxmiPass = process.env.LXMI_PASSWORD;
  const rdlhUser = process.env.RDLH_USERNAME;
  const rdlhPass = process.env.RDLH_PASSWORD;
  const seatSellerUser = process.env.SEATSELLER_USERNAME || '';
  const seatSellerPass = process.env.SEATSELLER_PASSWORD || '';

  if (!lxmiUser || !lxmiPass || !rdlhUser || !rdlhPass) {
    console.error('ERROR: Operator credentials (LXMI_USERNAME, LXMI_PASSWORD, RDLH_USERNAME, RDLH_PASSWORD) must be set in .env');
    process.exit(1);
  }

  const providersToSeed = [
    {
      providerName: 'Laxmi Holidays',
      portalUrl: process.env.LXMI_PORTAL_URL || 'https://lxmi.laxmiholidays.com',
      username: lxmiUser,
      password: lxmiPass
    },
    {
      providerName: 'Ram Dalal',
      portalUrl: process.env.RDLH_PORTAL_URL || 'https://rdlh.ticketsimply.com',
      username: rdlhUser,
      password: rdlhPass
    },
    {
      providerName: 'SeatSeller',
      portalUrl: process.env.SEATSELLER_PORTAL_URL || 'https://in3.seatseller.travel',
      username: seatSellerUser,
      password: seatSellerPass
    }
  ];

  for (const prov of providersToSeed) {
    const existing = await prisma.provider.findFirst({
      where: { providerName: prov.providerName }
    });

    const encUsername = prov.username ? encrypt(prov.username) : null;
    const encPassword = prov.password ? encrypt(prov.password) : null;

    if (existing) {
      await prisma.provider.update({
        where: { id: existing.id },
        data: {
          portalUrl: prov.portalUrl,
          encryptedUsername: encUsername || existing.encryptedUsername,
          encryptedPassword: encPassword || existing.encryptedPassword,
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
