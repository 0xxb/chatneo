import { useState } from 'react';
import { open, ask } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Globe,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import Spinner from '../ui/Spinner';
import {
  addDocument,
  addUrlDocument,
  processDocument,
  deleteDocument,
} from '../../lib/knowledge-base';
import type { KnowledgeDocument } from '../../lib/knowledge-base';
import { useContextMenu } from '../../hooks/useContextMenu';
import type { MenuDef } from '../../hooks/useContextMenu';
import ChunkPreview from './ChunkPreview';

interface Props {
  knowledgeBaseId: string;
  documents: KnowledgeDocument[];
  onReload: () => void;
}

function extToType(ext: string): KnowledgeDocument['type'] {
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'md') return 'md';
  return 'txt';
}

export default function DocumentList({ knowledgeBaseId, documents, onReload }: Props) {
  const { t } = useTranslation();
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [urlRowOpen, setUrlRowOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const markProcessing = (id: string, on: boolean) =>
    setProcessing((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAddFiles = async () => {
    const result = await open({
      multiple: true,
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] }],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];

    // Collect all doc IDs first, then process sequentially to avoid resource contention
    const docEntries: { id: string; name: string }[] = [];
    for (const path of paths) {
      const parts = path.replace(/\\/g, '/').split('/');
      const filename = parts[parts.length - 1];
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'txt';
      const docType = extToType(ext);
      const id = await addDocument(knowledgeBaseId, { name: filename, path, type: docType });
      docEntries.push({ id, name: filename });
    }
    onReload();

    // Process documents sequentially
    for (const entry of docEntries) {
      markProcessing(entry.id, true);
      try {
        await processDocument(knowledgeBaseId, entry.id);
      } catch (e) {
        toast.error(`文档处理失败 (${entry.name}): ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        markProcessing(entry.id, false);
        onReload();
      }
    }
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      return;
    }
    setUrlInput('');
    setUrlRowOpen(false);
    const id = await addUrlDocument(knowledgeBaseId, url);
    onReload();
    markProcessing(id, true);
    processDocument(knowledgeBaseId, id)
      .catch((e) => { toast.error(`文档处理失败: ${e instanceof Error ? e.message : String(e)}`); })
      .finally(() => {
        markProcessing(id, false);
        onReload();
      });
  };

  const handleRetry = async (doc: KnowledgeDocument) => {
    markProcessing(doc.id, true);
    processDocument(knowledgeBaseId, doc.id)
      .catch((e) => { toast.error(`文档处理失败: ${e instanceof Error ? e.message : String(e)}`); })
      .finally(() => {
        markProcessing(doc.id, false);
        onReload();
      });
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    onReload();
  };

  const isProcessing = (doc: KnowledgeDocument) =>
    processing.has(doc.id) || doc.status === 'processing' || doc.status === 'pending';

  const showContextMenu = useContextMenu<KnowledgeDocument>(
    (doc) => {
      const items: MenuDef = [];
      if (doc.status === 'failed') {
        items.push({ type: 'item', id: 'retry', text: t('knowledgeBase.retry') });
        items.push({ type: 'separator' });
      }
      items.push({ type: 'item', id: 'delete', text: t('common.delete') });
      return items;
    },
    async (action, doc) => {
      if (action === 'retry') {
        handleRetry(doc);
      } else if (action === 'delete') {
        const confirmed = await ask(t('knowledgeBase.confirmDeleteDoc'), {
          title: t('knowledgeBase.deleteDoc'),
          kind: 'warning',
          okLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
        });
        if (confirmed) handleDelete(doc.id);
      }
    },
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAddFiles}
          className="rounded-md px-3 py-1.5 text-xs text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label) transition-colors"
        >
          {t('knowledgeBase.addFile')}
        </button>
        <button
          onClick={() => setUrlRowOpen((v) => !v)}
          className="rounded-md px-3 py-1.5 text-xs text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label) transition-colors"
        >
          {t('knowledgeBase.addUrl')}
        </button>
      </div>

      {/* URL input row */}
      {urlRowOpen && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            placeholder="https://..."
            className="flex-1 rounded-md border border-(--color-separator) bg-(--color-fill-secondary) px-3 py-1.5 text-xs text-(--color-label) placeholder-text-(--color-label-tertiary) outline-none focus:border-(--color-accent)"
          />
          <button
            onClick={handleAddUrl}
            className="rounded-md bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            {t('knowledgeBase.add')}
          </button>
        </div>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <p className="text-xs text-(--color-label-tertiary) py-2">{t('knowledgeBase.noDocuments')}</p>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => {
            const busy = isProcessing(doc);
            const isExpanded = expanded.has(doc.id);
            const canExpand = doc.status === 'completed' && doc.chunk_count > 0;

            return (
              <div key={doc.id}>
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-(--color-fill-secondary) group"
                  onContextMenu={(e) => showContextMenu(e, doc)}
                >
                  {/* Expand chevron */}
                  {canExpand && (
                    <button
                      onClick={() => toggleExpand(doc.id)}
                      className="shrink-0 cursor-pointer text-(--color-label-tertiary)"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </button>
                  )}

                  {/* Type icon */}
                  {doc.type === 'url' ? (
                    <Globe className="size-3.5 shrink-0 text-(--color-label-tertiary)" />
                  ) : (
                    <FileText className="size-3.5 shrink-0 text-(--color-label-tertiary)" />
                  )}

                  {/* Name */}
                  <span className="flex-1 truncate text-xs text-(--color-label)" title={doc.name}>
                    {doc.name}
                  </span>

                  {/* Chunk count */}
                  {doc.status === 'completed' && (
                    <span className="text-xs text-(--color-label-tertiary) shrink-0">
                      {doc.chunk_count} {t('knowledgeBase.chunks')}
                    </span>
                  )}

                  {/* Status icon */}
                  <span className="shrink-0">
                    {busy ? (
                      <Spinner className="size-3.5" />
                    ) : doc.status === 'completed' ? (
                      <CheckCircle2 className="size-3.5 text-green-500" />
                    ) : doc.status === 'failed' ? (
                      <AlertCircle className="size-3.5 text-red-500" />
                    ) : null}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.status === 'failed' && !busy && (
                      <button
                        onClick={() => handleRetry(doc)}
                        className="rounded p-0.5 hover:bg-(--color-fill-tertiary) text-(--color-label-tertiary)"
                        title={t('knowledgeBase.retry')}
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="rounded p-0.5 hover:bg-(--color-fill-tertiary) text-(--color-label-tertiary) hover:text-red-500"
                      title={t('common.delete')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Error text */}
                {doc.status === 'failed' && doc.error && (
                  <p className="ml-8 text-xs text-red-500 pb-1">{doc.error}</p>
                )}

                {/* Chunk preview */}
                {isExpanded && <ChunkPreview documentId={doc.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
