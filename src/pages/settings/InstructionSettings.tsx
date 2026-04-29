import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { ask } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import SubNavActions from '../../components/Settings/SubNavActions';
import { NativeSwitch } from '../../components/ui/native';
import { useContextMenu } from '../../hooks/useContextMenu';
import {
  listInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction,
} from '../../lib/instruction';
import type { Instruction } from '../../lib/instruction';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

export interface InstructionOutletContext {
  instruction: Instruction;
  updateField: (field: string, value: unknown) => Promise<void>;
}

export default function InstructionSettings() {
  const { t } = useTranslation();
  const { instructionId } = useParams<{ instructionId: string }>();
  const navigate = useNavigate();

  const [instructions, setInstructions] = useState<Instruction[]>([]);

  const loadData = useCallback(async () => {
    setInstructions(await listInstructions());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!instructionId && instructions.length > 0) {
      navigate(`/instruction/${instructions[0].id}`, { replace: true });
    }
  }, [instructionId, instructions, navigate]);

  const handleAdd = useCallback(async () => {
    const id = await createInstruction({ title: t('instruction.create') });
    await loadData();
    navigate(`/instruction/${id}`);
  }, [loadData, navigate, t]);

  const deleteById = useCallback(async (id: string) => {
    const target = instructions.find((i) => i.id === id);
    if (!target) return;
    const confirmed = await ask(t('instruction.confirmDelete'), {
      title: t('instruction.delete'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    await deleteInstruction(id);
    await loadData();
    const remaining = instructions.filter((i) => i.id !== id);
    navigate(
      remaining.length > 0 ? `/instruction/${remaining[0].id}` : '/instruction',
      { replace: true },
    );
  }, [instructions, t, loadData, navigate]);

  const handleDelete = useCallback(async () => {
    if (instructionId) deleteById(instructionId);
  }, [instructionId, deleteById]);

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!instructionId) return;
    await updateInstruction(instructionId, { [field]: value });
    await loadData();
  }, [instructionId, loadData]);

  const showMenu = useContextMenu<string>(
    [{ type: 'item', id: 'delete', text: t('common.delete') }],
    (_action, id) => deleteById(id),
  );

  const items: SubMenuItem[] = instructions.map((i) => ({
    id: i.id,
    path: `/instruction/${i.id}`,
    label: i.title,
    onContextMenu: (e: React.MouseEvent) => showMenu(e, i.id),
  }));

  const current = instructions.find((i) => i.id === instructionId);
  const enabled = current?.enabled === 1;

  return (
    <SubLayout
      items={items}
      title={current?.title ?? t('instruction.title')}
      emptyText={t('instruction.empty')}
      titleExtra={instructionId && current ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-(--color-label-tertiary)">
            {enabled ? t('instruction.enabled') : t('instruction.disabled')}
          </span>
          <NativeSwitch
            checked={enabled}
            onChange={(e) => updateField('enabled', e.target.checked ? 1 : 0)}
          />
        </div>
      ) : undefined}
      footer={
        <SubNavActions
          onAdd={handleAdd}
          onDelete={handleDelete}
          deleteDisabled={!instructionId}
        />
      }
    >
      {current ? (
        <Outlet context={{ instruction: current, updateField } satisfies InstructionOutletContext} />
      ) : (
        <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
          {t('instruction.emptyHint')}
        </div>
      )}
    </SubLayout>
  );
}
