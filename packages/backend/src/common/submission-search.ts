export function nicknameFilter(value: unknown) {
  const nickname = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return nickname ? { user: { nickname: { contains: nickname, mode: 'insensitive' as const } } } : {};
}
