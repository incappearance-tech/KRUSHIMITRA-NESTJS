import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { SetAvailabilityDto } from './dto/vehicle-availability.dto';

@Injectable()
export class VehicleService {
    constructor(private prisma: PrismaService) { }

    async addVehicle(userId: string, dto: CreateVehicleDto) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { userId },
            include: { vehicles: { select: { id: true } } },
        });
        if (!profile) throw new NotFoundException('Transporter profile not found');

        if (dto.plan === 'free' && profile.vehicles.length > 0) {
            throw new BadRequestException(
                'Free trial is only available for your first vehicle addition.',
            );
        }

        // ── Duplicate number-plate guard ──────────────────────────────────────
        if (dto.numberPlate) {
            const plateTaken = await this.prisma.vehicle.findFirst({
                where: {
                    transporterId: profile.id,
                    numberPlate: { equals: dto.numberPlate.trim(), mode: 'insensitive' },
                },
            });
            if (plateTaken) {
                throw new BadRequestException(
                    `A vehicle with number plate "${dto.numberPlate}" is already in your fleet.`,
                );
            }
        }

        // ── Duplicate driver phone guard ──────────────────────────────────────
        if (dto.driverPhone) {
            const phoneTaken = await this.prisma.vehicle.findFirst({
                where: {
                    transporterId: profile.id,
                    driverPhone: dto.driverPhone.trim(),
                },
            });
            if (phoneTaken) {
                throw new BadRequestException(
                    `A driver with mobile number "${dto.driverPhone}" is already assigned to another vehicle in your fleet.`,
                );
            }
        }

        const { expiryDate, ...vehicleData } = dto;

        const vehicle = await this.prisma.vehicle.create({
            data: {
                ...vehicleData,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                transporterId: profile.id,
            },
        });

        if (dto.plan === 'free') {
            await this.prisma.payment.create({
                data: {
                    userId: userId,
                    type: 'SUBSCRIPTION',
                    amount: 0,
                    status: 'PAID',
                    entityId: vehicle.id,
                    razorpayOrderId: `FREE_${vehicle.id.slice(0, 8)}_${Date.now()}`,
                    razorpayPaymentId: 'FREE_TRIAL',
                }
            });
        }

        return {
            ...vehicle,
            ratePerKm: vehicle.ratePerKm ? Number(vehicle.ratePerKm) : null
        };
    }

    async updateVehicle(userId: string, vehicleId: string, dto: Partial<CreateVehicleDto>) {
        // ── Duplicate driver phone guard (edit) ───────────────────────────────
        if (dto.driverPhone) {
            const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
            if (profile) {
                const phoneTaken = await this.prisma.vehicle.findFirst({
                    where: {
                        transporterId: profile.id,
                        id: { not: vehicleId },          // exclude the vehicle being edited
                        driverPhone: dto.driverPhone.trim(),
                    },
                });
                if (phoneTaken) {
                    throw new BadRequestException(
                        `A driver with mobile number "${dto.driverPhone}" is already assigned to another vehicle (${phoneTaken.model}) in your fleet.`,
                    );
                }
            }
        }

        const { expiryDate, ...vehicleData } = dto;

        const vehicle = await this.prisma.vehicle.update({
            where: { id: vehicleId },
            data: {
                ...vehicleData,
                expiryDate: expiryDate ? new Date(expiryDate) : undefined,
            },
        });

        return {
            ...vehicle,
            ratePerKm: vehicle.ratePerKm ? Number(vehicle.ratePerKm) : null
        };
    }

    async deleteVehicle(userId: string, vehicleId: string) {
        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
        });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const now = new Date();

        // Block deletion of vehicles that still have an active paid subscription
        if (vehicle.expiryDate && vehicle.expiryDate > now) {
            throw new BadRequestException(
                'Cannot delete a vehicle with an active subscription. Please wait until it expires.',
            );
        }

        // Block deletion if there are any upcoming active bookings
        const futureRequests = await this.prisma.transportRequest.count({
            where: {
                vehicleId,
                requiredDate: { gte: now },
                status: { in: ['SENT', 'ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL'] },
            },
        });
        if (futureRequests > 0) {
            throw new BadRequestException(
                'Cannot delete vehicle — it has active or upcoming bookings.',
            );
        }

        // Cascade delete all related records in a transaction
        // (plain vehicle.delete() fails with FK constraint when related rows exist)
        await this.prisma.$transaction([
            this.prisma.vehicleAvailability.deleteMany({ where: { vehicleId } }),
            this.prisma.driver.deleteMany({ where: { vehicleId } }),
            // Historical requests are kept for audit — only unlink if schema allows null; otherwise delete
            this.prisma.transportRequest.deleteMany({ where: { vehicleId } }),
            this.prisma.vehicle.delete({ where: { id: vehicleId } }),
        ]);

        return { success: true };
    }

    async getVehicleAvailability(vehicleId: string, month?: string) {
        const where: any = { vehicleId };
        if (month) {
            const [y, m] = month.split('-').map(Number);
            const start = new Date(Date.UTC(y, m - 1, 1));
            const end = new Date(Date.UTC(y, m, 1));
            where.date = { gte: start, lt: end };
        }
        return this.prisma.vehicleAvailability.findMany({
            where,
            orderBy: { date: 'asc' },
        });
    }

    async setVehicleAvailability(userId: string, vehicleId: string, dto: SetAvailabilityDto) {
        const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
        if (!profile) throw new NotFoundException('Transporter profile not found');

        const vehicle = await this.prisma.vehicle.findFirst({
            where: { id: vehicleId, transporterId: profile.id },
        });
        if (!vehicle) throw new ForbiddenException('Vehicle not found or not yours');

        // Parse YYYY-MM-DD directly into UTC midnight to avoid server timezone shifts
        const [year, mon, day] = dto.date.split('-').map(Number);
        const date = new Date(Date.UTC(year, mon - 1, day));

        return this.prisma.vehicleAvailability.upsert({
            where: { vehicleId_date: { vehicleId, date } },
            create: { vehicleId, date, state: dto.state as any, note: dto.note },
            update: { state: dto.state as any, note: dto.note },
        });
    }
}
