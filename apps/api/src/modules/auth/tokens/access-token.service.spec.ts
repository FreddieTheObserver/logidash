import { JwtService } from '@nestjs/jwt';
import { Role } from '../../../generated/prisma/enums';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret-test-secret-0123456789' });
  const service = new AccessTokenService(jwt);
  it('signs a token carrying sub, email, and role', async () => {
    const token = await service.sign({
      id: 'user-1',
      email: 'a@logidash.dev',
      role: Role.admin,
    });
    const decoded = jwt.decode<{ sub: string; email: string; role: Role }>(
      token,
    );
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@logidash.dev');
    expect(decoded.role).toBe(Role.admin);
  });
});
