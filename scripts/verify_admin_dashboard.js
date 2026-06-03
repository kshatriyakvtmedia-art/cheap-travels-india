require('dotenv').config();

async function runTest() {
  console.log('--- STARTING ADMIN DASHBOARD INTEGRATION TEST ---');
  const adminEmail = 'admin@cheaptravels.in';
  const adminPassword = process.env.ADMIN_PASSWORD || 'cti_admin_2026';

  console.log('\n[Step 1] Logging into admin portal...');
  const loginResponse = await fetch('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword
    })
  });

  const loginData = await loginResponse.json();
  if (!loginResponse.ok || !loginData.success) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  console.log('✓ Admin login successful. Token received.');

  // Extract cookies
  const setCookieHeaders = loginResponse.headers.get('set-cookie');
  let ctiAccessCookie = '';
  if (setCookieHeaders) {
    const match = setCookieHeaders.match(/cti_access=([^;]+)/);
    if (match) {
      ctiAccessCookie = match[1];
      console.log('✓ Extracted admin cti_access token cookie.');
    }
  }

  // 2. Fetch all bookings from admin panel
  console.log('\n[Step 2] Fetching admin bookings list...');
  const headers = { 'Content-Type': 'application/json' };
  if (ctiAccessCookie) {
    headers['Cookie'] = `cti_access=${ctiAccessCookie}`;
  }

  const bookingsResponse = await fetch('http://localhost:3000/api/admin/bookings', {
    method: 'GET',
    headers
  });

  const bookingsData = await bookingsResponse.json();
  if (!bookingsResponse.ok || !bookingsData.success) {
    throw new Error(`Fetching admin bookings failed: ${JSON.stringify(bookingsData)}`);
  }

  console.log(`✓ Admin bookings fetched successfully. Total bookings in DB: ${bookingsData.bookings.length}`);
  
  if (bookingsData.bookings.length === 0) {
    throw new Error('Validation failed: No bookings found in the admin dashboard.');
  }

  console.log('\nList of bookings retrieved:');
  bookingsData.bookings.forEach((b, index) => {
    console.log(`[${index + 1}] ID: ${b.id}, Operator: ${b.operator}, PNR: ${b.pnr}, Passenger: ${b.passengerName}, Route: ${b.route}, Status: ${b.status}`);
  });

  // Verify that at least one confirmed booking exists
  const hasConfirmed = bookingsData.bookings.some(b => b.status === 'confirmed');
  if (!hasConfirmed) {
    throw new Error('Validation failed: No confirmed bookings found in the dashboard list.');
  }

  console.log('\n✓ ADMIN DASHBOARD VERIFICATION COMPLETED SUCCESSFULLY!');
}

runTest()
  .catch(err => {
    console.error('\n❌ ADMIN DASHBOARD TEST FAILED:', err.message);
    process.exit(1);
  });
