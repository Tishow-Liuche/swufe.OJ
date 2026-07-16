# 数据库同步说明

Git 合并只会同步代码，不会同步 PostgreSQL 里的账号数据。队友 pull 最新代码后，需要同步数据库结构和 Prisma Client，否则登录、班级、个人中心等功能可能因为字段不一致而失败。

## 推荐方式

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-dev-db.ps1 -InstallDependencies
```

如果依赖已经安装过，可以省略 `-InstallDependencies`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-dev-db.ps1
```

脚本会执行：

1. 检查 `packages/backend/.env` 是否存在；
2. 修复历史上失败过的 `20260715190000_baseline_schema` 迁移记录；
3. 执行 `prisma migrate deploy`；
4. 执行 `prisma generate`。

## 注意

- 你的账号数据存在数据库里，不存在 Git 分支里。
- 如果队友使用自己的 PostgreSQL 数据库，你的账号不会自动出现；需要重新注册、导入数据库备份，或使用相同的数据库。
- 如果只是代码合并后登录失败，优先运行上面的同步脚本，不要直接删库。

## 后端等价命令

也可以在 `packages/backend` 目录手动执行：

```bash
npm run db:sync
```

如果本地曾经出现过失败的 baseline 迁移，需要先执行：

```bash
npx prisma migrate resolve --rolled-back 20260715190000_baseline_schema
```
