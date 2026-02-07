import * as crypto from 'crypto';

export class CryptoUtil {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly IV_LENGTH = 16;
    private static readonly AUTH_TAG_LENGTH = 16;

    private static get SHARED_SECRET_KEY(): string {
        return process.env.AES_SECRET_KEY || 'KrushimitraSuperSecretKey2026!@#';
    }

    /**
     * Decrypts an AES-256-GCM encrypted payload
     * Format: base64(iv:auth_tag:encrypted_data)
     */
    static decryptPayload(encryptedPayload: string, _unusedKey?: string): any {
        try {
            const cleanedPayload = encryptedPayload.replace(/\s/g, '');
            const buffer = Buffer.from(cleanedPayload, 'base64');
            const payloadString = buffer.toString('utf8');
            const [ivHex, authTagHex, encryptedData] = payloadString.split(':');

            if (!ivHex || !authTagHex || !encryptedData) {
                throw new Error('Malformed encrypted payload structure');
            }

            // Prepare Key (Simple SHA-256 hash of secret) - Matches Frontend
            const key = crypto.createHash('sha256').update(this.SHARED_SECRET_KEY, 'utf8').digest();

            // Decrypt Data using AES-GCM
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error.message);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Encrypts a payload using AES-256-GCM
     * Format: base64(iv:auth_tag:encrypted_data)
     */
    static encryptPayload(data: any, _unusedKey?: string): string {
        try {
            const jsonData = JSON.stringify(data);

            // Prepare Key (Simple SHA-256 hash of secret)
            const key = crypto.createHash('sha256').update(this.SHARED_SECRET_KEY, 'utf8').digest();
            const iv = crypto.randomBytes(this.IV_LENGTH);

            // Encrypt Data using AES-GCM
            const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
            let encrypted = cipher.update(jsonData, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();

            // Construct Final Payload: iv:auth_tag:encrypted_data
            const finalPayload = [
                iv.toString('hex'),
                authTag.toString('hex'),
                encrypted,
            ].join(':');

            return Buffer.from(finalPayload).toString('base64');
        } catch (error) {
            console.error('Encryption failed:', error.message);
            throw new Error('Encryption failed');
        }
    }
}
