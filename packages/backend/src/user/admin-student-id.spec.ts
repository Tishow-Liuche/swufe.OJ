import { UserService } from './user.service';

it('selects the bound student ID for the admin account list without selecting credentials', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  await new UserService({ user: { findMany } } as any, {} as any).listUsers();
  const query = findMany.mock.calls[0][0];
  expect(query.where).toEqual({ deletedAt: null });
  expect(query.select.studentId).toBe(true);
  expect(query.select.password).toBeUndefined();
});
