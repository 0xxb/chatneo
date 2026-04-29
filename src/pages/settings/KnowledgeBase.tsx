import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { ask } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import SubNavActions from '../../components/Settings/SubNavActions';
import { useContextMenu } from '../../hooks/useContextMenu';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
} from '../../lib/knowledge-base';
import type { KnowledgeBase } from '../../lib/knowledge-base';
import { listProviders } from '../../lib/dao/provider-dao';
import { supportsEmbedding } from '../../lib/embedding';
import { getBuiltinProviders } from '../../components/ProviderForms';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

interface Provider {
  id: number;
  name: string;
  type: string;
}

export interface KBOutletContext {
  kb: KnowledgeBase;
  providers: Provider[];
  updateField: (field: string, value: unknown) => Promise<void>;
  reload: () => Promise<void>;
}

export default function KnowledgeBaseSettings() {
  const { t } = useTranslation();
  const { kbId } = useParams<{ kbId: string }>();
  const navigate = useNavigate();

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const loadData = useCallback(async () => {
    const [kbs, provRows] = await Promise.all([
      listKnowledgeBases(),
      listProviders(),
    ]);
    const customProvs: Provider[] = provRows.map((p) => ({ id: p.id, name: p.name, type: p.type }));
    // Include builtin providers + filter all by embedding capability
    const builtinProvs: Provider[] = getBuiltinProviders().map((bp) => ({
      id: bp.id,
      name: bp.name,
      type: bp.type,
    }));
    const allProvs = [...builtinProvs, ...customProvs].filter((p) => supportsEmbedding(p.type));
    setKnowledgeBases(kbs);
    setProviders(allProvs);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!kbId && knowledgeBases.length > 0) {
      navigate(`/knowledge/${knowledgeBases[0].id}`, { replace: true });
    }
  }, [kbId, knowledgeBases, navigate]);

  const handleAdd = useCallback(async () => {
    const id = await createKnowledgeBase({
      name: t('knowledgeBase.create'),
      description: '',
      embedding_provider_id: null,
      embedding_model: '',
      dimensions: 1536,
      chunk_size: 500,
      chunk_overlap: 50,
    });
    await loadData();
    navigate(`/knowledge/${id}`);
  }, [loadData, navigate, t]);

  const deleteById = useCallback(async (id: string) => {
    const target = knowledgeBases.find((kb) => kb.id === id);
    if (!target) return;
    const confirmed = await ask(t('knowledgeBase.confirmDelete'), {
      title: t('knowledgeBase.delete'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    await deleteKnowledgeBase(id);
    await loadData();
    const remaining = knowledgeBases.filter((kb) => kb.id !== id);
    navigate(
      remaining.length > 0 ? `/knowledge/${remaining[0].id}` : '/knowledge',
      { replace: true },
    );
  }, [knowledgeBases, t, loadData, navigate]);

  const handleDelete = useCallback(async () => {
    if (kbId) deleteById(kbId);
  }, [kbId, deleteById]);

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!kbId) return;
    await updateKnowledgeBase(kbId, { [field]: value });
    await loadData();
  }, [kbId, loadData]);

  const showKbMenu = useContextMenu<string>(
    [{ type: 'item', id: 'delete', text: t('common.delete') }],
    (_action, id) => deleteById(id),
  );

  const items: SubMenuItem[] = knowledgeBases.map((kb) => ({
    id: kb.id,
    path: `/knowledge/${kb.id}`,
    label: kb.name,
    onContextMenu: (e: React.MouseEvent) => showKbMenu(e, kb.id),
  }));

  const current = knowledgeBases.find((kb) => kb.id === kbId);

  return (
    <SubLayout
      items={items}
      title={current?.name ?? t('knowledgeBase.title')}
      emptyText={t('knowledgeBase.empty')}
      footer={
        <SubNavActions
          onAdd={handleAdd}
          onDelete={handleDelete}
          deleteDisabled={!kbId}
        />
      }
    >
      {current ? (
        <Outlet context={{ kb: current, providers, updateField, reload: loadData } satisfies KBOutletContext} />
      ) : (
        <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
          {t('knowledgeBase.emptyHint')}
        </div>
      )}
    </SubLayout>
  );
}
