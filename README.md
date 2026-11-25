# IT监控平台

Next.js + PostgreSQL 的集群用户、存储用量与限额查询系统。前端参考 [RuoYi-Vue](https://gitee.com/y_project/RuoYi-Vue) 的左侧深色导航、顶部面包屑、卡片与表格样式；未引入若依代码或 Java 后端。业务数据只来自管理员导入的三份源文件。工单仅收集修改申请，不改变用户或存储快照。

## 功能

- 三文件联合导入：软件用户 XLSX、存储用量 CSV、存储规则 CSV；事务写入和相同文件组去重。
- `home`/`data` 默认与专属限额，字节原值存储，GB/TB 切换展示。
- 用户查询、用量和配额使用率、最近 30 批趋势、未关联记录和共享记录单列展示。
- 分析中心：项目/部门限额与已用汇总、按限额/用量/使用率/增长量排行、停用和资料不一致等异常筛查、批次趋势及历史对比。筛选可组合使用，支持下钻到所选批次账号详情。
- 账号用量活跃度：选择任意已导入的起止批次，按所选目录统计逐批变动、连续低变动次数与采集覆盖，筛出需要人工复核的账号。
- Excel 导出：按当前筛选条件导出完整结果，支持选择账号、工作表、列和容量单位；工单导出只向已登录管理员开放。
- 免登录工单：集群资源工单可申请 1–10 项资源修改；Polarion 用户申请工单可一次填 1–10 位申请人的姓名和工号。按类型、查询编号和首位申请人的工号查状态，管理员按类型筛选、处理和导出。
- 连续三次成功的新导入没有出现的软件账号在后台标记为已删除；历史快照不改写。

## 本地开发

需要 Node.js 22+ 和 PostgreSQL 17。复制 `.env.example` 为 `.env`，设置 `DATABASE_URL` 或 `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`，并设置至少 12 位的 `ADMIN_PASSWORD`。首次数据库访问会创建表和管理员。

```powershell
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。`pnpm test` 验证样例文件解析；`pnpm typecheck` 和 `pnpm build` 验证代码。样例文件只用于本地核对，不会进入 Docker 构建上下文。

## Docker 部署与离线导入

在可下载依赖与基础镜像的构建机上，先将 `.env.example` 复制为 `.env` 并设置两个不同的强密码，然后执行：

```bash
docker compose build web
docker pull postgres:17-alpine
docker tag postgres:17-alpine cluster-monitor/postgres:17-alpine
docker save -o cluster-monitor-images.tar cluster-monitor:0.2.0 cluster-monitor/postgres:17-alpine
```

Windows 构建机也可以运行 `powershell -File scripts/export-images.ps1`，脚本会构建 Linux x86_64 镜像并输出 TAR 的 SHA-256。已有 0.1.0 部署可用 `release/cluster-monitor-upgrade-0.2.0-linux-amd64.zip` 升级 Web，操作见包内 `DEPLOY-zh-CN.md`。首次部署时仍需 PostgreSQL 镜像。

将 `cluster-monitor-images.tar`、`compose.yaml`、`.env` 拷贝到内网部署主机的独立目录，在部署主机执行：

```bash
docker load -i cluster-monitor-images.tar
docker compose up -d --no-build --pull never
```

默认在主机 `3000` 端口提供服务；数据库只在 Compose 内部网络开放，数据保存在 `cluster_db` 命名卷中。已核对部署虚拟机为 Linux x86_64，Docker 26.1.3、Compose 2.27.0；构建镜像应选 `linux/amd64`。更新镜像不会删除数据库卷；升级前应备份卷或执行数据库备份。不要把样例数据或 `ssh.md` 放进镜像。

默认按内网 HTTP 访问设置管理员会话 Cookie。若通过 HTTPS 反向代理提供服务，将 `.env` 中的 `COOKIE_SECURE` 设为 `true`。

## 导入约束

三个文件必须一起上传。CSV 第五行是表头；用量 CSV 为 UTF-8，规则 CSV 为 GBK/GB18030。规则文件的“所有用户”两行是默认规则。用量 I 列和规则 G 列按字节存储；J/K/L 文件指标不入库。账号字段中包含逗号的共享记录独立展示，不分摊到个人，也不计入个人用量汇总。

详细核对结果见 [开发前核对.md](./开发前核对.md)。

## 分析口径

- 项目/部门分组直接取每批软件用户文件的“所属部门”原值；项目代号和“项目池”等类别均按原值展示，不依赖旧汇总表，也不增加日常导入文件。
- 限额为该批每账号每目录的生效空间硬限制之和，专属规则优先于默认规则；它是账号配额，不表示设备已物理预留的容量。排行按原始字节数计算。
- 已用合计为已采集到的用量之和。缺失目录保持“未采集到”，并在汇总显示完整采集账号数；汇总使用率只对所选目录用量完整的账号计算。
- 共享和未关联存储记录不分摊到个人或项目。用户名与实际使用人不一致只统计两者均非空且去除首尾空格后不同的账号，实际使用人为空单独统计。
- 趋势使用实际成功导入的批次和当批归属，不补造未导入的时间点；历史对比中“进入/离开当前范围”也可能由筛选条件或部门调整导致。
- 活跃度只比较用量完整的相邻批次，区间内的总变动累加每次增减的绝对值；缺采和账号未出现都不会按零处理。待复核要求区间采集完整，且结束前连续达到用户设定的低变化阈值。结果不代表登录或任务记录。
- 页面统一使用直角样式，不设置圆角。

## 发布前核对

- 0.2.0 使用 Next.js 16.4.6，包含[官方 11 月安全更新](https://nextjs.org/blog/november-2026-security-release)。
- 当前 `pnpm audit --prod` 无高危项，仍有一项来自 ExcelJS 依赖的 `uuid` 中危提示；本系统没有调用该提示所涉及的 UUID v3/v5/v6 缓冲区接口。后续 ExcelJS 更新时应复查。
