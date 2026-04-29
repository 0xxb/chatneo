#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 本地构建安装包并发布（GitHub Actions 额度不足时的兜底方案）
#
# 用法:
#   ./scripts/release.sh              # 使用 package.json 中的版本
#   ./scripts/release.sh v0.2.0       # 指定版本（自动 bump 所有版本号）
#
# 只构建 macOS（本机），发布逻辑复用 release-publish.sh。
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 加载 .env
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# --- 版本号 ---
if [[ -n "${1:-}" ]]; then
  TAG="$1"
  VERSION="${TAG#v}"
  "$PROJECT_DIR/scripts/bump.sh" "$VERSION"
else
  VERSION=$(node -p "require('./package.json').version")
  TAG="v${VERSION}"
fi
echo "==> 发布版本: $TAG"

# --- 构建 macOS ---
TMPDIR_BUILD=$(mktemp -d)
cleanup() { rm -rf "$TMPDIR_BUILD"; }
trap cleanup EXIT

TARGETS=(aarch64-apple-darwin x86_64-apple-darwin)
for target in "${TARGETS[@]}"; do
  echo ""
  echo "==> 构建 $target ..."
  CMAKE_POLICY_VERSION_MINIMUM=3.5 SHERPA_BUILD_SHARED_LIBS=0 MACOSX_DEPLOYMENT_TARGET=10.15 pnpm tauri build --target "$target"

  # 卸载构建过程中自动挂载的 DMG
  hdiutil detach /Volumes/ChatNeo* 2>/dev/null || true
done

# 收集产物到临时目录（保留架构路径信息，供 release-publish.sh 识别）
DIST_DIR="$PROJECT_DIR/src-tauri/target"
for target in "${TARGETS[@]}"; do
  mkdir -p "$TMPDIR_BUILD/$target"
  bundle_dir="$DIST_DIR/$target/release/bundle"

  for f in "$bundle_dir"/macos/*.app.tar.gz "$bundle_dir"/macos/*.app.tar.gz.sig "$bundle_dir"/dmg/*.dmg; do
    [[ -f "$f" ]] && cp "$f" "$TMPDIR_BUILD/$target/"
  done
done

# --- 调用统一的发布脚本 ---
"$PROJECT_DIR/scripts/release-publish.sh" "$TAG" "$TMPDIR_BUILD"
