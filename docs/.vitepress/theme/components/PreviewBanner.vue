<template>
  <div class="preview-banner" role="note" aria-label="预览阶段提示">
    当前程序仍处于预览阶段，功能和界面可能继续调整，使用过程中可能会遇到 bug。
  </div>
</template>

<style scoped>
.preview-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--vp-z-index-layout-top);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--preview-banner-height);
  padding: 10px 20px;
  background: linear-gradient(90deg, #fff4cc 0%, #ffe2bf 100%);
  border-bottom: 1px solid rgba(148, 96, 16, 0.18);
  color: #7c4a03;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
}

.dark .preview-banner {
  background: linear-gradient(90deg, #5b4610 0%, #6b3310 100%);
  border-bottom-color: rgba(255, 213, 128, 0.2);
  color: #ffd98a;
}
</style>
