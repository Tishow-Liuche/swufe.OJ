# 西财 OJ 平台 — 搭建指南

## 前置条件

### 1. 安装 WSL2 + Ubuntu（Windows）

```powershell
# 以管理员身份运行 PowerShell
wsl --install -d Ubuntu-22.04
# 重启电脑
```

安装后打开 Ubuntu，设置用户名和密码。

### 2. 安装 Docker Desktop

下载 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)，安装时勾选 "Use WSL 2 instead of Hyper-V"。

验证：
```bash
wsl -l -v
# 应该显示 Ubuntu-22.04 Running (WSL 2)

docker -v
docker compose version
```

---

## 启动基础设施

```bash
# 在项目根目录
cp config/infra.env.example config/infra.env
# 编辑 config/infra.env：所有密码必须替换为不同的随机强密码
docker compose --env-file config/infra.env up -d
```

基础设施端口只绑定到 `127.0.0.1`，不能从局域网或公网直接访问。请通过受控反向代理发布应用 API，而不是暴露 PostgreSQL、Redis、MinIO 或 go-judge 端口。

验证：
```bash
# PostgreSQL
docker exec oj-postgres pg_isready -U oj -d oj_platform

# Redis
docker exec oj-redis redis-cli --no-auth-warning -a "<REDIS_PASSWORD>" ping

# MinIO
curl http://127.0.0.1:9000
# 管理控制台: http://127.0.0.1:9001（使用 config/infra.env 中的自定义账户）

# go-judge
curl http://localhost:5050/version
```

---

## 初始化后端

```bash
cd packages/backend

# 复制环境变量（已创建则跳过）
cp ../../config/.env.example .env
# 将 DATABASE_URL、REDIS_PASSWORD、S3_ACCESS_KEY、S3_SECRET_KEY 与 config/infra.env 保持一致
# 生产环境：NODE_ENV=production、COOKIE_SECURE=true；仅在受信任反向代理之后设置 TRUST_PROXY=true

# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 数据库迁移
npx prisma migrate deploy

# 启动开发服务器
npm run start:dev
```

本次刷新会话安全迁移会删除旧会话，部署后用户需要重新登录。不会自动重启已有 Docker 容器；更换 PostgreSQL、Redis 或 MinIO 密钥时，请安排维护窗口，先更新 `config/infra.env` 与后端 `.env`，再逐项重启依赖服务并检查健康状态。

历史题目不会自动指定创建者，默认仅管理员可管理。管理员可显式转交：

```bash
curl -X PATCH http://localhost:3000/api/problems/<题目ID>/owner \
  -H "Authorization: Bearer <管理员 access token>" \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"<教师或管理员用户ID>"}'
```

API 运行在 http://localhost:3000

---

## 初始化前端

```bash
cd packages/frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 http://localhost:5173

---

## 验证核心流程

1. 浏览器打开 http://localhost:5173
2. 注册账号
3. 登录后，用 curl 创建一个测试题目：
```bash
curl -X POST http://localhost:3000/api/problems \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的 accessToken>" \
  -d '{"title": "A + B", "description": "计算两个整数的和", "difficulty": "BEGINNER", "timeLimit": 1000, "memoryLimit": 256}'
```
4. 在题库页提交代码
5. 查看提交记录

---

## 下一步

- [ ] 安装 Docker Desktop + WSL2 Ubuntu
- [ ] 运行 `docker compose up -d`
- [ ] 运行 Prisma 迁移
- [ ] 对接 go-judge API 替换模拟评测
