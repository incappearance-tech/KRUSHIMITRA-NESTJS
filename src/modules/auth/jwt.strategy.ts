import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
    // PrismaService already injected above — used directly for AuditLog writes
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

    super({
      jwtFromRequest:    ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration:  false,
      secretOrKey:       jwtSecret,
      passReqToCallback: true, // needed for device-binding header check
    });
  }

  async validate(request: any, payload: any) {
    // 1. Check Redis whitelist using the jti (JWT ID) claim.
    //    verifyOtp stores a random UUID as the session token; we compare it here.
    //    Using a random UUID means a Redis compromise yields UUIDs, not raw JWTs.
    const storedJti = await this.redis.get(`session:${payload.sub}`);
    if (!storedJti) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    const payloadJti: string = payload.jti ?? '';

    // Both sides are UUID strings (36 chars). Timing-safe comparison prevents
    // length-oracle and timing side-channel attacks.
    if (storedJti.length !== payloadJti.length) {
      throw new UnauthorizedException('Session expired or logged out');
    }
    if (!crypto.timingSafeEqual(Buffer.from(storedJti as string), Buffer.from(payloadJti))) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    // 2. Soft device-binding check — log mismatch but do not hard-block
    //    (prevents locking out users who reinstalled the app)
    const tokenIid  = payload.iid as string | null | undefined;
    const headerIid = request.headers?.['x-instance-id'] as string | undefined;
    if (tokenIid && headerIid && tokenIid !== headerIid) {
      // Write to AuditLog (fire-and-forget) so security team can review anomalies
      this.prisma.auditLog.create({
        data: {
          userId:   payload.sub,
          action:   'DEVICE_BINDING_MISMATCH',
          resource: 'auth',
          details:  {
            tokenIid,
            requestIid: headerIid,
            url: request.url,
          },
        },
      }).catch(() => { /* non-critical */ });
    }

    // 3. Verify user still exists
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
        preferredLanguage: true,
        isVerified: true,
        fcmToken: true,
        deviceOS: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return user;
  }
}
