import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restrict an endpoint to specific roles. Usage: @Roles('ADMIN') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
