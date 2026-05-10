import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { VerifyOtpDto } from './dto/auth.dto';
import { SecurityUtil } from '../../common/utils/security.util';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    // isDev is ONLY true when not in production.
    // The ALLOW_DEV_OTP backdoor has been removed — it bypassed OTP in prod when the
    // env var was accidentally set to "true". Never allow a magic OTP in production.
    private readonly isDev: boolean;

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private redis: RedisService,
        private config: ConfigService,
    ) {
        this.isDev = this.config.get('NODE_ENV') !== 'production';
    }

    async requestOtp(phoneNumber: string) {
        // ── Rate limit: max 5 OTP requests per phone per hour ─────────────────
        // Key rotates every hour (floor(unix_ms / 3_600_000)), so no manual cleanup needed.
        const hourKey = `otp_ratelimit:${phoneNumber}:${Math.floor(Date.now() / 3_600_000)}`;
        const prevStr = await this.redis.get(hourKey);
        const reqCount = prevStr ? parseInt(prevStr as string, 10) : 0;
        if (reqCount >= 5) {
            throw new BadRequestException(
                'Too many OTP requests. Please try again after 1 hour.',
            );
        }
        await this.redis.set(hourKey, String(reqCount + 1), 3600);

        // ── Cryptographically secure 6-digit OTP ──────────────────────────────
        // crypto.randomInt uses OS entropy — unlike Math.random() which is predictable.
        const otp = crypto.randomInt(100000, 1_000_000).toString();

        // Store OTP in Redis (TTL: 5 minutes)
        await this.redis.set(`otp:${phoneNumber}`, otp, 300);

        if (this.isDev) {
            // Log only masked phone in dev — never log the OTP itself
            this.logger.debug(`[DEV] OTP generated for ${SecurityUtil.maskPhone(phoneNumber)}`);
        }

        return { message: 'OTP sent successfully' };
    }

    async verifyOtp(verifyOtpDto: VerifyOtpDto) {
        const {
            phoneNumber,
            otp,
            role,
            preferredLanguage,
            fcmToken,
            deviceOS,
            privacyConsent,
        } = verifyOtpDto;

        // 1. DPDP Compliance Check
        if (!privacyConsent) {
            throw new BadRequestException('Privacy consent must be accepted to proceed.');
        }

        // 2. Check OTP exists in Redis
        const key = `otp:${phoneNumber}`;
        const storedOtp = await this.redis.get(key);
        if (!storedOtp) {
            throw new BadRequestException('OTP expired or not found. Please request a new one.');
        }

        // 3. Check brute-force attempt counter (max 3 wrong attempts per OTP)
        const attemptsKey = `otp_attempts:${phoneNumber}`;
        const attemptsStr = await this.redis.get(attemptsKey);
        const attempts = attemptsStr ? parseInt(attemptsStr as string, 10) : 0;

        // 4. Validate OTP — dev bypass only when NODE_ENV !== production
        const isDevBypass = this.isDev && otp === '123456';
        if (storedOtp !== otp && !isDevBypass) {
            if (attempts >= 2) {
                // 3rd failure: burn the OTP so it can't be used even if guessed
                await this.redis.del(key);
                await this.redis.del(attemptsKey);
                throw new BadRequestException(
                    'Too many incorrect attempts. Please request a new OTP.',
                );
            }
            await this.redis.set(attemptsKey, String(attempts + 1), 300);
            throw new BadRequestException('Invalid OTP');
        }

        // 5. Clear OTP and attempt counter on success
        await this.redis.del(key);
        await this.redis.del(attemptsKey);

        // 6. Upsert User
        let user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                profileImage: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                fcmToken: true,
                deviceOS: true,
                locationLat: true,
                locationLng: true,
                farmerId: true,
            },
        });

        const consentData = { privacyConsent: true, consentTimestamp: new Date() };

        const normalizedRole = (role ? role.toUpperCase() : 'GUEST') as
            | 'FARMER'
            | 'LABOUR'
            | 'TRANSPORTER'
            | 'GUEST';

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
                    profileImage: true,
                    role: true,
                    preferredLanguage: true,
                    isVerified: true,
                    fcmToken: true,
                    deviceOS: true,
                    locationLat: true,
                    locationLng: true,
                    farmerId: true,
                },
            });
        } else {
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
                    profileImage: true,
                    role: true,
                    preferredLanguage: true,
                    isVerified: true,
                    fcmToken: true,
                    deviceOS: true,
                    locationLat: true,
                    locationLng: true,
                    farmerId: true,
                },
            });
        }

        if (!user) {
            throw new UnauthorizedException('Failed to create or update user');
        }

        // 7. Generate JWT — include a random jti (JWT ID) claim.
        //    The jti is stored in Redis as the session token. The JWT strategy
        //    compares payload.jti with the stored value on every request.
        //    A Redis compromise yields only random UUIDs, not usable JWTs.
        const jti = crypto.randomUUID();
        const payload = {
            sub:         user.id,
            phoneNumber: user.phoneNumber,
            role:        user.role,
            jti,
        };
        const token = this.jwtService.sign(payload);

        // 8. Store only the jti (36-char UUID) — never the raw JWT.
        await this.redis.set(`session:${user.id}`, jti, 86400); // 24 h — matches JWT expiry

        return {
            message: 'Verification successful',
            user,
            token,
            needsProfileSetup: !(await this.isProfileComplete(user)),
        };
    }

    async isProfileComplete(user: Partial<User>): Promise<boolean> {
        if (!user) {
            this.logger.warn(`isProfileComplete: No user object provided`);
            return false;
        }
        if (user.role === 'GUEST') {
            return false;
        }

        const hasLocation = user.locationLat !== null && user.locationLng !== null;
        let hasName = !!user.name;

        this.logger.log(
            `isProfileComplete [${user.role}] userId=${user.id}: name=${hasName}, hasLocation=${hasLocation}`,
        );

        try {
            if (user.role === 'LABOUR') {
                const profile = await this.prisma.labourProfile.findUnique({ where: { userId: user.id } });
                const isComplete = !!profile && hasName && hasLocation;
                this.logger.log(`isProfileComplete [LABOUR] result=${isComplete}`);
                return isComplete;
            }

            if (user.role === 'TRANSPORTER') {
                const profile = await this.prisma.transporterProfile.findUnique({ where: { userId: user.id } });
                if (profile && !hasName && profile.businessName) hasName = true;
                const isComplete = !!profile && hasName && hasLocation;
                this.logger.log(`isProfileComplete [TRANSPORTER] result=${isComplete}`);
                return isComplete;
            }
        } catch (e) {
            this.logger.error(`Error checking profile completeness for ${user.id}:`, e);
            return false;
        }

        const farmerComplete = hasName && hasLocation;
        this.logger.log(`isProfileComplete [FARMER] result=${farmerComplete}`);
        return farmerComplete;
    }

    async updateProfile(userId: string, data: Partial<User>) {
        if (data.role) data.role = data.role.toUpperCase() as any;
        return this.prisma.user.update({
            where: { id: userId },
            data: { ...data },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                profileImage: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                locationLat: true,
                locationLng: true,
                farmerId: true,
            },
        });
    }

    async getProfileById(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                profileImage: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                locationLat: true,
                locationLng: true,
                farmerId: true,
            },
        });
    }

    async updateLocation(
        userId: string,
        data: {
            lat: number;
            lng: number;
            locationAddress?: string;
            state?: string;
            district?: string;
            taluka?: string;
            village?: string;
            pincode?: string;
        },
    ) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { locationLat: data.lat, locationLng: data.lng },
            select: { id: true, locationLat: true, locationLng: true },
        });
    }

    async verifyPhoneUpdate(userId: string, updatePhoneDto: any) {
        const { newPhoneNumber, otp } = updatePhoneDto;

        // Reject if the user is trying to set their current number
        const self = await this.prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } });
        if (self?.phoneNumber === newPhoneNumber) {
            throw new BadRequestException('This is already your current phone number.');
        }

        // Check if number is already in use by another account
        const existingUser = await this.prisma.user.findUnique({ where: { phoneNumber: newPhoneNumber } });
        if (existingUser) {
            throw new BadRequestException('This phone number is already registered to another account.');
        }

        // Verify OTP for the NEW phone number
        const key = `otp:${newPhoneNumber}`;
        const storedOtp = await this.redis.get(key);
        if (!storedOtp) {
            throw new BadRequestException('OTP expired or not found. Please request a new one for the new number.');
        }

        // Brute-force protection for phone update OTP
        const attemptsKey = `otp_attempts:${newPhoneNumber}`;
        const attemptsStr = await this.redis.get(attemptsKey);
        const attempts = attemptsStr ? parseInt(attemptsStr as string, 10) : 0;

        const isDevBypass = this.isDev && otp === '123456';
        if (storedOtp !== otp && !isDevBypass) {
            if (attempts >= 2) {
                await this.redis.del(key);
                await this.redis.del(attemptsKey);
                throw new BadRequestException('Too many incorrect attempts. Please request a new OTP.');
            }
            await this.redis.set(attemptsKey, String(attempts + 1), 300);
            throw new BadRequestException('Invalid OTP');
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { phoneNumber: newPhoneNumber },
            select: { id: true, phoneNumber: true, isVerified: true, role: true },
        });

        await this.redis.del(key);
        await this.redis.del(attemptsKey);

        // Rotate the session: invalidate the old jti and issue a fresh JWT so the user
        // stays logged in without re-authenticating, while the old token is revoked.
        const jti = crypto.randomUUID();
        const newToken = this.jwtService.sign({
            sub:         userId,
            phoneNumber: newPhoneNumber,
            role:        updatedUser.role ?? 'FARMER',
            jti,
        });
        await this.redis.set(`session:${userId}`, jti, 86400);

        return {
            success:  true,
            message:  'Phone number updated successfully.',
            user:     updatedUser,
            token:    newToken,
        };
    }

    async logout(userId: string) {
        await this.redis.del(`session:${userId}`);
        return { success: true, message: 'Logged out successfully' };
    }

    async deleteAccount(userId: string) {
        this.logger.log(`Deleting account for user: ${userId}`);

        return await this.prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    include: {
                        labourProfile: true,
                        transporterProfile: { include: { vehicles: true } },
                    },
                });

                if (!user) {
                    throw new UnauthorizedException('User not found');
                }

                if (user.transporterProfile) {
                    const vehicleIds = user.transporterProfile.vehicles.map((v) => v.id);
                    await tx.vehicleAvailability.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
                    await tx.driver.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
                    await tx.transportRequest.deleteMany({
                        where: { OR: [{ vehicleId: { in: vehicleIds } }, { transporterId: user.transporterProfile.id }] },
                    });
                    await tx.vehicle.deleteMany({ where: { transporterId: user.transporterProfile.id } });
                    await tx.transportTrip.deleteMany({ where: { transporterId: user.transporterProfile.id } });
                    await tx.transporterProfile.delete({ where: { id: user.transporterProfile.id } });
                }

                if (user.labourProfile) {
                    await tx.labourBooking.deleteMany({ where: { labourId: user.labourProfile.id } });
                    await tx.labourProfile.delete({ where: { id: user.labourProfile.id } });
                }

                const userMachines = await tx.machine.findMany({ where: { ownerId: userId }, select: { id: true } });
                const machineIds = userMachines.map((m) => m.id);

                await tx.order.deleteMany({
                    where: { OR: [{ buyerId: userId }, { sellerId: userId }, { machineId: { in: machineIds } }] },
                });

                const rentalWhere = machineIds.length > 0
                    ? { OR: [{ ownerId: userId }, { borrowerId: userId }, { machineId: { in: machineIds } }] }
                    : { OR: [{ ownerId: userId }, { borrowerId: userId }] };
                await tx.rentalRequest.deleteMany({ where: rentalWhere });

                await tx.subscription.deleteMany({ where: { userId } });
                await tx.machine.deleteMany({ where: { ownerId: userId } });
                await tx.transportRequest.deleteMany({ where: { farmerId: userId } });
                await tx.transportTrip.deleteMany({ where: { farmerId: userId } });
                await tx.labourBooking.deleteMany({ where: { farmerId: userId } });
                await tx.payment.deleteMany({ where: { userId } });
                await tx.callLog.deleteMany({ where: { OR: [{ callerId: userId }, { receiverId: userId }] } });
                await tx.auditLog.deleteMany({ where: { userId } });
                await tx.notification.deleteMany({ where: { userId } });

                await tx.user.delete({ where: { id: userId } });

                if (this.redis) {
                    await this.redis.del(`session:${userId}`);
                }

                return { success: true, message: 'Account and all related data deleted successfully' };
            },
            { timeout: 30000 },
        );
    }
}
