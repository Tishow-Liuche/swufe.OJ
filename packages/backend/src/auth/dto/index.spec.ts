import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './index';

function registerDto(username: string) {
  return plainToInstance(RegisterDto, {
    username,
    email: 'student@example.com',
    password: 'Passw0rd1',
    school: 'SWUFE',
    college: 'Computer Science',
    requestedRole: 'STUDENT',
  });
}

describe('RegisterDto username validation', () => {
  it('accepts a one-character Chinese campus account name', async () => {
    const errors = await validate(registerDto('张'));

    expect(errors).toHaveLength(0);
  });

  it('rejects usernames longer than twenty characters or containing spaces', async () => {
    await expect(validate(registerDto('张'.repeat(21)))).resolves.not.toHaveLength(0);
    await expect(validate(registerDto('张 三'))).resolves.not.toHaveLength(0);
  });
});
