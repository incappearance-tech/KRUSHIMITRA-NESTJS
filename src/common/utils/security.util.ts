export class SecurityUtil {
    /**
     * Masks sensitive strings like phone numbers.
     * Example: +919876543210 -> +91******3210
     */
    static maskPhone(phone: string): string {
        if (!phone || phone.length < 8) return '****';
        return `${phone.substring(0, 3)}******${phone.substring(phone.length - 4)}`;
    }

    /**
     * Masks any string partially.
     */
    static maskString(str: string): string {
        if (!str) return '****';
        if (str.length <= 4) return '****';
        return str[0] + '***' + str[str.length - 1];
    }
}
