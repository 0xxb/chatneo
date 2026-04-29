#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 收集构建产物、生成 latest.json、发布到 GitHub Releases
#
# 用法:
#   ./scripts/release-publish.sh <tag> <artifacts-dir>
#
# 被 release.sh（本地）和 GitHub Actions 共同调用。
# ============================================================

TAG="${1:?用法: release-publish.sh <tag> <artifacts-dir>}"
ARTIFACTS_DIR="${2:?用法: release-publish.sh <tag> <artifacts-dir>}"
RELEASES_REPO="${RELEASES_REPO:-0xxb/chatneo}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- 整理产物到扁平目录 ---
PUBLISH_DIR=$(mktemp -d)
trap 'rm -rf "$PUBLISH_DIR"' EXIT

find "$ARTIFACTS_DIR" -type f -print0 | while IFS= read -rd '' f; do
  name=$(basename "$f")

  arch=""
  if [[ "$f" == *aarch64* ]]; then
    arch="aarch64"
  elif [[ "$f" == *x86_64* ]]; then
    arch="x86_64"
  fi

  # ChatNeo.app.tar.gz → ChatNeo_aarch64.app.tar.gz
  if [[ -n "$arch" && "$name" != *"$arch"* && "$name" != *x64* ]]; then
    base="${name%%.*}"
    ext="${name#*.}"
    name="${base}_${arch}.${ext}"
  fi

  cp "$f" "$PUBLISH_DIR/$name"
done

echo "==> 待发布的产物:"
ls -lh "$PUBLISH_DIR"

# --- 生成 latest.json + 提取 release notes ---
node -e "
const fs = require('fs');
const path = require('path');

const tag = process.argv[1];
const publishDir = process.argv[2];
const releasesRepo = process.argv[3];
const changelogPath = process.argv[4];

// Release notes
let notes = '';
try {
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const header = '### ' + tag;
  const start = changelog.indexOf(header);
  if (start !== -1) {
    const contentStart = start + header.length;
    const nextVersion = changelog.indexOf('\n### ', contentStart);
    notes = (nextVersion !== -1
      ? changelog.slice(contentStart, nextVersion)
      : changelog.slice(contentStart)
    ).trim();
  }
} catch {}

// Platform definitions: [platformKey, archKeyword, bundleSuffix]
const platformDefs = [
  ['darwin-aarch64', 'aarch64', '.app.tar.gz'],
  ['darwin-x86_64',  'x86_64',  '.app.tar.gz'],
  ['windows-x86_64', '',         '.nsis.zip'],
];

const urlBase = 'https://github.com/' + releasesRepo + '/releases/download/' + tag;
const platforms = {};
const files = fs.readdirSync(publishDir);

for (const [key, archKeyword, suffix] of platformDefs) {
  const bundle = files.find(f =>
    f.endsWith(suffix) && !f.endsWith(suffix + '.sig') &&
    (!archKeyword || f.includes(archKeyword))
  );
  const sigFile = bundle ? files.find(f => f === bundle + '.sig') : null;

  if (bundle && sigFile) {
    const sig = fs.readFileSync(path.join(publishDir, sigFile), 'utf8').trim();
    platforms[key] = { signature: sig, url: urlBase + '/' + bundle };
  }
}

const latest = {
  version: tag,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(path.join(publishDir, 'latest.json'), JSON.stringify(latest, null, 2));
console.log(JSON.stringify(latest, null, 2));

// Export notes for shell
fs.writeFileSync(path.join(publishDir, '.release_notes'), notes);
" "$TAG" "$PUBLISH_DIR" "$RELEASES_REPO" "$PROJECT_DIR/public/CHANGELOG.md"

echo ""
echo "==> latest.json 已生成"

# --- 发布 ---
RELEASE_NOTES=""
[[ -f "$PUBLISH_DIR/.release_notes" ]] && RELEASE_NOTES=$(cat "$PUBLISH_DIR/.release_notes")
rm -f "$PUBLISH_DIR/.release_notes"

echo ""
echo "==> 发布到 $RELEASES_REPO ..."

if gh release view "$TAG" --repo "$RELEASES_REPO" &>/dev/null; then
  echo "  Release $TAG 已存在，追加上传..."
  gh release upload "$TAG" "$PUBLISH_DIR"/* --repo "$RELEASES_REPO" --clobber
else
  NOTES_ARG=()
  if [[ -n "$RELEASE_NOTES" ]]; then
    NOTES_ARG=(--notes "$RELEASE_NOTES")
  else
    NOTES_ARG=(--notes "Release $TAG")
  fi
  gh release create "$TAG" \
    --repo "$RELEASES_REPO" \
    --title "ChatNeo $TAG" \
    "${NOTES_ARG[@]}" \
    "$PUBLISH_DIR"/*
fi

echo ""
echo "==> 完成! https://github.com/$RELEASES_REPO/releases/tag/$TAG"
