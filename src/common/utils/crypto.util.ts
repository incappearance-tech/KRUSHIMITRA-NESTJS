import * as crypto from 'crypto';

export class CryptoUtil {
  // ── RSA-4096 + AES-256-GCM hybrid (current) ─────────────────────────────

  private static get RSA_PRIVATE_KEY(): string {
    const key = process.env.RSA_PRIVATE_KEY;
    if (!key) throw new Error('RSA_PRIVATE_KEY environment variable is required');
    return Buffer.from(key, 'base64').toString('utf8');
  }

  /**
   * Decrypts an RSA+AES hybrid payload from the frontend.
   * Frontend encrypts a fresh AES-256 key with RSA-OAEP (SHA-256),
   * then encrypts the body with AES-256-GCM.
   *
   * Returns the decrypted body AND the AES key so the response can be
   * encrypted with the same per-request key (forward secrecy per request).
   */
  static decryptHybridPayload(body: {
    encryptedKey: string; // base64 — RSA-OAEP encrypted AES key
    iv:           string; // hex   — AES-GCM IV
    authTag:      string; // hex   — AES-GCM auth tag
    payload:      string; // base64 — AES-GCM ciphertext
  }): { data: any; aesKey: Buffer } {
    try {
      const privateKey = crypto.createPrivateKey({ key: this.RSA_PRIVATE_KEY, format: 'pem' });

      const aesKey = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(body.encryptedKey, 'base64'),
      );

      const iv      = Buffer.from(body.iv, 'hex');
      const authTag = Buffer.from(body.authTag, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(body.payload, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return { data: JSON.parse(decrypted), aesKey };
    } catch (e: any) {
      // Re-throw with the real OpenSSL error so it can be logged and diagnosed
      throw new Error(`Hybrid decryption failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Encrypts the response with the per-request AES key supplied by the client.
   * Returns a compact base64 envelope: base64( JSON{ iv, authTag, payload } )
   */
  static encryptWithAesKey(data: any, aesKey: Buffer): string {
    try {
      const iv     = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
      encrypted    += cipher.final('base64');
      const authTag = cipher.getAuthTag();

      return Buffer.from(JSON.stringify({
        iv:      iv.toString('hex'),
        authTag: authTag.toString('hex'),
        payload: encrypted,
      })).toString('base64');
    } catch {
      throw new Error('Response encryption failed');
    }
  }

  // ── Legacy shared-secret AES-256-GCM (kept for graceful migration) ───────

  private static get SHARED_SECRET_KEY(): string {
    const key = process.env.AES_SECRET_KEY;
    if (!key) throw new Error('AES_SECRET_KEY environment variable is required');
    return key;
  }

  static decryptPayload(encryptedPayload: string): any {
    try {
      const buffer        = Buffer.from(encryptedPayload.replace(/\s/g, ''), 'base64');
      const payloadString = buffer.toString('utf8');
      const [ivHex, authTagHex, encryptedData] = payloadString.split(':');
      if (!ivHex || !authTagHex || !encryptedData) throw new Error('Malformed payload');

      const key     = crypto.createHash('sha256').update(this.SHARED_SECRET_KEY, 'utf8').digest();
      const iv      = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted    += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch {
      throw new Error('Decryption failed');
    }
  }

  static encryptPayload(data: any): string {
    try {
      const key       = crypto.createHash('sha256').update(this.SHARED_SECRET_KEY, 'utf8').digest();
      const iv        = crypto.randomBytes(16);
      const cipher    = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted   = cipher.update(JSON.stringify(data), 'utf8', 'base64');
      encrypted      += cipher.final('base64');
      const authTag   = cipher.getAuthTag();

      return Buffer.from([iv.toString('hex'), authTag.toString('hex'), encrypted].join(':')).toString('base64');
    } catch {
      throw new Error('Encryption failed');
    }
  }
}
