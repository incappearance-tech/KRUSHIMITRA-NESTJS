/**
 * RSA+AES Encryption Roundtrip Test
 * Run: node test-encryption.js
 *
 * Tests:
 *  1. Frontend encrypt  → Backend decrypt   (request path)
 *  2. Backend encrypt   → Frontend decrypt  (response path)
 *  3. Live HTTP request to running server   (optional)
 */

require('dotenv').config();
const crypto = require('crypto');
const https  = require('https');
const http   = require('http');

// ── Keys from .env ────────────────────────────────────────────────────────────
const RSA_PRIVATE_KEY_B64 = process.env.RSA_PRIVATE_KEY;
const RSA_PUBLIC_KEY_B64  = process.env.EXPO_PUBLIC_RSA_PUBLIC_KEY
  // Fall back to reading from the frontend .env
  || require('fs').readFileSync(
       require('path').join(__dirname, '../KRUSHIMITRA-REACT-NATIVE-EXPO-/.env'), 'utf8'
     ).split('\n').find(l => l.startsWith('EXPO_PUBLIC_RSA_PUBLIC_KEY='))
      ?.split('=').slice(1).join('=').replace(/^"|"$/g, '');

const HMAC_SECRET = process.env.HMAC_SHARED_SECRET;

if (!RSA_PRIVATE_KEY_B64 || !RSA_PUBLIC_KEY_B64) {
  console.error('❌  RSA keys not found. Ensure .env has RSA_PRIVATE_KEY and frontend .env has EXPO_PUBLIC_RSA_PUBLIC_KEY');
  process.exit(1);
}

const PRIVATE_PEM = Buffer.from(RSA_PRIVATE_KEY_B64, 'base64').toString('utf8');
const PUBLIC_PEM  = Buffer.from(RSA_PUBLIC_KEY_B64,  'base64').toString('utf8');

// ── Helpers (mirrors frontend CryptoService + backend CryptoUtil) ─────────────

function frontendEncrypt(data) {
  const publicKey = crypto.createPublicKey({ key: PUBLIC_PEM, format: 'pem' });

  // 1. Random AES-256 key
  const aesKey = crypto.randomBytes(32);
  const iv     = crypto.randomBytes(16);

  // 2. AES-256-GCM encrypt body
  const cipher    = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let   encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted      += cipher.final('base64');
  const authTag   = cipher.getAuthTag();

  // 3. RSA-OAEP encrypt AES key
  const encryptedKey = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey,
  );

  return {
    envelope:  { encryptedKey: encryptedKey.toString('base64'), iv: iv.toString('hex'), authTag: authTag.toString('hex'), payload: encrypted },
    aesKeyHex: aesKey.toString('hex'),
  };
}

function backendDecrypt(envelope) {
  const privateKey = crypto.createPrivateKey({ key: PRIVATE_PEM, format: 'pem' });

  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.encryptedKey, 'base64'),
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
  let decrypted = decipher.update(envelope.payload, 'base64', 'utf8');
  decrypted    += decipher.final('utf8');

  return { data: JSON.parse(decrypted), aesKey };
}

function backendEncryptResponse(data, aesKey) {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let enc      = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  enc         += cipher.final('base64');
  const tag    = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({ iv: iv.toString('hex'), authTag: tag.toString('hex'), payload: enc })).toString('base64');
}

