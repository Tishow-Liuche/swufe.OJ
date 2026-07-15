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
docker compose up -d
```

验证：
```bash
# PostgreSQL
docker exec oj-postgres pg_isready -U oj -d oj_platform

# Redis
docker exec oj-redis redis-cli ping

# MinIO
curl http://localhost:9000
# 管理控制台: http://localhost:9001 (minioadmin / minioadmin_dev)

# go-judge
curl http://localhost:5050/version
```

---

## 初始化后端

```bash
cd packages/backend

# 复制环境变量（已创建则跳过）
cp ../../config/.env.example .env

# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 数据库迁移
npx prisma migrate deploy

# 启动开发服务器
npm run start:dev
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
