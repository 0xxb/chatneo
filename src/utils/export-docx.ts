import {
  Document, Paragraph, TextRun, HeadingLevel, ExternalHyperlink,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, Packer, LevelFormat, AlignmentType,
  type ParagraphChild, type IRunPropertiesOptions, type ILevelsOptions,
} from 'docx';
import { marked, type Token, type Tokens } from 'marked';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { fetchConversationData, getImageParts, getVideoParts, roleLabel } from './export-conversation';
import { logger } from '../lib/logger';
import { safeJsonParse } from '../lib/utils';
import type { SearchResult } from '../lib/knowledge-base';

const MONO_FONT = 'Courier New';
const BODY_FONT = 'Arial';

const IMAGE_TYPE_MAP: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', bmp: 'bmp',
};

async function readImageBuffer(filePath: string): Promise<{ buffer: Uint8Array; ext: string } | null> {
  try {
    const buffer = await readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png';
    return { buffer, ext };
  } catch {
    logger.warn('export', `读取图片失败: ${filePath}`);
    return null;
  }
}

/** 将图片数据转为 docx Paragraph 数组（图片 + 可选标题） */
function buildImageParagraphs(
  imgData: { buffer: Uint8Array; ext: string },
  width: number,
  height: number,
  caption?: string,
): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new ImageRun({
        type: IMAGE_TYPE_MAP[imgData.ext] ?? 'png',
        data: imgData.buffer,
        transformation: { width, height },
      })],
    }),
  ];
  if (caption) {
    paragraphs.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: caption, color: '999999', size: 16 })],
    }));
  }
  return paragraphs;
}

function inlineTokensToRuns(tokens: Token[], inherited: Partial<IRunPropertiesOptions> = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const textToken = t as Tokens.Text;
        const lines = textToken.text.split('\n');
        lines.forEach((line, i) => {
          if (i > 0) runs.push(new TextRun({ ...inherited, break: 1, text: '' }));
          if (line) runs.push(new TextRun({ ...inherited, text: line }));
        });
        break;
      }
      case 'strong':
        runs.push(...inlineTokensToRuns((t as Tokens.Strong).tokens, { ...inherited, bold: true }));
        break;
      case 'em':
        runs.push(...inlineTokensToRuns((t as Tokens.Em).tokens, { ...inherited, italics: true }));
        break;
      case 'codespan':
        runs.push(new TextRun({
          ...inherited, text: (t as Tokens.Codespan).text,
          font: MONO_FONT, size: 18,
          shading: { type: ShadingType.CLEAR, fill: 'E8E8E8' },
        }));
        break;
      case 'link':
        runs.push(new ExternalHyperlink({
          link: (t as Tokens.Link).href,
          children: [new TextRun({ ...inherited, text: (t as Tokens.Link).text, style: 'Hyperlink' })],
        }));
        break;
      case 'br':
        runs.push(new TextRun({ ...inherited, break: 1, text: '' }));
        break;
      default:
        if ('text' in t && typeof t.text === 'string')
          runs.push(new TextRun({ ...inherited, text: t.text }));
    }
  }
  return runs;
}

type NumberingConfig = { reference: string; levels: readonly ILevelsOptions[] };

function blockTokensToDocx(
  tokens: Token[],
  numberings: NumberingConfig[],
  counter: { value: number },
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const h = token as Tokens.Heading;
        const levelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
        };
        elements.push(new Paragraph({
          heading: levelMap[h.depth] ?? HeadingLevel.HEADING_4,
          children: inlineTokensToRuns(h.tokens),
        }));
        break;
      }
      case 'paragraph': {
        const p = token as Tokens.Paragraph;
        elements.push(new Paragraph({ spacing: { after: 120 }, children: inlineTokensToRuns(p.tokens) }));
        break;
      }
      case 'code': {
        const code = token as Tokens.Code;
        const lines = code.text.split('\n');
        if (code.lang) {
          elements.push(new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
            spacing: { before: 120, after: 0 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            },
            children: [new TextRun({ text: code.lang.toUpperCase(), font: MONO_FONT, size: 14, color: '6B7280' })],
          }));
        }
        lines.forEach((line, i) => {
          elements.push(new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: 'F9FAFB' },
            spacing: { before: 0, after: 0 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              ...(i === lines.length - 1 ? { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' } } : {}),
              ...(!code.lang && i === 0 ? { top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' } } : {}),
            },
            children: [new TextRun({ text: line || ' ', font: MONO_FONT, size: 17 })],
          }));
        });
        elements.push(new Paragraph({ spacing: { before: 120 } }));
        break;
      }
      case 'list': {
        const list = token as Tokens.List;
        if (list.ordered) {
          const ref = `ordered-list-${++counter.value}`;
          numberings.push({
            reference: ref,
            levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
          });
          for (const item of list.items) {
            const children = inlineTokensToRuns(item.tokens.flatMap((t) =>
              t.type === 'text' ? ((t as Tokens.Text).tokens ?? [t]) : [t]
            ));
            elements.push(new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children }));
          }
        } else {
          for (const item of list.items) {
            const children = inlineTokensToRuns(item.tokens.flatMap((t) =>
              t.type === 'text' ? ((t as Tokens.Text).tokens ?? [t]) : [t]
            ));
            elements.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children }));
          }
        }
        break;
      }
      case 'blockquote': {
        const bq = token as Tokens.Blockquote;
        for (const innerToken of bq.tokens) {
          if (innerToken.type === 'paragraph') {
            elements.push(new Paragraph({
              indent: { left: 400 },
              border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 8 } },
              spacing: { after: 120 },
              children: inlineTokensToRuns((innerToken as Tokens.Paragraph).tokens, { color: '6B7280' }),
            }));
          }
        }
        break;
      }
      case 'table': {
        const tbl = token as Tokens.Table;
        const rows: TableRow[] = [];
        rows.push(new TableRow({
          tableHeader: true,
          children: tbl.header.map((cell) =>
            new TableCell({
              shading: { fill: 'F9FAFB' },
              children: [new Paragraph({ children: inlineTokensToRuns(cell.tokens, { bold: true }) })],
            })
          ),
        }));
        for (const row of tbl.rows) {
          rows.push(new TableRow({
            children: row.map((cell) =>
              new TableCell({ children: [new Paragraph({ children: inlineTokensToRuns(cell.tokens) })] })
            ),
          }));
        }
        elements.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
        elements.push(new Paragraph({ spacing: { before: 120 } }));
        break;
      }
      case 'hr':
        elements.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB', space: 4 } },
          spacing: { before: 200, after: 200 },
        }));
        break;
      case 'space':
        break;
      default:
        if ('text' in token && typeof token.text === 'string')
          elements.push(new Paragraph({ text: token.text }));
    }
  }
  return elements;
}