function frontendDecryptResponse(encryptedB64, aesKeyHex) {
  const env     = JSON.parse(Buffer.from(encryptedB64, 'base64').toString('utf8'));
  const aesKey  = Buffer.from(aesKeyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(env.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(env.authTag, 'hex'));
  let dec = decipher.update(env.payload, 'base64', 'utf8');
  dec    += decipher.final('utf8');
  return JSON.parse(dec);
}

function hmacSign(method, path, timestamp, nonce, body) {
  const payload = `${method}|${path}|${timestamp}|${nonce}|${body}`;
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('base64');
}

// ── Test 1: Roundtrip without network ─────────────────────────────────────────

function testCryptoRoundtrip() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Test 1: Crypto roundtrip (no network)');
  console.log('══════════════════════════════════════════════');

  const original = { phoneNumber: '+919876543210', role: 'FARMER', privacyConsent: true };
  console.log('\n📤 Original payload:     ', JSON.stringify(original));

  // Frontend encrypts
  const { envelope, aesKeyHex } = frontendEncrypt(original);
  console.log('🔐 AES key (hex, 32B):  ', aesKeyHex.substring(0, 16) + '...');
  console.log('🔐 RSA-wrapped key:     ', envelope.encryptedKey.substring(0, 40) + '...');
  console.log('🔐 IV:                  ', envelope.iv);
  console.log('🔐 Auth tag:            ', envelope.authTag);
  console.log('🔐 Encrypted payload:   ', envelope.payload.substring(0, 40) + '...');

  // Backend decrypts
  const { data: decrypted, aesKey } = backendDecrypt(envelope);
  const requestOk = JSON.stringify(decrypted) === JSON.stringify(original);
  console.log('\n📥 Backend decrypted:    ', JSON.stringify(decrypted));
  console.log(requestOk ? '✅ REQUEST  encrypt→decrypt: PASS' : '❌ REQUEST  encrypt→decrypt: FAIL');

  // Backend encrypts response
  const response  = { message: 'OTP sent successfully', success: true, token: 'eyJhb...' };
  const encrypted = backendEncryptResponse(response, aesKey);
  console.log('\n🔐 Backend resp (enc):  ', encrypted.substring(0, 40) + '...');

  // Frontend decrypts response
  const final     = frontendDecryptResponse(encrypted, aesKeyHex);
  const responseOk = JSON.stringify(final) === JSON.stringify(response);
  console.log('📥 Frontend decrypted:  ', JSON.stringify(final));
  console.log(responseOk ? '✅ RESPONSE encrypt→decrypt: PASS' : '❌ RESPONSE encrypt→decrypt: FAIL');

  return requestOk && responseOk;
}

// ── Test 2: Live HTTP request to running backend ───────────────────────────────

async function testLiveRequest(baseUrl = 'http://localhost:3000') {
  console.log('\n══════════════════════════════════════════════');
  console.log(`  Test 2: Live request → ${baseUrl}`);
  console.log('══════════════════════════════════════════════');

  const body     = { phoneNumber: '+911111111111' };
  const endpoint = '/api/v1/auth/otp/request';

  const { envelope, aesKeyHex } = frontendEncrypt(body);
  const finalBody = JSON.stringify(envelope);

  const timestamp = Date.now().toString();
  const nonce     = crypto.randomBytes(16).toString('base64');
  const signature = hmacSign('POST', '/auth/otp/request', timestamp, nonce, finalBody);

  const options = {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'Accept':            'application/json',
      'x-encrypted':       'true',
      'x-encryption-type': 'rsa-aes',
      'x-timestamp':       timestamp,
      'x-nonce':           nonce,
      'x-signature':       signature,
      'Content-Length':    Buffer.byteLength(finalBody).toString(),
    },
  };

  const parsed = new URL(baseUrl + endpoint);
  const lib    = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(parsed, options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(raw);
          console.log('\n📡 HTTP status:          ', res.statusCode);
          console.log('🔐 Response encrypted:   ', result.encrypted);
          console.log('🔐 Encryption type:      ', result.encryptionType ?? 'none');

          if (result.encrypted && result.data) {
            try {
              const dec = frontendDecryptResponse(result.data, aesKeyHex);
              console.log('📥 Decrypted response:   ', JSON.stringify(dec));
              console.log('✅ LIVE REQUEST: PASS');
              resolve(true);
            } catch (e) {
              console.log('❌ LIVE REQUEST: response decryption failed —', e.message);
              resolve(false);
            }
          } else {
            console.log('⚠️  Response not encrypted. Raw data:', JSON.stringify(result.data));
            console.log('   (Check ENCRYPTION_ENABLED="true" in backend .env and restart server)');
            resolve(false);
          }
        } catch {
          console.log('❌ LIVE REQUEST: could not parse response — raw:', raw.substring(0, 200));
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`❌ LIVE REQUEST: cannot reach ${baseUrl} — ${e.message}`);
      console.log('   (Start the NestJS server first: npm run start:dev)');
      resolve(false);
    });

    req.write(finalBody);
    req.end();
  });
}

// ── Run all tests ─────────────────────────────────────────────────────────────

(async () => {
  const t1 = testCryptoRoundtrip();

  const serverUrl = process.argv[2] || 'http://localhost:3000';
  const t2 = await testLiveRequest(serverUrl);

  console.log('\n══════════════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════════════');
  console.log('  Roundtrip (offline):', t1 ? '✅ PASS' : '❌ FAIL');
  console.log('  Live HTTP request:  ', t2 ? '✅ PASS' : '❌ FAIL');
  console.log('');
  process.exit(t1 && t2 ? 0 : 1);
})();
