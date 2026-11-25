# IT 监控平台本地启动说明

本流程用于在 Windows 上预览代码修改。Next.js 在 Windows 上运行，PostgreSQL 在 VMware 开发虚拟机的 Docker 容器里运行。浏览器打开 [http://127.0.0.1:3100/](http://127.0.0.1:3100/)，Next.js 通过本机 `127.0.0.1:15488` 的 SSH 隧道读取预览数据库。

## 1. 启动虚拟机和数据库

在 VMware Workstation 启动现有的 `polarion-test` 虚拟机。也可以在 Windows PowerShell 中后台启动：

```powershell
& 'D:\apps\vmware\vmrun.exe' -T ws start 'D:\datas\vmware_datas\polarion-test\polarion-test.vmx' nogui
```

虚拟机启动后，用工作区里的 [ssh.md](../ssh.md) 所列账号登录开发虚拟机：

```powershell
ssh.exe root@192.168.204.128
```

登录后，在虚拟机终端启动现有的预览数据库容器并检查状态：

```bash
docker start cluster_monitor_preview_20261112
docker exec cluster_monitor_preview_20261112 sh -c 'pg_isready -U "$POSTGRES_USER" -d cluster_monitor_real'
```

看到 `accepting connections` 后继续。这个容器的宿主机端口是虚拟机的 `127.0.0.1:15488`，容器内部对应 PostgreSQL 的 `5432`。预览使用已有的 `cluster_monitor_real` 数据库。上次验证时库里有 1 个实际导入批次、234 个账号。

## 2. 在 Windows 建立 SSH 隧道

另开一个 PowerShell 窗口，执行下列命令。输入 SSH 密码后，保持这个窗口运行。连接成功时窗口可以没有输出。

```powershell
ssh.exe -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=25 -L 127.0.0.1:15488:127.0.0.1:15488 root@192.168.204.128
```

## 3. 启动 Windows 上的 Next.js

项目目录为 `D:\files\工作区\polarion二次开发\集群监控系统`。当前开发机使用 Node.js 24 和 pnpm 11.25.0。仅在依赖尚未安装或锁文件更新后，先在项目目录运行 `pnpm install --frozen-lockfile`。

再开一个 PowerShell 窗口执行。提示输入的账号和密码是**预览数据库容器**的 `POSTGRES_USER` 和 `POSTGRES_PASSWORD`。如果需要核对，可以在虚拟机终端运行 `docker exec -it cluster_monitor_preview_20261112 sh`，在容器内分别执行 `printenv POSTGRES_USER` 和 `printenv POSTGRES_PASSWORD`，然后输入 `exit` 退出。

```powershell
Set-Location -LiteralPath 'D:\files\工作区\polarion二次开发\集群监控系统'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '15488'
$env:DB_NAME = 'cluster_monitor_real'
$env:DB_USER = Read-Host '预览数据库用户名'
$secret = Read-Host '预览数据库密码' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
$env:COOKIE_SECURE = 'false'
pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

看到 Next.js 显示 `Ready` 后，打开[数据总览](http://127.0.0.1:3100/)或[分析总览](http://127.0.0.1:3100/analysis)。代码修改后开发服务会自动编译。结束预览时，在 Next.js 和 SSH 隧道窗口分别按 `Ctrl+C`，然后关闭这两个窗口。

## 上次自动启动的过程

上次在 Windows 启动虚拟机后，先启动了现有数据库容器，再用 Python 和 Paramiko 在后台建立 SSH 隧道。临时启动器从容器读取数据库账号与密码，通过进程环境变量传给 Windows 上的 Next.js。上面的手动步骤对应同一套连接配置，临时启动器位于项目的 `.next/preview-local/run.py`，清理构建缓存后可按手动步骤重新启动。

## 常见问题

- **浏览器连不上 3100**。查看 Next.js 窗口是否显示 `Ready`。如提示端口占用，先确认是否已有预览进程在运行。
- **网页有数据库连接错误**。依次检查虚拟机、容器的 `pg_isready` 输出、SSH 隧道窗口和 `DB_USER`、`DB_PASSWORD`。Windows 上可用 `Test-NetConnection 127.0.0.1 -Port 15488` 检查本地隧道端口。
- **Windows 已启动网页，虚拟机关机后页面报错**。重新启动虚拟机和数据库容器，再建立 SSH 隧道。首页、分析和工单都依赖数据库在线。
- **要预览多个历史批次**。预览只会显示这个开发数据库已有的批次。内网的历史批次保存在内网部署的数据库中。
