-- 认证令牌版本：管理员重置密码后使旧访问令牌和会话失效。
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;
