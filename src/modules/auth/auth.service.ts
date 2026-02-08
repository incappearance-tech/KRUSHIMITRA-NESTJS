import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { VerifyOtpDto } from './dto/auth.dto';
import { SecurityUtil } from '../../common/utils/security.util';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private redis: RedisService,
    ) { }

    async requestOtp(phoneNumber: string) {
        // 1. Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Store in Redis (Key: otp:phone, Value: otp, Expiry: 5 minutes)
        const key = `otp:${phoneNumber}`;
        await this.redis.set(key, otp, 300);

        // 3. Mock sending logic (In production, trigger SMS gateway here)
        this.logger.debug(`[OTP DEBUG] Phone: ${SecurityUtil.maskPhone(phoneNumber)}, OTP: ${otp}`);

        return { message: 'OTP sent successfully', debugOtp: otp };
    }

    async verifyOtp(verifyOtpDto: VerifyOtpDto) {
        const { phoneNumber, otp, role, preferredLanguage, fcmToken, deviceOS, privacyConsent } = verifyOtpDto;

        // 1. DPDP Compliance Check: Ensure consent is provided
        if (!privacyConsent) {
            throw new BadRequestException('Privacy consent must be accepted to proceed.');
        }

        // 2. Check if OTP exists in Redis
        const key = `otp:${phoneNumber}`;
        const storedOtp = await this.redis.get(key);

        if (!storedOtp) {
            throw new BadRequestException('OTP expired or not found. Please request a new one.');
        }

        // 3. Validate OTP
        if (storedOtp !== otp && otp !== '123456') { // Allow 123456 for testing/dev
            throw new UnauthorizedException('Invalid OTP');
        }

        // 4. Clear OTP from Redis after success
        await this.redis.del(key);

        // 5. Upsert User with Consent Tracking (OPTIMIZED: Select only needed fields)
        let user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                fcmToken: true,
                deviceOS: true,
                locationLat: true,
                locationLng: true,
                locationAddress: true,
                // Don't fetch: auditLogs, orders, relations (saves 80% of data)
            },
        });

        const consentData = {
            privacyConsent: true,
            consentTimestamp: new Date(),
        };

        const normalizedRole = (role ? role.toUpperCase() : 'FARMER') as 'FARMER' | 'LABOUR' | 'TRANSPORTER';

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    phoneNumber,
                    role: normalizedRole,
                    preferredLanguage: preferredLanguage || 'en',
                    fcmToken,
                    deviceOS,
                    isVerified: true,
                    ...consentData,
                },
                select: {
                    id: true,
                    phoneNumber: true,
                    name: true,
                    role: true,
                    preferredLanguage: true,
                    isVerified: true,
                    fcmToken: true,
                    deviceOS: true,
                    locationLat: true,
                    locationLng: true,
                    locationAddress: true,
                },
            });
        } else {
            // Update mobile token or role if passed during login
            user = await this.prisma.user.update({
                where: { phoneNumber },
                data: {
                    role: role ? normalizedRole : user.role,
                    preferredLanguage: preferredLanguage || user.preferredLanguage,
                    fcmToken: fcmToken || user.fcmToken,
                    deviceOS: deviceOS || user.deviceOS,
                    isVerified: true,
                    ...consentData,
                },
                select: {
                    id: true,
                    phoneNumber: true,
                    name: true,
                    role: true,
                    preferredLanguage: true,
                    isVerified: true,
                    fcmToken: true,
                    deviceOS: true,
                    locationLat: true,
                    locationLng: true,
                    locationAddress: true,
                },
            });
        }

        // 5. Generate JWT
        const payload = { sub: user.id, phoneNumber: user.phoneNumber, role: user.role };
        const token = this.jwtService.sign(payload);

        // 6. Store Session in Redis (Whitelist approach)
        // Key: session:userId, Value: token (or 'valid'), Expiry: 7 days (604800s) matches JWT constant likely
        await this.redis.set(`session:${user.id}`, token, 604800);

        return {
            message: 'Verification successful',
            user,
            token,
            needsProfileSetup: user.name ? false : true,
        };
    }

    async updateProfile(userId: string, data: any) {
        if (data.role) {
            data.role = data.role.toUpperCase();
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...data
            },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                locationLat: true,
                locationLng: true,
                locationAddress: true,
            },
        });
    }

    async logout(userId: string) {
        // Remove session from Redis
        await this.redis.del(`session:${userId}`);
        return { success: true, message: 'Logged out successfully' };
    }
}
