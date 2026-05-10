/**
 * Diagnostic: test RSA key pair loaded from .env
 * Run:  node test-rsa.js
 */
require('dotenv').config();
const crypto = require('crypto');

const PRIV_B64 = process.env.RSA_PRIVATE_KEY;
const PUB_B64  = process.env.EXPO_PUBLIC_RSA_PUBLIC_KEY
  // read from frontend .env if not in backend env
  || require('fs').readFileSync(
       require('path').join(__dirname, '../KRUSHIMITRA-REACT-NATIVE-EXPO-/.env'), 'utf8'
     ).split('\n').find(l => l.startsWith('EXPO_PUBLIC_RSA_PUBLIC_KEY='))
      ?.replace(/^EXPO_PUBLIC_RSA_PUBLIC_KEY=/, '').replace(/^"|"$/g, '').trim();

console.log('\n=== RSA Key Diagnostic ===\n');

if (!PRIV_B64) { console.error('❌ RSA_PRIVATE_KEY missing from .env'); process.exit(1); }
if (!PUB_B64)  { console.error('❌ EXPO_PUBLIC_RSA_PUBLIC_KEY missing'); process.exit(1); }

console.log('✅ Private key b64 length:', PRIV_B64.length);
console.log('✅ Public  key b64 length:', PUB_B64.length);

const privatePem = Buffer.from(PRIV_B64, 'base64').toString('utf8');
const publicPem  = Buffer.from(PUB_B64,  'base64').toString('utf8');

console.log('\nPrivate key starts:', privatePem.substring(0, 40));
console.log('Public  key starts:', publicPem.substring(0, 40));

try {
  const privateKey = crypto.createPrivateKey({ key: privatePem, format: 'pem' });
  const publicKey  = crypto.createPublicKey({  key: publicPem,  format: 'pem' });
  console.log('\n✅ Keys parsed OK');

  // Test RSA-OAEP with SHA-256 (current implementation)
  const testData = crypto.randomBytes(32);
  let encrypted, decrypted;

  try {
    encrypted = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      testData,
    );
    decrypted = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      encrypted,
    );
    const match = testData.equals(decrypted);
    console.log('✅ RSA-OAEP SHA-256 roundtrip:', match ? 'PASS' : 'FAIL ❌');
    if (!match) process.exit(1);
  } catch (e) {
    console.error('❌ RSA-OAEP SHA-256 failed:', e.message);

    // Retry with SHA-1 to see if that works
    try {
      encrypted = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        testData,
      );
      decrypted = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        encrypted,
      );
      const match2 = testData.equals(decrypted);
      console.log('✅ RSA-OAEP SHA-1 (default) roundtrip:', match2 ? 'PASS' : 'FAIL ❌');
      if (match2) {
        console.log('\n💡 Fix: change oaepHash from sha256 to sha1 in both backend and frontend');
      }
    } catch (e2) {
      console.error('❌ RSA-OAEP SHA-1 also failed:', e2.message);
      console.log('\n💡 Keys are likely mismatched — regenerate them');
    }
    process.exit(1);
  }

  // Verify the keys are from the same pair
  const pubFromPriv = crypto.createPublicKey(privateKey)
    .export({ type: 'spki', format: 'pem' });
  const keysMatch = pubFromPriv.trim() === publicPem.trim();
  console.log('✅ Public key derived from private matches frontend key:', keysMatch ? 'YES' : 'NO ❌');
  if (!keysMatch) {
    console.log('\n❌ MISMATCH — the public key in frontend .env is not from this private key');
    console.log('   Run the key generation again and update both .env files');
    process.exit(1);
  }

  console.log('\n✅ All RSA checks PASSED — decryption should work\n');
} catch (e) {
  console.error('❌ Key parsing failed:', e.message);
  process.exit(1);
}
