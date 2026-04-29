import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ask, message } from '@tauri-apps/plugin-dialog';
import SubLayout from '../../components/Settings/SubLayout';
import SubNavActions from '../../components/Settings/SubNavActions';
import ProviderIcon from '../../components/ProviderIcon';
import { isImplemented, getDefaultConfig, getBuiltinProviders, getAddableTypes } from '../../components/ProviderForms';
import { useProviders } from '../../hooks/useProviders';
import { useProviderMenu } from '../../hooks/useProviderMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import type { SubMenuItem } from '../../components/Settings/SubLayout';
import type { ProviderRow } from '../../hooks/useProviders';

const BUILTIN_PREFIX = 'builtin_';
const builtinProviders = getBuiltinProviders();
const defaultPath = `/provider/${BUILTIN_PREFIX}${builtinProviders[0].type}`;

export default function ModelSettings() {
  const { t } = useTranslation();
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const { providers, loading, addProvider, deleteProvider, updateProvider } = useProviders();

  const isBuiltin = providerId?.startsWith(BUILTIN_PREFIX) ?? false;
  const numericId = !isBuiltin && providerId ? Number(providerId) : undefined;

  const builtinItems: SubMenuItem[] = builtinProviders.map((bp) => ({
    id: `${BUILTIN_PREFIX}${bp.type}`,
    path: `/provider/${BUILTIN_PREFIX}${bp.type}`,
    label: bp.name,
    icon: <ProviderIcon icon={bp.icon} />,
  }));

  const deleteById = useCallback(async (id: number) => {
    const target = providers.find((p) => p.id === id);
    if (!target) return;
    const confirmed = await ask(t('settings.provider.deleteConfirm', { name: target.name }), {
      title: t('settings.provider.deleteTitle'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    const remaining = await deleteProvider(id);
    navigate(
      remaining.length > 0 ? `/provider/${remaining[0].id}` : defaultPath,
      { replace: true },
    );
  }, [providers, deleteProvider, navigate]);

  const showItemMenu = useContextMenu<number>(
    [{ type: 'item', id: 'delete', text: t('common.delete') }],
    (_action, id) => deleteById(id),
  );

  const dbItems: SubMenuItem[] = providers.map((p) => ({
    id: String(p.id),
    path: `/provider/${p.id}`,
    label: p.name,
    icon: <ProviderIcon icon={p.icon} />,
    onContextMenu: (e: React.MouseEvent) => showItemMenu(e, p.id),
  }));

  useEffect(() => {
    if (!loading && !providerId) navigate(defaultPath, { replace: true });
  }, [providerId, loading, navigate]);

  const handleAdd = useCallback(async (typeId: string) => {
    if (!isImplemented(typeId)) {
      await message(t('settings.provider.notImplemented'), { title: t('settings.provider.notImplementedTitle'), kind: 'info' });
      return;
    }
    const addable = getAddableTypes().find((a) => a.type === typeId);
    if (!addable) return;
    const newId = await addProvider(typeId, addable.icon, addable.name, getDefaultConfig(typeId));
    navigate(`/provider/${newId}`);
  }, [navigate, addProvider, providers.length]);

  const showMenu = useProviderMenu(handleAdd);

  const handleDelete = useCallback(async () => {
    if (numericId !== undefined) deleteById(numericId);
  }, [numericId, deleteById]);

  let title = t('settings.provider.selectProvider');
  if (isBuiltin && providerId) {
    const bp = builtinProviders.find((b) => `${BUILTIN_PREFIX}${b.type}` === providerId);
    title = bp?.name ?? title;
  } else if (numericId !== undefined) {
    title = providers.find((p) => p.id === numericId)?.name ?? title;
  }

  return (
    <SubLayout
      items={[...builtinItems, ...dbItems]}
      title={title}
      footer={<SubNavActions onAdd={showMenu} onDelete={handleDelete} deleteDisabled={isBuiltin} />}
    >
      <Outlet context={{ providers, updateProvider } satisfies OutletContextType} />
    </SubLayout>
  );
}

export interface OutletContextType {
  providers: ProviderRow[];
  updateProvider: (id: number, field: 'name' | 'icon' | 'config' | 'sort_order', value: string | number | null) => Promise<void>;
}
