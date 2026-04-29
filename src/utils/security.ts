/** 生产环境下禁用默认右键菜单和 DevTools 快捷键 */
export function setupProductionGuard() {
  if (import.meta.env.DEV) return;

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") ||
      ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "j") ||
      ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u")
    ) {
      e.preventDefault();
    }
  });
}
