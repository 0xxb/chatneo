import { useTranslation } from 'react-i18next';
import { SettingGroup, SettingRow } from '../../components/Settings/SettingGroup';
import { NativeSelect, NativeSwitch } from '../../components/ui/native';
import { useSettings } from '../../hooks/useSettings';
import FontSelect from '../../components/ui/FontSelect';
import { open } from '@tauri-apps/plugin-dialog';
import { copyFileToAttachments, getAttachmentUrl, deleteAttachmentFile } from '../../lib/attachments';
import { PRESET_BACKGROUNDS } from '../../lib/apply-settings';
import { ImagePlus, X } from 'lucide-react';

const PRESETS = [
  { key: 'warm-sunset', label: 'presetWarmSunset' },
  { key: 'ocean-blue', label: 'presetOceanBlue' },
  { key: 'forest-green', label: 'presetForestGreen' },
  { key: 'lavender-mist', label: 'presetLavenderMist' },
  { key: 'aurora', label: 'presetAurora' },
  { key: 'night-sky', label: 'presetNightSky' },
  { key: 'rose-gold', label: 'presetRoseGold' },
  { key: 'minimal-gray', label: 'presetMinimalGray' },
] as const;

function SliderRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-[13px] text-(--color-label) block">{label}</span>
          {desc && <span className="text-[11px] text-(--color-label-secondary) block">{desc}</span>}
        </div>
        <span className="text-[13px] tabular-nums text-(--color-label-secondary) shrink-0 ml-4">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-accent) h-1.5"
      />
    </div>
  );
}

/** Check if a bg value is a custom file (not empty, not preset). */
function isCustomBg(v: string): boolean {
  return !!v && !v.startsWith('preset:');
}

function BgImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  /** Wrap onChange to clean up old custom file when switching away. */
  const handleChange = (newValue: string) => {
    if (isCustomBg(value) && value !== newValue) {
      deleteAttachmentFile(value).catch(() => {});
    }
    onChange(newValue);
  };

  const handleCustomUpload = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (!selected) return;
    const filePath = await copyFileToAttachments(selected);
    handleChange(filePath);
  };

  const isPreset = value.startsWith('preset:');
  const isCustom = value && !isPreset;
  const currentPreset = isPreset ? value.slice(7) : '';

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[13px] text-(--color-label) block">{t('settings.appearance.bgImage')}</span>
          <span className="text-[11px] text-(--color-label-secondary) block">{t('settings.appearance.bgImageDesc')}</span>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {/* None option */}
        <button
          onClick={() => handleChange('')}
          className={`aspect-[4/3] rounded-lg border-2 transition-colors flex items-center justify-center text-[11px] text-(--color-label-secondary) ${
            !value ? 'border-(--color-accent)' : 'border-(--color-separator) hover:border-(--color-label-tertiary)'
          }`}
        >
          {t('settings.appearance.bgNone')}
        </button>

        {/* Preset gradients */}
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleChange(`preset:${key}`)}
            title={t(`settings.appearance.${label}`)}
            className={`aspect-[4/3] rounded-lg border-2 transition-colors ${
              currentPreset === key ? 'border-(--color-accent)' : 'border-transparent hover:border-(--color-label-tertiary)'
            }`}
            style={{ background: PRESET_BACKGROUNDS[key] }}
          />
        ))}

        {/* Custom upload */}
        <button
          onClick={handleCustomUpload}
          className={`aspect-[4/3] rounded-lg border-2 transition-colors flex items-center justify-center relative overflow-hidden ${
            isCustom ? 'border-(--color-accent)' : 'border-(--color-separator) hover:border-(--color-label-tertiary)'
          }`}
        >
          {isCustom ? (
            <>
              <img src={getAttachmentUrl(value)} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center z-10"
                onClick={(e) => { e.stopPropagation(); handleChange(''); }}
              >
                <X className="w-2.5 h-2.5 text-white" />
              </div>
            </>
          ) : (
            <ImagePlus className="w-5 h-5 text-(--color-label-tertiary)" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function AppearanceSettings() {
  const { settings, loading, setSetting } = useSettings();
  const { t } = useTranslation();

  if (loading) return null;

  // Wrap the gate once since many controls write Pro-only keys; inlining in every
  // onChange would bury the list of gated keys across the JSX.
  const setProSetting = async (key: string, value: string, debounce?: number) => {
    await setSetting(key, value, debounce);
  };

  const hasBg = !!(settings.chat_bg_image);

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.appearance.theme')}>
        <SettingRow label={t('settings.appearance.theme')} desc={t('settings.appearance.themeDesc')}>
          <NativeSelect
            value={settings.theme ?? 'system'}
            onChange={(e) => setSetting('theme', e.target.value)}
          >
            <option value="system">{t('settings.appearance.followSystem')}</option>
            <option value="light">{t('settings.appearance.light')}</option>
            <option value="dark">{t('settings.appearance.dark')}</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.appearance.accentColor')} desc={t('settings.appearance.accentColorDesc')}>
          <NativeSelect
            value={settings.accent_color ?? 'default'}
            onChange={(e) => setSetting('accent_color', e.target.value)}
          >
            <option value="default">{t('common.default')}</option>
            <option value="orange">{t('settings.appearance.orange')}</option>
            <option value="yellow">{t('settings.appearance.yellow')}</option>
            <option value="green">{t('settings.appearance.green')}</option>
            <option value="blue">{t('settings.appearance.blue')}</option>
            <option value="pink">{t('settings.appearance.pink')}</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.chatBackground')}>
        <BgImagePicker
          value={settings.chat_bg_image ?? ''}
          onChange={(v) => setProSetting('chat_bg_image', v)}
        />
        {hasBg && (
          <>
            <div className="mx-3 border-t border-(--color-separator)" />
            <SliderRow
              label={t('settings.appearance.bgBlur')}
              desc={t('settings.appearance.bgBlurDesc')}
              value={parseInt(settings.chat_bg_blur ?? '0', 10)}
              min={0}
              max={20}
              unit="px"
              onChange={(v) => setProSetting('chat_bg_blur', String(v), 100)}
            />
            <div className="mx-3 border-t border-(--color-separator)" />
            <SliderRow
              label={t('settings.appearance.bgDimming')}
              desc={t('settings.appearance.bgDimmingDesc')}
              value={parseInt(settings.chat_bg_dimming ?? '30', 10)}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => setProSetting('chat_bg_dimming', String(v), 100)}
            />
          </>
        )}
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.messageBubble')}>
        <SettingRow label={t('settings.appearance.bubbleStyle')} desc={t('settings.appearance.bubbleStyleDesc')}>
          <NativeSelect
            value={settings.chat_bubble_style ?? 'flat'}
            onChange={(e) => setProSetting('chat_bubble_style', e.target.value)}
          >
            <option value="flat">{t('settings.appearance.bubbleFlat')}</option>
            <option value="bubble">{t('settings.appearance.bubbleBubble')}</option>
          </NativeSelect>
        </SettingRow>
        <SliderRow
          label={t('settings.appearance.bubbleOpacity')}
          desc={t('settings.appearance.bubbleOpacityDesc')}
          value={parseInt(settings.chat_bubble_opacity ?? '80', 10)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setProSetting('chat_bubble_opacity', String(v), 100)}
        />
        <div className="mx-3 border-t border-(--color-separator)" />
        <SliderRow
          label={t('settings.appearance.borderRadius')}
          desc={t('settings.appearance.borderRadiusDesc')}
          value={parseInt(settings.chat_border_radius ?? '16', 10)}
          min={0}
          max={24}
          unit="px"
          onChange={(v) => setProSetting('chat_border_radius', String(v), 100)}
        />
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.typography')}>
        <SettingRow label={t('settings.appearance.fontFamily')} desc={t('settings.appearance.fontFamilyDesc')}>
          <FontSelect
            value={settings.font_family ?? ''}
            onChange={(v) => setProSetting('font_family', v)}
          />
        </SettingRow>
        <SettingRow label={t('settings.appearance.codeFont')} desc={t('settings.appearance.codeFontDesc')}>
          <FontSelect
            value={settings.code_font ?? ''}
            onChange={(v) => setProSetting('code_font', v)}
          />
        </SettingRow>
        <SettingRow label={t('settings.editor.fontSize')} desc={t('settings.editor.fontSizeDesc')}>
          <NativeSelect
            value={settings.font_size ?? 'medium'}
            onChange={(e) => setSetting('font_size', e.target.value)}
          >
            <option value="small">{t('settings.editor.small')}</option>
            <option value="medium">{t('settings.editor.medium')}</option>
            <option value="large">{t('settings.editor.large')}</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.appearance.lineHeight')} desc={t('settings.appearance.lineHeightDesc')}>
          <NativeSelect
            value={settings.line_height ?? 'standard'}
            onChange={(e) => setSetting('line_height', e.target.value)}
          >
            <option value="compact">{t('settings.appearance.compact')}</option>
            <option value="standard">{t('settings.appearance.standard')}</option>
            <option value="relaxed">{t('settings.appearance.relaxed')}</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.display')}>
        <SettingRow label={t('settings.appearance.messageDensity')} desc={t('settings.appearance.messageDensityDesc')}>
          <NativeSelect
            value={settings.message_density ?? 'standard'}
            onChange={(e) => setSetting('message_density', e.target.value)}
          >
            <option value="compact">{t('settings.appearance.compact')}</option>
            <option value="standard">{t('settings.appearance.standard')}</option>
            <option value="spacious">{t('settings.appearance.spacious')}</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.appearance.codeTheme')} desc={t('settings.appearance.codeThemeDesc')}>
          <NativeSelect
            value={settings.code_theme ?? 'auto'}
            onChange={(e) => setSetting('code_theme', e.target.value)}
          >
            <option value="auto">{t('settings.appearance.followTheme')}</option>
            <option value="github">GitHub</option>
            <option value="one-dark">One Dark</option>
            <option value="monokai">Monokai</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.appearance.codeWordWrap')} desc={t('settings.appearance.codeWordWrapDesc')}>
          <NativeSwitch
            checked={(settings.code_word_wrap ?? '0') === '1'}
            onChange={(e) => setSetting('code_word_wrap', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
