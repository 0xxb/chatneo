import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderIcon, { availableIcons } from '../ProviderIcon';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/Popover';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search
    ? availableIcons.filter((name) => name.toLowerCase().includes(search.toLowerCase()))
    : availableIcons;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-(--color-separator) hover:bg-(--color-fill-secondary) transition-colors"
        >
          <ProviderIcon icon={value} size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <input
          type="text"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-2 px-2 py-1 rounded-md text-[12px] bg-(--color-fill-secondary) text-(--color-label) placeholder:text-(--color-label-tertiary) outline-none border border-transparent focus:border-(--color-accent)"
        />
        <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => { onChange(name); setOpen(false); setSearch(''); }}
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                value === name
                  ? 'bg-(--color-accent) text-white'
                  : 'hover:bg-(--color-fill-secondary) text-(--color-label-secondary)'
              }`}
            >
              <ProviderIcon icon={name} size={18} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
