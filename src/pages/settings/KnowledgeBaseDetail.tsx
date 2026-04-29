import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FormField } from '../../components/Settings/FormField';
import { NativeInput } from '../../components/ui/NativeInput';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { listDocuments } from '../../lib/knowledge-base';
import { clampChunkParams, MIN_CHUNK_SIZE } from '../../lib/chunking';
import DocumentList from '../../components/KnowledgeBase/DocumentList';
import type { KnowledgeDocument } from '../../lib/knowledge-base';
import type { KBOutletContext } from './KnowledgeBase';

export default function KnowledgeBaseDetail() {
  const { t } = useTranslation();
  const { kbId } = useParams<{ kbId: string }>();
  const { kb, providers, updateField } = useOutletContext<KBOutletContext>();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Local editing state (save on blur)
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState<string | null>(null);
  const [chunkSize, setChunkSize] = useState<number | null>(null);
  const [chunkOverlap, setChunkOverlap] = useState<number | null>(null);

  const loadDocs = useCallback(async () => {
    if (!kbId) return;
    setDocuments(await listDocuments(kbId));
  }, [kbId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const nameValue = name ?? kb.name;
  const descValue = description ?? kb.description;
  const modelValue = embeddingModel ?? kb.embedding_model;

  return (
    <div className="p-4 space-y-4" key={kb.id}>
      <FormField label={t('knowledgeBase.name')}>
        <NativeInput
          value={nameValue}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== null && name.trim()) {
              updateField('name', name.trim());
              setName(null);
            } else {
              setName(null);
            }
          }}
        />
      </FormField>

      <FormField label={t('knowledgeBase.description')}>
        <NativeInput
          value={descValue}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== null) {
              updateField('description', description.trim());
              setDescription(null);
            }
          }}
        />
      </FormField>

      <FormField label={t('knowledgeBase.embeddingProvider')}>
        <NativeSelect
          value={kb.embedding_provider_id != null ? String(kb.embedding_provider_id) : ''}
          onChange={(e) => {
            const val = e.target.value;
            updateField('embedding_provider_id', val === '' ? null : Number(val));
          }}
        >
          <option value="">{t('knowledgeBase.ollama')}</option>
          {providers.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField label={t('knowledgeBase.embeddingModel')}>
        <NativeInput
          value={modelValue}
          onChange={(e) => setEmbeddingModel(e.target.value)}
          onBlur={() => {
            if (embeddingModel !== null) {
              updateField('embedding_model', embeddingModel.trim());
              setEmbeddingModel(null);
            }
          }}
        />
      </FormField>

      {/* Advanced settings */}
      <div>
        <button
          className="flex items-center gap-1 text-[13px] text-(--color-label-secondary) hover:text-(--color-label) transition-colors"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {t('knowledgeBase.advancedSettings')}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4 pl-4 border-l-2 border-(--color-separator)">
            <FormField label={t('knowledgeBase.dimensions')} desc={t('knowledgeBase.dimensionsHint')}>
              <NativeInput
                type="number"
                value={kb.dimensions}
                disabled
              />
            </FormField>
            <FormField label={t('knowledgeBase.chunkSize')}>
              <NativeInput
                type="number"
                // onBlur 才落库 + clamp，避免用户打字中间态（如清空成 0 或输入大于 chunk_size 的 overlap）立刻写库导致后续处理硬失败。
                value={chunkSize ?? kb.chunk_size}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                onBlur={() => {
                  if (chunkSize === null) return;
                  const { chunkSize: size, chunkOverlap: overlap } = clampChunkParams(
                    chunkSize,
                    chunkOverlap ?? kb.chunk_overlap,
                  );
                  updateField('chunk_size', size);
                  if (overlap !== kb.chunk_overlap) updateField('chunk_overlap', overlap);
                  setChunkSize(null);
                  setChunkOverlap(null);
                }}
                min={MIN_CHUNK_SIZE}
              />
            </FormField>
            <FormField label={t('knowledgeBase.chunkOverlap')}>
              <NativeInput
                type="number"
                value={chunkOverlap ?? kb.chunk_overlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
                onBlur={() => {
                  if (chunkOverlap === null) return;
                  const { chunkSize: size, chunkOverlap: overlap } = clampChunkParams(
                    chunkSize ?? kb.chunk_size,
                    chunkOverlap,
                  );
                  if (size !== kb.chunk_size) updateField('chunk_size', size);
                  updateField('chunk_overlap', overlap);
                  setChunkSize(null);
                  setChunkOverlap(null);
                }}
                min={0}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-(--color-separator)" />

      {/* Document list */}
      <DocumentList knowledgeBaseId={kbId!} documents={documents} onReload={loadDocs} />
    </div>
  );
}
