export class TransportRequestCreatedEvent {
    constructor(
        public readonly requestId: string,
        public readonly farmerId: string,
        public readonly vehicleId: string,
        public readonly distanceKm: number,
    ) { }
}

export class BookingStatusUpdatedEvent {
    constructor(
        public readonly bookingId: string,
        public readonly status: 'accepted' | 'rejected' | 'completed' | 'cancelled',
        public readonly triggerUserId: string,
        public readonly targetUserId: string,
    ) { }
}

export class UserRegisteredEvent {
    constructor(
        public readonly userId: string,
        public readonly role: 'FARMER' | 'LABOURER' | 'TRANSPORTER',
        public readonly phone: string,
    ) { }
}
