import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev_secret',
    });
  }

  async validate(payload: any) {
    // 1. Check Redis Whitelist
    const session = await this.redis.get(`session:${payload.sub}`);
    if (!session) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    // 2. Check User in DB
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        role: true,
        farmerId: true,
        locationLat: true,
        locationLng: true,
        locationAddress: true,
        preferredLanguage: true,
        isVerified: true,
        fcmToken: true,
        deviceOS: true,
        state: true,
        district: true,
        taluka: true,
        village: true,
        pincode: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return user;
  }
}
