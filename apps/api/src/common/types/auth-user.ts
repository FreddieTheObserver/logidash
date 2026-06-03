import { Role } from '../../generated/prisma/enums';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
