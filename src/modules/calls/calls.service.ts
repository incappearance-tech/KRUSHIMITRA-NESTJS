import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as https from 'https';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async connectCall(
    callerId: string,
    receiverId: string,
    bookingId?: string,
    bookingType?: string,
  ) {
    // Authorization: caller must have an active booking with the receiver.
    // Prevents any user from initiating a masked call to any other user.
    const hasRelationship = await this.verifyCallRelationship(callerId, receiverId, bookingId, bookingType);
    if (!hasRelationship) {
      throw new ForbiddenException('You do not have an active booking with this user');
    }

    const sid = this.config.get<string>('EXOTEL_SID');
    const apiKey = this.config.get<string>('EXOTEL_API_KEY');
    const apiToken = this.config.get<string>('EXOTEL_API_TOKEN');

    // Fetch caller and receiver phone numbers
    const [caller, receiver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: callerId },
        select: { phoneNumber: true },
      }),
      this.prisma.user.findUnique({
        where: { id: receiverId },
        select: { phoneNumber: true },
      }),
    ]);

    if (!caller || !receiver) {
      return { success: false, message: 'User not found' };
    }

    let exotelCallId: string | undefined;

    if (sid && apiKey && apiToken) {
      // Initiate masked call via Exotel
      const callResult = await this.initiateExotelCall(
        sid,
        apiKey,
        apiToken,
        caller.phoneNumber,
        receiver.phoneNumber,
      );
      exotelCallId = callResult?.Sid;
    } else {
      this.logger.warn(
        'Exotel not configured — call log created without initiating call',
      );
    }

    // Save call log
    const log = await this.prisma.callLog.create({
      data: {
        callerId,
        receiverId,
        bookingId,
        bookingType,
        exotelCallId,
        status: exotelCallId ? 'initiated' : 'failed',
      },
    });

    return { success: !!exotelCallId, callId: log.id, exotelCallId };
  }

  private initiateExotelCall(
    sid: string,
    apiKey: string,
    apiToken: string,
    from: string,
    to: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = new URLSearchParams({
        From: from,
        To: to,
        CallerId: `0${sid}`,
      }).toString();

      const options = {
        hostname: `api.exotel.com`,
        path: `/v1/Accounts/${sid}/Calls/connect.json`,
        method: 'POST',
        auth: `${apiKey}:${apiToken}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': postData.length,
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data)?.Call);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async verifyCallRelationship(
    callerId: string,
    receiverId: string,
    bookingId?: string,
    bookingType?: string,
  ): Promise<boolean> {
    // If a specific bookingId is provided, verify it links caller and receiver
    if (bookingId) {
      const booking = await this.prisma.labourBooking.findFirst({
        where: {
          id: bookingId,
          OR: [
            { farmerId: callerId, labourProfile: { userId: receiverId } },
            { farmerId: receiverId, labourProfile: { userId: callerId } },
          ],
          status: { in: ['accepted', 'pending'] },
        },
      }).catch(() => null);
      if (booking) return true;

      const transportRequest = await this.prisma.transportRequest.findFirst({
        where: {
          id: bookingId,
          OR: [
            {
              farmerId: callerId,
              vehicle: { transporter: { userId: receiverId } },
            },
            {
              farmerId: receiverId,
              vehicle: { transporter: { userId: callerId } },
            },
          ],
          status: { in: ['ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL'] },
        },
      }).catch(() => null);
      if (transportRequest) return true;
    }

    // Fallback: check any active relationship between the two users
    const [labourRelation, transportRelation] = await Promise.all([
      this.prisma.labourBooking.findFirst({
        where: {
          OR: [
            { farmerId: callerId, labourProfile: { userId: receiverId } },
            { farmerId: receiverId, labourProfile: { userId: callerId } },
          ],
          status: { in: ['accepted', 'pending'] },
        },
      }),
      // IMPORTANT: must verify the specific farmer ↔ transporter relationship,
      // not just that one party has *any* transport request.
      this.prisma.transportRequest.findFirst({
        where: {
          OR: [
            {
              farmerId: callerId,
              vehicle: { transporter: { userId: receiverId } },
            },
            {
              farmerId: receiverId,
              vehicle: { transporter: { userId: callerId } },
            },
          ],
          status: { in: ['ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL', 'SENT'] },
        },
      }),
    ]);

    return !!(labourRelation || transportRelation);
  }

  async getHistory(userId: string) {
    return this.prisma.callLog.findMany({
      where: { OR: [{ callerId: userId }, { receiverId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        caller: { select: { name: true, phoneNumber: true } },
        receiver: { select: { name: true, phoneNumber: true } },
      },
    });
  }
}
