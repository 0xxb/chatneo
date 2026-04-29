import { RecursiveCharacterTextSplitter, MarkdownTextSplitter } from '@langchain/textsplitters';

export interface TextChunk {
  content: string;
  position: number;
}

/** 分块参数下限：chunk_size 至少 100，chunk_overlap 必须 < chunk_size。 */
export const MIN_CHUNK_SIZE = 100;

export function clampChunkParams(rawSize: number, rawOverlap: number): { chunkSize: number; chunkOverlap: number } {
  const chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(rawSize || 0) || 1000);
  const chunkOverlap = Math.min(
    Math.max(0, Math.floor(rawOverlap || 0)),
    chunkSize - 1,
  );
  return { chunkSize, chunkOverlap };
}

export async function splitText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    type?: 'plain' | 'markdown';
  } = {},
): Promise<TextChunk[]> {
  // 即使 UI 校验失守（旧数据/手工改 DB），也要兜底，不让 LangChain 对 chunkOverlap >= chunkSize 硬抛错。
  const { chunkSize, chunkOverlap } = clampChunkParams(
    options.chunkSize ?? 1000,
    options.chunkOverlap ?? 200,
  );
  const { type = 'plain' } = options;

  const splitter = type === 'markdown'
    ? new MarkdownTextSplitter({ chunkSize, chunkOverlap })
    : new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });

  const docs = await splitter.createDocuments([text]);

  return docs.map((doc, index) => ({
    content: doc.pageContent,
    position: index,
  }));
}

export function detectContentType(filename: string): 'plain' | 'markdown' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'plain';
}
