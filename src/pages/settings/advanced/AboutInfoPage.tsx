import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Globe, Github, BookOpen, ExternalLink } from 'lucide-react';
import Spinner from '../../../components/ui/Spinner';
import { SettingGroup, SettingRow } from '../../../components/Settings/SettingGroup';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../../../hooks/useTauriEvent';

const EMAIL = 'nicexiaobing@gmail.com';
const WEBSITE = 'https://chatneo.app';
const WEBSITE_LABEL = 'chatneo.app';
const GITHUB = 'https://github.com/0xxb/chatneo';
const GITHUB_LABEL = '0xxb/chatneo';
const DOCS = 'https://chatneo.app';
const DOCS_LABEL = 'chatneo.app';

const linkBtnClass = 'inline-flex items-center gap-1.5 text-[13px] text-(--color-accent) hover:underline cursor-pointer';

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button onClick={() => openUrl(url)} className={linkBtnClass}>
      {label}
      <ExternalLink className="w-2.5 h-2.5 -mt-1.5 -ml-0.5 opacity-50" />
    </button>
  );
}

interface UpdateProgress {
  chunk: number;
  total: number | null;
  downloaded: number;
  phase: 'downloading' | 'finished' | 'failed';
}

export default function AboutInfoPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState('...');
  // 检查 → 确认在 Rust 侧用原生 dialog 完成；前端只需维护“正在进行中”状态与可选下载进度
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  useTauriEvent<UpdateProgress>('update-progress', ({ payload }) => {
    if (payload.phase === 'downloading') {
      setProgress({ downloaded: payload.downloaded, total: payload.total });
    } else {
      // finished / failed — 清理进度；finished 后 Rust 会直接 restart
      setProgress(null);
    }
  });

  const handleCheckUpdate = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await invoke('check_for_updates');
    } catch {
      // Rust 侧已经通过原生 dialog 反馈错误，这里不再重复提示
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const progressPct = progress && progress.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : null;

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-5">
      {/* Hero */}
      <section className="flex flex-col items-center pt-8 pb-4">
        <div className="relative mb-4">
          <img src="/logo.svg" alt="ChatNeo" className="w-20 h-20 rounded-[22px]" />
        </div>
        <h2 className="text-[17px] font-semibold text-(--color-label) tracking-tight">ChatNeo</h2>
        <p className="text-[12px] text-(--color-label-tertiary) mt-0.5">{t('settings.about.subtitle')}</p>
        <div className="mt-3 px-3 py-1 rounded-full bg-(--color-fill) text-[11px] text-(--color-label-secondary) font-medium">
          v{version}
        </div>
      </section>

      {/* Contact */}
      <SettingGroup title={t('settings.about.contactUs')}>
        <SettingRow label={t('settings.about.email')} icon={<Mail className="w-3.5 h-3.5" />}>
          <LinkButton label={EMAIL} url={`mailto:${EMAIL}`} />
        </SettingRow>
        <SettingRow label={t('settings.about.website')} icon={<Globe className="w-3.5 h-3.5" />}>
          <LinkButton label={WEBSITE_LABEL} url={WEBSITE} />
        </SettingRow>
        <SettingRow label={t('settings.about.docs')} icon={<BookOpen className="w-3.5 h-3.5" />}>
          <LinkButton label={DOCS_LABEL} url={DOCS} />
        </SettingRow>
        <SettingRow label={t('settings.about.github')} icon={<Github className="w-3.5 h-3.5" />}>
          <LinkButton label={GITHUB_LABEL} url={GITHUB} />
        </SettingRow>
      </SettingGroup>

      {/* Update */}
      <SettingGroup title={t('settings.about.update')}>
        <SettingRow label={t('settings.about.checkUpdate')}>
          <button
            onClick={handleCheckUpdate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-medium bg-(--color-fill-secondary) text-(--color-label) hover:bg-(--color-fill) disabled:opacity-50 transition-colors"
          >
            {busy && <Spinner className="w-3 h-3" />}
            {busy ? t('settings.about.checking') : t('settings.about.checkUpdate')}
          </button>
        </SettingRow>
        {progressPct !== null && (
          <SettingRow label={t('settings.about.downloading')}>
            <div className="flex items-center gap-2 w-40">
              <div className="flex-1 h-1.5 rounded-full bg-(--color-fill) overflow-hidden">
                <div
                  className="h-full rounded-full bg-(--color-accent) transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[11px] text-(--color-label-tertiary) tabular-nums">{progressPct}%</span>
            </div>
          </SettingRow>
        )}

      </SettingGroup>
    </div>
  );
}
