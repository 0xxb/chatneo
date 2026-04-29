import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "katex/dist/katex.min.css";
import "./index.css"
import "./locales";
import "./plugins";
import "./tools";
import { setupDownloadInterceptor } from "./utils/download";
import { setupProductionGuard } from "./utils/security";
import { initSettings } from "./lib/apply-settings";
import { initModelCatalog } from "./lib/model-catalog";
import { mcpManager } from "./lib/mcp-manager";
import { logger } from "./lib/logger";
import { useBootStore } from "./store/boot";
import { toast } from "sonner";

// 禁用浏览器 Tab 焦点导航（原生应用不需要），但保留 textarea 中的 Tab 功能
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
  }
});

setupDownloadInterceptor();
setupProductionGuard();

logger.info('app', '前端初始化开始');

// 启动步骤集中编排：单个失败不阻塞其它步骤，但仍记录在 boot store 里供 UI 反馈。
// 关键步骤（initSettings）失败会让全局状态置为 error，让 UI 给用户明确反馈。
async function bootstrap() {
  const boot = useBootStore.getState();
  const steps: Array<{ name: string; critical: boolean; run: () => Promise<unknown> }> = [
    { name: 'settings', critical: true, run: () => initSettings() },
    { name: 'modelCatalog', critical: false, run: () => initModelCatalog() },
    { name: 'mcp', critical: false, run: () => mcpManager.connectAll() },
  ];

  const results = await Promise.allSettled(steps.map((s) => s.run()));

  let criticalFailed = false;
  results.forEach((r, i) => {
    const step = steps[i];
    if (r.status === 'fulfilled') {
      logger.info('app', `启动步骤完成: ${step.name}`);
      return;
    }
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    logger.error('app', `启动步骤失败: ${step.name} - ${msg}`);
    boot.setError(step.name, msg);
    if (step.critical) criticalFailed = true;
    else toast.error(`${step.name}: ${msg}`);
  });

  boot.setStatus(criticalFailed ? 'error' : 'ready');
}

bootstrap();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
