did u #!/usr/bin/env node
/**
 * Diagnostic script to test the dashboard API flow
 */

import http from 'http';

function makeRequest(method, path, body = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
            rawBody: data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: data,
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  const timestamp = Date.now();
  const username = `testuser${timestamp}`;
  const email = `test${timestamp}@example.com`;
  const password = 'TestPassword123';

  try {
    console.log('1. Testing Register...');
    const registerRes = await makeRequest('POST', '/api/auth/register', {
      username,
      email,
      password,
    });
    console.log(`   Status: ${registerRes.status}`);
    if (registerRes.status !== 201) {
      console.log(`   ERROR: Expected 201, got ${registerRes.status}`);
      console.log(`   Response:`, registerRes.rawBody);
      return;
    }
    console.log(`   ✓ Registered successfully`);

    console.log('\n2. Testing Login...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      username,
      password,
    });
    console.log(`   Status: ${loginRes.status}`);
    if (loginRes.status !== 200) {
      console.log(`   ERROR: Expected 200, got ${loginRes.status}`);
      console.log(`   Response:`, loginRes.rawBody);
      return;
    }
    const setCookie = loginRes.headers['set-cookie'];
    let authCookie = '';
    if (setCookie && Array.isArray(setCookie)) {
      authCookie = setCookie.map(c => c.split(';')[0]).join('; ');
    }
    console.log(`   ✓ Logged in successfully`);
    console.log(`   Auth Cookie:`, authCookie.substring(0, 50) + '...');

    console.log('\n3. Testing /api/auth/me (verify session)...');
    const meRes = await makeRequest('GET', '/api/auth/me', null, authCookie);
    console.log(`   Status: ${meRes.status}`);
    if (meRes.status === 200) {
      console.log(`   ✓ Session valid, user:`, meRes.body?.user?.username);
    } else {
      console.log(`   ERROR: Got ${meRes.status}`);
      console.log(`   Response:`, meRes.rawBody);
      return;
    }

    console.log('\n4. Testing /api/dashboard...');
    const dashRes = await makeRequest('GET', '/api/dashboard', null, authCookie);
    console.log(`   Status: ${dashRes.status}`);
    if (dashRes.status === 200) {
      console.log(`   ✓ Dashboard API working`);
      console.log(`   Response keys:`, Object.keys(dashRes.body || {}));
      console.log(`   Assets count:`, dashRes.body?.assets?.length || 0);
      console.log(`   Summary:`, dashRes.body?.summary ? 'present' : 'missing');
      console.log(`   History:`, dashRes.body?.history?.length || 0, 'records');
      console.log(`   Prices:`, dashRes.body?.prices?.length || 0, 'records');
    } else {
      console.log(`   ERROR: Got ${dashRes.status}`);
      console.log(`   Response:`, dashRes.rawBody);
      return;
    }

    console.log('\n✓ All tests passed!');
  } catch (error) {
    console.error('\n✗ Test failed with error:', error.message);
  }
}

test();