export async function exportAsDocx(conversationId: string) {
  logger.info('export', `导出 Word: convId=${conversationId}`);
  const { title, model, messages } = await fetchConversationData(conversationId);

  const numberings: NumberingConfig[] = [];
  const counter = { value: 0 };
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { after: 60 },
    children: [new TextRun({ text: title })],
  }));
  children.push(new Paragraph({
    spacing: { after: 300 },
    children: [new TextRun({ text: `模型：${model}`, color: '888888', size: 18 })],
  }));

  for (const msg of messages) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({
        text: roleLabel(msg.role).toUpperCase(), bold: true,
        size: 16, color: '999999', font: BODY_FONT,
      })],
    }));

    if (msg.thinking) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        shading: { type: ShadingType.CLEAR, fill: 'F9FAFB' },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        },
        children: [new TextRun({ text: '思考过程', italics: true, color: '9CA3AF', size: 18 })],
      }));
      children.push(...blockTokensToDocx(marked.lexer(msg.thinking), numberings, counter));
    }

    children.push(...blockTokensToDocx(marked.lexer(msg.content), numberings, counter));

    const ragResults = safeJsonParse<SearchResult[]>(msg.rag_results, []);
    if (ragResults.length > 0) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        shading: { type: ShadingType.CLEAR, fill: 'F9FAFB' },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        },
        children: [new TextRun({
          text: `引用来源 (${ragResults.length})`, bold: true, color: '6B7280', size: 18,
        })],
      }));
      ragResults.forEach((r, i) => {
        const similarity = Math.max(0, (1 - r.distance) * 100).toFixed(1);
        const isLast = i === ragResults.length - 1;
        children.push(new Paragraph({
          spacing: { after: 0 },
          shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            ...(isLast ? { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' } } : {}),
          },
          children: [
            new TextRun({ text: r.document_name, bold: true, color: '374151', size: 18 }),
            new TextRun({ text: `  ${similarity}%`, color: '9CA3AF', size: 16 }),
          ],
        }));
      });
      children.push(new Paragraph({ spacing: { after: 120 } }));
    }

    // 并行预取所有图片
    const generatedImages = getImageParts(msg);
    const attImages = (msg.attachments ?? []).filter((a) => a.type === 'image');
    const allPaths = [
      ...generatedImages.map((img) => img.path),
      ...attImages.map((att) => att.path),
    ];
    const allBuffers = await Promise.all(allPaths.map(readImageBuffer));

    // AI 生成的图片
    for (let i = 0; i < generatedImages.length; i++) {
      const imgData = allBuffers[i];
      if (!imgData) continue;
      const img = generatedImages[i];
      const width = Math.min(img.width ?? 400, 500);
      const height = img.height ? Math.round((img.height / (img.width ?? 400)) * width) : 300;
      children.push(...buildImageParagraphs(imgData, width, height, img.revisedPrompt));
    }

    // 用户附件图片
    for (let i = 0; i < attImages.length; i++) {
      const imgData = allBuffers[generatedImages.length + i];
      if (!imgData) continue;
      children.push(...buildImageParagraphs(imgData, 400, 300, attImages[i].name));
    }

    // 生成的视频（DOCX 不能嵌入视频，添加文件引用）
    for (const vid of getVideoParts(msg)) {
      const name = vid.path.replace(/\\/g, '/').split('/').pop() ?? '视频';
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: `🎬 生成的视频: ${name}`, color: '666666' })],
      }));
    }

    // 用户附件文件
    for (const att of (msg.attachments ?? []).filter((a) => a.type === 'file')) {
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: `📎 ${att.name}`, color: '666666' })],
      }));
    }

    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'F3F4F6', space: 4 } },
      spacing: { before: 100, after: 200 },
    }));
  }

  const doc = new Document({
    numbering: { config: numberings },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  const path = await save({ defaultPath: `${title}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] });
  if (path) {
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    logger.info('export', `Word 导出完成: path=${path}, 消息数=${messages.length}`);
  }
}
