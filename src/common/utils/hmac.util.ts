import * as crypto from 'crypto';

export class HmacUtil {
    /**
     * Generates HMAC-SHA256 signature for request
     * @param data - The data to sign (usually stringified request body)
     * @param secret - The secret key (user-specific or shared secret)
     * @returns Base64-encoded signature
     */
    static generateSignature(data: string, secret: string): string {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        return hmac.digest('base64');
    }

    /**
     * Verifies HMAC signature
     * @param data - The original data
     * @param signature - The signature to verify
     * @param secret - The secret key
     * @returns true if signature is valid
     */
    static verifySignature(data: string, signature: string, secret: string): boolean {
        const expectedSignature = this.generateSignature(data, secret);

        // Use timing-safe comparison to prevent timing attacks
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Generates a signature payload string from request components
     * Format: METHOD|PATH|TIMESTAMP|NONCE|BODY
     */
    static createSignaturePayload(
        method: string,
        path: string,
        timestamp: string,
        nonce: string,
        body: string = '',
    ): string {
        return `${method}|${path}|${timestamp}|${nonce}|${body}`;
    }
}
