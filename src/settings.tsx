import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import './locales';
import './plugins';
import './tools';
import Settings from './pages/Settings';
import GeneralSettings from './pages/settings/GeneralSettings';
import ModelSettings from './pages/settings/ModelSettings';
import ProviderSettings from './pages/settings/ProviderSettings';
import PluginSettings from './pages/settings/PluginSettings';
import PluginConfigPage from './pages/settings/PluginConfigPage';
import ToolSettings from './pages/settings/ToolSettings';
import ToolConfigPage from './pages/settings/ToolConfigPage';
import McpSettings from './pages/settings/McpSettings';
import McpServerConfig from './pages/settings/McpServerConfig';
import KnowledgeBaseSettings from './pages/settings/KnowledgeBase';
import KnowledgeBaseDetail from './pages/settings/KnowledgeBaseDetail';
import PromptSettings from './pages/settings/PromptSettings';
import PromptDetail from './pages/settings/PromptDetail';
import InstructionSettings from './pages/settings/InstructionSettings';
import InstructionDetail from './pages/settings/InstructionDetail';
import ModelParamsSettings from './pages/settings/ModelParamsSettings';
import VoiceSettings from './pages/settings/VoiceSettings';
import ShortcutSettings from './pages/settings/ShortcutSettings';
import AppearanceSettings from './pages/settings/AppearanceSettings';
import AdvancedSettings from './pages/settings/AdvancedSettings';
import AboutInfoPage from './pages/settings/advanced/AboutInfoPage';
import ChangelogPage from './pages/settings/advanced/ChangelogPage';
import LogSettings from './pages/settings/advanced/LogSettings';
import DataSettings from './pages/settings/advanced/DataSettings';
import { initSettings } from './lib/apply-settings';
import { setupProductionGuard } from './utils/security';

setupProductionGuard();
initSettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Settings />}>
          <Route index element={<Navigate to="/general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="provider" element={<ModelSettings />}>
            <Route path=":providerId" element={<ProviderSettings />} />
          </Route>
          <Route path="prompt" element={<PromptSettings />}>
            <Route path=":promptId" element={<PromptDetail />} />
          </Route>
          <Route path="instruction" element={<InstructionSettings />}>
            <Route path=":instructionId" element={<InstructionDetail />} />
          </Route>
          <Route path="plugin" element={<PluginSettings />}>
            <Route path=":pluginId" element={<PluginConfigPage />} />
          </Route>
          <Route path="tool" element={<ToolSettings />}>
            <Route path=":toolId" element={<ToolConfigPage />} />
          </Route>
          <Route path="voice" element={<VoiceSettings />} />
          <Route path="knowledge" element={<KnowledgeBaseSettings />}>
            <Route path=":kbId" element={<KnowledgeBaseDetail />} />
          </Route>
          <Route path="mcp" element={<McpSettings />}>
            <Route path=":serverId" element={<McpServerConfig />} />
          </Route>
          <Route path="shortcut" element={<ShortcutSettings />} />
          <Route path="advanced" element={<AdvancedSettings />}>
            <Route path="params" element={<ModelParamsSettings />} />
            <Route path="data" element={<DataSettings />} />
            <Route path="log" element={<LogSettings />} />
            <Route path="info" element={<AboutInfoPage />} />
            <Route path="changelog" element={<ChangelogPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>
);
