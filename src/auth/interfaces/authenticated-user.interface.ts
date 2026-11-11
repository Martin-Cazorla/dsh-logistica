// dsh-logistica/src/auth/interfaces/authenticated-user.interface.ts

import { UserRole } from '@prisma/client';

/**
 * Forma del usuario que JwtStrategy adjunta a request.user
 * (y que el gateway adjunta a socket.data.user).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}
