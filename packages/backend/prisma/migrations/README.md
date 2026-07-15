# 数据库迁移规范

本目录以 `20260715190000_baseline_schema` 作为当前项目数据库结构的基线。后续数据库变更必须通过新的 Prisma migration 提交，不得在部署环境使用 `prisma db push`。

## 新环境

```powershell
npx prisma migrate deploy
npx prisma generate
```

## 已存在的旧开发/部署数据库

执行前先完成数据库备份。旧数据库已经包含这份基线中的表结构，因此只需执行一次：

```powershell
npx prisma migrate resolve --applied 20260715190000_baseline_schema
```

之后统一使用 `npx prisma migrate deploy` 升级。每次升级先在备份或预发布数据库执行 `npx prisma migrate status` 和迁移演练；若迁移失败，使用备份恢复，不直接以 `db push --accept-data-loss` 覆盖数据。
