import * as crypto from 'crypto';

export class CryptoUtil {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly IV_LENGTH = 16;
    private static readonly AUTH_TAG_LENGTH = 16;

    /**
     * Decrypts a hybrid encrypted payload (RSA + AES)
     * Format: base64(rsa_encrypted_aes_key:iv:auth_tag:aes_encrypted_data)
     */
    static decryptPayload(encryptedPayload: string, privateKey: string): any {
        try {
            const buffer = Buffer.from(encryptedPayload, 'base64');
            const payloadString = buffer.toString('utf8');
            const [encryptedKey, ivHex, authTagHex, encryptedData] = payloadString.split(':');

            // 1. Decrypt AES Key using RSA Private Key
            const aesKey = crypto.privateDecrypt(
                {
                    key: privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256',
                },
                Buffer.from(encryptedKey, 'base64'),
            );

            // 2. Decrypt Data using AES Key
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(this.ALGORITHM, aesKey, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error.message);
            throw new Error('Invalid encrypted payload');
        }
    }

    /**
     * Encrypts a payload using hybrid encryption (RSA + AES)
     * Use Client's Public Key for true security, but for now we'll use a configurable key.
     */
    static encryptPayload(data: any, publicKey: string): string {
        try {
            const jsonData = JSON.stringify(data);
            const aesKey = crypto.randomBytes(32);
            const iv = crypto.randomBytes(this.IV_LENGTH);

            // 1. Encrypt Data using AES
            const cipher = crypto.createCipheriv(this.ALGORITHM, aesKey, iv);
            let encrypted = cipher.update(jsonData, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();

            // 2. Encrypt AES Key using RSA Public Key
            const encryptedKey = crypto.publicEncrypt(
                {
                    key: publicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256',
                },
                aesKey,
            );

            // 3. Construct Final Payload
            const finalPayload = [
                encryptedKey.toString('base64'),
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
