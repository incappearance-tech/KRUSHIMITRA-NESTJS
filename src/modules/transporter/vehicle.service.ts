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
        if (vehicle.expiryDate && vehicle.expiryDate > now) {
            throw new BadRequestException('Cannot delete vehicle with an active subscription');
        }

        const futureRequests = await this.prisma.transportRequest.count({
            where: {
                vehicleId,
                requiredDate: { gte: now },
                status: { in: ['SENT', 'ACCEPTED', 'SCHEDULED'] },
            },
        });
        if (futureRequests > 0) throw new BadRequestException('Cannot delete vehicle with future bookings');

        return this.prisma.vehicle.delete({ where: { id: vehicleId } });
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
