import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { VerifyOtpDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
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
        console.log(`[OTP DEBUG] Phone: ${phoneNumber}, OTP: ${otp}`);

        return { message: 'OTP sent successfully', debugOtp: otp };
    }

    async verifyOtp(verifyOtpDto: VerifyOtpDto) {
        const { phoneNumber, otp, role, preferredLanguage, fcmToken, deviceOS } = verifyOtpDto;

        // 1. Check if OTP exists in Redis
        const key = `otp:${phoneNumber}`;
        const storedOtp = await this.redis.get(key);

        if (!storedOtp) {
            throw new BadRequestException('OTP expired or not found. Please request a new one.');
        }

        // 2. Validate OTP
        if (storedOtp !== otp && otp !== '123456') { // Allow 123456 for testing/dev
            throw new UnauthorizedException('Invalid OTP');
        }

        // 3. Clear OTP from Redis after success
        await this.redis.del(key);

        // 4. Upsert User
        let user = await this.prisma.user.findUnique({
            where: { phoneNumber },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    phoneNumber,
                    role: role || 'FARMER',
                    preferredLanguage: preferredLanguage || 'en',
                    fcmToken,
                    deviceOS,
                    isVerified: true,
                },
            });
        } else {
            // Update mobile token or role if passed during login
            user = await this.prisma.user.update({
                where: { phoneNumber },
                data: {
                    role: role || user.role,
                    preferredLanguage: preferredLanguage || user.preferredLanguage,
                    fcmToken: fcmToken || user.fcmToken,
                    deviceOS: deviceOS || user.deviceOS,
                    isVerified: true
                }
            });
        }

        // 5. Generate JWT
        const payload = { sub: user.id, phoneNumber: user.phoneNumber, role: user.role };
        const token = this.jwtService.sign(payload);

        return {
            user,
            access_token: token,
            isNewUser: !user.name, // If name is missing, they need to complete profile
        };
    }

    async updateProfile(userId: string, data: any) {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...data
            }
        });
    }
}
