# 数据库迁移规范

本目录以 `20260715190000_baseline_schema` 作为新数据库的初始结构。后续数据库变更必须通过新的 Prisma migration 提交，不得在部署环境使用 `prisma db push`。

## 新环境

```powershell
npx prisma migrate deploy
npx prisma generate
```

## 已存在的旧开发/部署数据库

执行前先完成数据库备份。迁移目录加入前创建的旧数据库通常已经有基础表，但缺少比赛、班级审核和学生资料等后续字段；不要直接执行 baseline 的 `CREATE TABLE`。

先将 baseline 标记为已应用，再执行 deploy。后续的 `20260715194000_upgrade_origin_main_schema` 会以幂等方式补齐旧数据库缺失的字段，并仅将历史班级回填为已审核：

```powershell
npx prisma migrate resolve --applied 20260715190000_baseline_schema
```

之后统一使用 `npx prisma migrate deploy` 升级。每次升级先在备份或预发布数据库执行 `npx prisma migrate status` 和迁移演练；若迁移失败，使用备份恢复，不直接以 `db push --accept-data-loss` 覆盖数据。
