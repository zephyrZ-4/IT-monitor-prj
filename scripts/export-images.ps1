param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\cluster-monitor-images.tar')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$appImage = "cluster-monitor:$appVersion"
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$relative = [System.IO.Path]::GetRelativePath($projectRoot, $outputFull)
if ($relative.StartsWith('..') -or [System.IO.Path]::IsPathRooted($relative)) {
  throw '输出 TAR 必须位于项目目录中。'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw '当前计算机未找到 Docker CLI。请在具有 Docker 和联网能力的 Linux/amd64 构建机运行。'
}

Push-Location $projectRoot
try {
  docker buildx build --platform linux/amd64 --load -t $appImage .
  if ($LASTEXITCODE -ne 0) { throw 'Web 镜像构建失败。' }
  docker pull --platform linux/amd64 postgres:17-alpine
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 镜像下载失败。' }
  docker tag postgres:17-alpine cluster-monitor/postgres:17-alpine
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 镜像标记失败。' }
  docker save -o $outputFull $appImage cluster-monitor/postgres:17-alpine
  if ($LASTEXITCODE -ne 0) { throw '镜像导出失败。' }
  Get-FileHash -Algorithm SHA256 -LiteralPath $outputFull | Select-Object Path,Hash
} finally {
  Pop-Location
}
