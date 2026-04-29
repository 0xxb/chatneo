# 知识库 (RAG)

ChatNeo 内置 RAG（检索增强生成）系统，让 AI 基于你的文档回答问题。

## 创建知识库

打开 **设置 > 知识库**，点击创建。

配置项：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| 名称 | - | 知识库名称 |
| 描述 | - | 可选描述 |
| Embedding 提供商 | Ollama | 用于生成向量的模型服务 |
| Embedding 模型 | - | 具体的 Embedding 模型 |
| 向量维度 | 1536 | 自动根据模型调整 |
| 分块大小 | 500 | 文档切分的字符数 |
| 分块重叠 | 50 | 相邻块的重叠字符数 |

<!-- TODO: 截图 - 知识库创建界面 -->

## 支持的 Embedding 提供商

**原生支持：**
- OpenAI（text-embedding-3-small 等）
- Google AI
- Mistral
- Cohere
- 阿里百炼

**OpenAI 兼容：**
- 硅基流动、Kimi、智谱、火山引擎、MiniMax、DeepSeek、SambaNova、302.AI、AiHubMix 等

**本地：**
- Ollama（默认，无需 API Key）

## 添加文档

支持以下文档格式：

| 格式 | 说明 |
|------|------|
| PDF | 文本提取 |
| Word (DOCX) | 段落解析 |
| TXT | 纯文本 |
| Markdown | Markdown 文件，使用专用分块器 |
| URL | 自动抓取网页内容 |

添加文档后，ChatNeo 自动完成：

1. **文本提取** - 从文档中提取纯文本
2. **文本分块** - 按配置的分块大小切分（Markdown 文件使用 MarkdownTextSplitter，其他使用 RecursiveCharacterTextSplitter）
3. **向量化** - 使用 Embedding 模型将文本块转换为向量（每批 20 条）
4. **存储** - 向量存储在本地 SQLite 数据库（使用 sqlite-vec 扩展）

文档处理状态：待处理 → 处理中 → 完成 / 失败。

## 在对话中使用

1. 在对话中关联一个或多个知识库
2. 发送消息时，ChatNeo 自动搜索知识库中的相关内容
3. 相关文档片段以系统消息的形式注入到对话上下文中
4. AI 基于检索到的内容回答问题

检索参数：
- 返回最相关的 5 个文档片段
- 相似度低于 20% 的结果自动过滤

<!-- TODO: 截图 - 对话中使用知识库，展示 RAG 引用来源 -->

## 最佳实践

- **分块大小**：文档内容较密集时使用较小值（300-500），内容较松散时使用较大值（800-1000）
- **分块重叠**：建议设为分块大小的 10-20%，避免上下文被截断
- **Embedding 模型**：OpenAI text-embedding-3-small 性价比高；本地可使用 Ollama 的 nomic-embed-text
