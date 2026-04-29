const icons = import.meta.glob<string>('../assets/providers/*.svg', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const iconMap: Record<string, string> = {};
for (const [path, raw] of Object.entries(icons)) {
  const name = path.split('/').pop()!.replace('.svg', '');
  iconMap[name] = raw;
}

const fallback = iconMap['default'] ?? '';

/** Strip <script> tags and on* event attributes from SVG strings. */
function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
}

export const availableIcons = ['default', ...Object.keys(iconMap).filter((n) => n !== 'default').sort()];

interface ProviderIconProps {
  icon: string;
  size?: number;
  className?: string;
}

export default function ProviderIcon({ icon, size = 14, className }: ProviderIconProps) {
  const svg = iconMap[icon] ?? fallback;
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg).replace(/<svg/, `<svg width="${size}" height="${size}"`) }}
    />
  );
}
