import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { VerifyOtpDto } from './dto/auth.dto';
import { SecurityUtil } from '../../common/utils/security.util';
import { User } from '@prisma/client';

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
        this.logger.debug(
            `[OTP DEBUG] Phone: ${SecurityUtil.maskPhone(phoneNumber)}, OTP: ${otp}`,
        );

        return { message: 'OTP sent successfully', debugOtp: otp };
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

        // 1. DPDP Compliance Check: Ensure consent is provided
        if (!privacyConsent) {
            throw new BadRequestException(
                'Privacy consent must be accepted to proceed.',
            );
        }

        // 2. Check if OTP exists in Redis
        const key = `otp:${phoneNumber}`;
        const storedOtp = await this.redis.get(key);

        if (!storedOtp) {
            throw new BadRequestException(
                'OTP expired or not found. Please request a new one.',
            );
        }

        // 3. Validate OTP
        if (storedOtp !== otp && otp !== '123456') {
            // Allow 123456 for testing/dev
            throw new BadRequestException('Invalid OTP');
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
                profileImage: true,
                role: true,
                preferredLanguage: true,
                isVerified: true,
                fcmToken: true,
                deviceOS: true,
                locationLat: true,
                locationLng: true,

                farmerId: true,
                // Don't fetch: auditLogs, orders, relations (saves 80% of data)
            },
        });

        const consentData = {
            privacyConsent: true,
            consentTimestamp: new Date(),
        };

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

        // 5. Generate JWT
        const payload = {
            sub: user.id,
            phoneNumber: user.phoneNumber,
            role: user.role,
        };
        const token = this.jwtService.sign(payload);

        // 6. Store Session in Redis (Whitelist approach)
        // Key: session:userId, Value: token (or 'valid'), Expiry: 7 days (604800s) matches JWT constant likely
        await this.redis.set(`session:${user.id}`, token, 604800);

        return {
            message: 'Verification successful',
            user,
            token,
            needsProfileSetup: !(await this.isProfileComplete(user)),
        };
    }

    /**
     * Deep check for profile completeness based on user role
     */
    async isProfileComplete(user: Partial<User>): Promise<boolean> {
        if (!user) {
            this.logger.warn(`isProfileComplete: No user object provided`);
            return false;
        }
        if (user.role === 'GUEST') {
            this.logger.log(
                `isProfileComplete: User ${user.phoneNumber} is GUEST, incomplete`,
            );
            return false;
        }

        // 1. Basic check: Needs Name and Location (GPS)
        const hasLocation = user.locationLat !== null && user.locationLng !== null;

        let hasName = !!user.name;

        this.logger.log(
            `isProfileComplete [${user.role}] ${user.phoneNumber}: name=${hasName}, hasLocation=${hasLocation}`,
        );

        // 2. Role-specific profile check
        try {
            if (user.role === 'LABOUR') {
                const profile = await this.prisma.labourProfile.findUnique({
                    where: { userId: user.id },
                });
                const isComplete =
                    !!profile && hasName && hasLocation;
                this.logger.log(
                    `isProfileComplete [LABOUR] result=${isComplete} (profileFound=${!!profile})`,
                );
                return isComplete;
            }

            if (user.role === 'TRANSPORTER') {
                const profile = await this.prisma.transporterProfile.findUnique({
                    where: { userId: user.id },
                });
                // Fallback for Transporters identity
                if (profile && !hasName && profile.businessName) {
                    hasName = true;
                    this.logger.log(
                        `isProfileComplete [TRANSPORTER]: Fallback name to businessName "${profile.businessName}"`,
                    );
                }
                const isComplete = !!profile && hasName && hasLocation;
                this.logger.log(
                    `isProfileComplete [TRANSPORTER]: profile=${!!profile}, name=${hasName}, loc=${hasLocation} => result=${isComplete}`,
                );
                return isComplete;
            }
        } catch (e) {
            this.logger.error(
                `Error checking profile completeness for ${user.id}:`,
                e,
            );
            return false;
        }

        const farmerComplete =
            hasName && hasLocation;
        this.logger.log(`isProfileComplete [FARMER] result=${farmerComplete}`);
        return farmerComplete;
    }

    async updateProfile(userId: string, data: Partial<User>) {
        if (data.role) {
            data.role = data.role.toUpperCase() as any;
        }
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
            data: {
                locationLat: data.lat,
                locationLng: data.lng,
            },
            select: {
                id: true,
                locationLat: true,
                locationLng: true,
            },
        });
    }

    async verifyPhoneUpdate(userId: string, updatePhoneDto: any) {
        const { newPhoneNumber, otp } = updatePhoneDto;

        // 1. Check if number is already in use
        const existingUser = await this.prisma.user.findUnique({
            where: { phoneNumber: newPhoneNumber },
        });

        if (existingUser) {
            throw new BadRequestException(
                'This phone number is already registered to another account.',
            );
        }

        // 2. Verify OTP from Redis
        const key = `otp:${newPhoneNumber}`;
        const storedOtp = await this.redis.get(key);

        if (!storedOtp) {
            throw new BadRequestException(
                'OTP expired or not found. Please request a new one for the new number.',
            );
        }

        if (storedOtp !== otp && otp !== '123456') {
            // Allow 123456 for dev
            throw new BadRequestException('Invalid OTP');
        }

        // 3. Update Phone Number
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { phoneNumber: newPhoneNumber },
            select: {
                id: true,
                phoneNumber: true,
                isVerified: true,
            },
        });

        // 4. Cleanup
        await this.redis.del(key);

        return {
            success: true,
            message: 'Phone number updated successfully',
            user: updatedUser,
        };
    }

    async logout(userId: string) {
        // Remove session from Redis
        await this.redis.del(`session:${userId}`);
        return { success: true, message: 'Logged out successfully' };
    }

    async deleteAccount(userId: string) {
        this.logger.log(`🗑️ Deleting account for user: ${userId}`);

        return await this.prisma.$transaction(
            async (tx) => {
                // 1. Get user to find profiles
                this.logger.verbose(`1. Fetching user and profiles`);
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    include: {
                        labourProfile: true,
                        transporterProfile: {
                            include: { vehicles: true },
                        },
                    },
                });

                if (!user) {
                    this.logger.error(`User ${userId} not found for deletion`);
                    throw new UnauthorizedException('User not found');
                }

                // 2. Cleanup Transporter Data
                if (user.transporterProfile) {
                    this.logger.verbose(
                        `2. Cleaning up Transporter Data for ${user.transporterProfile.id}`,
                    );
                    const vehicleIds = user.transporterProfile.vehicles.map((v) => v.id);

                    this.logger.debug(
                        `Deleting vehicle availabilities, drivers, and transport requests`,
                    );
                    await tx.vehicleAvailability.deleteMany({
                        where: { vehicleId: { in: vehicleIds } },
                    });
                    await tx.driver.deleteMany({
                        where: { vehicleId: { in: vehicleIds } },
                    });

                    this.logger.debug(
                        `Deleting all transport requests for this transporter (by vehicle or ID)`,
                    );
                    await tx.transportRequest.deleteMany({
                        where: {
                            OR: [
                                { vehicleId: { in: vehicleIds } },
                                { transporterId: user.transporterProfile.id },
                            ],
                        },
                    });

                    this.logger.debug(`Deleting vehicles and trips`);
                    await tx.vehicle.deleteMany({
                        where: { transporterId: user.transporterProfile.id },
                    });
                    await tx.transportTrip.deleteMany({
                        where: { transporterId: user.transporterProfile.id },
                    });

                    this.logger.debug(`Deleting transporter profile`);
                    await tx.transporterProfile.delete({
                        where: { id: user.transporterProfile.id },
                    });
                }

                // 3. Cleanup Labour Data
                if (user.labourProfile) {
                    this.logger.verbose(
                        `3. Cleaning up Labour Data for ${user.labourProfile.id}`,
                    );
                    await tx.labourBooking.deleteMany({
                        where: { labourId: user.labourProfile.id },
                    });
                    await tx.labourProfile.delete({
                        where: { id: user.labourProfile.id },
                    });
                }

                // 4. Cleanup Farmer/General Data
                this.logger.verbose(`4. Cleaning up General User Data`);

                this.logger.debug(`Fetching user machines to clear related orders`);
                const userMachines = await tx.machine.findMany({
                    where: { ownerId: userId },
                    select: { id: true },
                });
                const machineIds = userMachines.map((m) => m.id);

                this.logger.debug(
                    `Deleting orders involving the user or their machines`,
                );
                await tx.order.deleteMany({
                    where: {
                        OR: [
                            { buyerId: userId },
                            { sellerId: userId },
                            { machineId: { in: machineIds } },
                        ],
                    },
                });

                this.logger.debug(`Deleting machines`);
                await tx.machine.deleteMany({ where: { ownerId: userId } });

                this.logger.debug(`Deleting common requests and logs`);
                await tx.transportRequest.deleteMany({ where: { farmerId: userId } });
                await tx.transportTrip.deleteMany({ where: { farmerId: userId } });
                await tx.labourBooking.deleteMany({ where: { farmerId: userId } });
                await tx.payment.deleteMany({ where: { userId } });
                await tx.callLog.deleteMany({
                    where: { OR: [{ callerId: userId }, { receiverId: userId }] },
                });
                await tx.auditLog.deleteMany({ where: { userId } });

                // 5. Delete User & Clear Redis
                this.logger.verbose(`5. Final deletion of User record`);
                await tx.user.delete({ where: { id: userId } });

                this.logger.debug(`Clearing Redis session`);
                if (this.redis) {
                    await this.redis.del(`session:${userId}`);
                }

                this.logger.log(`✅ Successfully deleted account for user: ${userId}`);
                return {
                    success: true,
                    message: 'Account and all related data deleted successfully',
                };
            },
            {
                timeout: 30000, // 30 seconds for complete cleanup
            },
        );
    }
}
