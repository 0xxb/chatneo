// src/lib/attachment-query.ts
import { getDb } from './db';
import { getAttachmentUrl } from './attachments';

export interface AttachmentRecord {
  id: string;
  type: 'image' | 'file';
  name: string;
  path: string;
  preview?: string;
  created_at: number;
}

/**
 * 查询历史上传的附件列表（按最近使用时间倒序，按 name+path 去重）。
 * 返回最多 limit 条记录。
 */
export async function queryRecentAttachments(limit = 50): Promise<AttachmentRecord[]> {
  const db = await getDb();
  const rows = await db.select<{ id: string; type: string; name: string; path: string; created_at: number }[]>(
    `SELECT id, type, name, path, created_at
     FROM attachments
     WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY name, path ORDER BY created_at DESC) AS rn
         FROM attachments
       ) WHERE rn = 1
     )
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type as 'image' | 'file',
    name: r.name,
    path: r.path,
    preview: r.type === 'image' ? getAttachmentUrl(r.path) : undefined,
    created_at: r.created_at,
  }));
}

/**
 * 按关键词过滤附件列表（匹配文件名，大小写不敏感）。
 */
export function filterAttachments(attachments: AttachmentRecord[], keyword: string): AttachmentRecord[] {
  const lower = keyword.toLowerCase();
  return lower
    ? attachments.filter((a) => a.name.toLowerCase().includes(lower))
    : attachments;
}
