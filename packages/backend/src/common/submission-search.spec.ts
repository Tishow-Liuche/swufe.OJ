import { nicknameFilter } from './submission-search';
describe('nickname submission search', () => {
  it('trims nickname and applies case insensitive database filtering', () => {
    expect(nicknameFilter(' Alice ')).toEqual({ user: { nickname: { contains: 'Alice', mode: 'insensitive' } } });
  });
  it('does not add a filter for blank or invalid queries', () => {
    expect(nicknameFilter('  ')).toEqual({});
    expect(nicknameFilter(undefined)).toEqual({});
    expect(nicknameFilter(['x'])).toEqual({});
  });
});
