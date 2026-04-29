#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 一键更新所有版本号
#
# 用法:
#   ./scripts/bump.sh 0.2.0
# ============================================================

if [[ -z "${1:-}" ]]; then
  echo "用法: ./scripts/bump.sh <版本号>"
  echo "示例: ./scripts/bump.sh 0.2.0"
  exit 1
fi

VERSION="$1"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 更新版本号到 $VERSION"

node -e "
const fs = require('fs');
const version = process.argv[1];
const dir = process.argv[2];

// package.json + tauri.conf.json
for (const rel of ['package.json', 'src-tauri/tauri.conf.json']) {
  const file = dir + '/' + rel;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.version = version;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  console.log('  ✓ ' + rel);
}

// Cargo.toml
const cargoPath = dir + '/src-tauri/Cargo.toml';
const cargo = fs.readFileSync(cargoPath, 'utf8')
  .replace(/^version = \".*\"/m, 'version = \"' + version + '\"');
fs.writeFileSync(cargoPath, cargo);
console.log('  ✓ src-tauri/Cargo.toml');
" "$VERSION" "$PROJECT_DIR"

echo ""
echo "==> 完成! 所有版本号已更新为 $VERSION"
