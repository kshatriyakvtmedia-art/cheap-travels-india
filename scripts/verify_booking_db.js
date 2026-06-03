const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  console.log('--- STARTING E2E BACKEND & DATABASE INTEGRATION TEST ---');
  const testMobile = '9999999999';
  const testMobileE164 = '+919999999999';
  
  // 1. Authenticate via /api/auth/firebase mock token bypass
  console.log('\n[Step 1] Authenticating with mock ID token...');
  const authResponse = await fetch('http://localhost:3000/api/auth/firebase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: `mock_firebase_id_token_for_${testMobile}`
    })
  });
  
  const authData = await authResponse.json();
  if (!authResponse.ok || !authData.success) {
    throw new Error(`Authentication failed: ${JSON.stringify(authData)}`);
  }
  console.log('✓ Authentication successful. User info:', authData.user);
  
  // Extract cti_access cookie from response headers
  const setCookieHeaders = authResponse.headers.get('set-cookie');
  let ctiAccessCookie = '';
  if (setCookieHeaders) {
    const match = setCookieHeaders.match(/cti_access=([^;]+)/);
    if (match) {
      ctiAccessCookie = match[1];
      console.log('✓ Extracted cti_access token cookie.');
    }
  }

  // 2. Create a "held" booking order via /api/booking/create
  console.log('\n[Step 2] Creating a held booking order...');
  const bookingPayload = {
    provider: 'lxmi',
    busExternalId: 'bus_e2e_test_999',
    operator: 'Laxmi Holidays Pvt Ltd',
    busType: 'Semi Sleeper AC',
    fromCity: 'Delhi',
    toCity: 'Manali',
    journeyDate: '2026-06-15',
    departure: '10:40 PM',
    arrival: '10:00 AM',
    seatNo: 'A2',
    boardingPoint: 'Majnu Ka Tilla',
    droppingPoint: 'Manali Private Bus Stand',
    passengerName: 'Test User',
    passengerAge: 25,
    passengerGender: 'Male',
    customerPhone: testMobileE164,
    customerEmail: 'testuser@cheaptravels.in',
    baseFare: 899.00,
    ourMargin: 50.00,
    customerDiscount: 0.00,
    totalPayable: 949.00
  };

  const headers = { 'Content-Type': 'application/json' };
  if (ctiAccessCookie) {
    headers['Cookie'] = `cti_access=${ctiAccessCookie}`;
  }

  const createResponse = await fetch('http://localhost:3000/api/booking/create', {
    method: 'POST',
    headers,
    body: JSON.stringify(bookingPayload)
  });

  const createData = await createResponse.json();
  if (!createResponse.ok || !createData.success) {
    throw new Error(`Order creation failed: ${JSON.stringify(createData)}`);
  }
  const orderId = createData.orderId;
  console.log(`✓ Held order created successfully: ${orderId} (held until: ${createData.heldUntil})`);

  // Verify in DB that status is 'held'
  const dbOrderHeld = await prisma.order.findUnique({ where: { id: orderId } });
  if (!dbOrderHeld || dbOrderHeld.status !== 'held') {
    throw new Error(`DB verification failed: Order ${orderId} is not in 'held' status!`);
  }
  console.log(`✓ DB verified order ${orderId} exists with status: '${dbOrderHeld.status}'`);

  // 3. Confirm/Verify Payment via /api/payment/verify
  console.log('\n[Step 3] Verifying payment for the order...');
  const verifyPayload = {
    orderId,
    paymentId: `pay_e2e_${Math.random().toString(36).substring(7).toUpperCase()}`,
    signature: 'mock_sig_123456',
    passengers: [
      {
        seatNo: 'A2',
        name: 'Test User',
        age: 25,
        gender: 'Male'
      }
    ]
  };

  const verifyResponse = await fetch('http://localhost:3000/api/payment/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyPayload)
  });

  const verifyData = await verifyResponse.json();
  if (!verifyResponse.ok || !verifyData.success) {
    throw new Error(`Payment verification failed: ${JSON.stringify(verifyData)}`);
  }
  console.log(`✓ Payment verified. Generated PNR: ${verifyData.pnr}, Ticket URL: ${verifyData.ticketUrl}`);

  // 4. Verify PostgreSQL persistence and relationships
  console.log('\n[Step 4] Verifying PostgreSQL database records and relationships...');
  
  const dbOrderConfirmed = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      payments: true,
      tickets: true
    }
  });

  if (!dbOrderConfirmed) {
    throw new Error(`DB Error: Order ${orderId} not found in database!`);
  }

  console.log('\nDB Confirmed Order details:');
  console.log(`- Order ID: ${dbOrderConfirmed.id}`);
  console.log(`- Status: ${dbOrderConfirmed.status} (expected: confirmed)`);
  console.log(`- PNR: ${dbOrderConfirmed.providerPnr}`);
  console.log(`- UPI UTR/Payment ID: ${dbOrderConfirmed.upiUtr}`);
  
  if (dbOrderConfirmed.user) {
    console.log(`- Mapped User ID: ${dbOrderConfirmed.user.id}`);
    console.log(`- Mapped User Mobile: ${dbOrderConfirmed.user.mobile}`);
  } else {
    console.log('- ⚠ Mapped User: None (Anonymously booked)');
  }

  console.log(`- Payments Count: ${dbOrderConfirmed.payments.length}`);
  dbOrderConfirmed.payments.forEach(p => {
    console.log(`  - Gateway Transaction ID: ${p.gatewayTransactionId}, Status: ${p.paymentStatus}, Amount: ${p.amount}`);
  });

  console.log(`- Tickets Count: ${dbOrderConfirmed.tickets.length}`);
  dbOrderConfirmed.tickets.forEach(t => {
    console.log(`  - Ticket PNR: ${t.pnr}, Seats: ${t.seatNumbers}, PDF: ${t.ticketPdfUrl}`);
  });

  // Verify Audit Log
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityId: orderId }
  });
  console.log(`- Audit Logs Count: ${auditLogs.length}`);
  auditLogs.forEach(l => {
    console.log(`  - Action: ${l.action}, Entity: ${l.entityType}`);
  });

  if (dbOrderConfirmed.status !== 'confirmed') {
    throw new Error(`Validation failed: Status is ${dbOrderConfirmed.status}, expected confirmed.`);
  }
  if (dbOrderConfirmed.payments.length === 0) {
    throw new Error('Validation failed: No Payment record created in DB.');
  }
  if (dbOrderConfirmed.tickets.length === 0) {
    throw new Error('Validation failed: No Ticket record created in DB.');
  }

  console.log('\n✓ E2E INTEGRATION TEST COMPLETED SUCCESSFULLY WITH 100% CORRECT DATA FLOW!');
}

runTest()
  .catch(err => {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
