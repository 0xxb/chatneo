# 提供商配置

ChatNeo 支持 28+ AI 服务提供商。打开 **设置 > 提供商** 进行管理。

## 内置提供商

以下提供商已预置，填入 API Key 即可使用：

| 提供商 | 说明 | 需要 API Key |
|--------|------|:---:|
| OpenAI | GPT-4o、o1、o3、DALL-E 等 | 是 |
| Anthropic | Claude 系列 | 是 |
| Google AI | Gemini 系列 | 是 |
| DeepSeek | DeepSeek 系列 | 是 |
| Groq | 高速推理 | 是 |
| Perplexity | 搜索增强 | 是 |
| OpenRouter | 模型聚合平台 | 是 |
| Ollama | 本地模型运行 | 否 |

## 可添加提供商

在设置页点击添加，可以接入更多服务商：

### 国际平台

| 提供商 | 说明 |
|--------|------|
| Mistral | Mistral 系列 |
| xAI | Grok 系列 |
| Together AI | 开源模型托管 |
| Fireworks | 高速推理 |
| Cerebras | 高速推理 |
| SambaNova | 高速推理 |
| Cohere | Command 系列 |
| DeepInfra | 开源模型托管 |

### 国内平台

| 提供商 | 说明 |
|--------|------|
| 硅基流动 | 开源模型托管 |
| Kimi | Moonshot 系列 |
| 智谱 | GLM 系列 |
| 火山引擎 | 字节跳动，支持视频生成 |
| MiniMax | MiniMax 系列 |
| 阿里百炼 | 通义系列 |
| 302.AI | 聚合平台 |
| AiHubMix | 聚合平台 |

### 云平台

| 提供商 | 说明 |
|--------|------|
| Azure OpenAI | 微软 Azure 托管 |
| Amazon Bedrock | AWS 托管 |
| Google Vertex AI | GCP 托管 |

## 配置方式

### 标准提供商

大多数提供商只需填写 **API Key**，ChatNeo 已预设好默认 Base URL。

如需自定义 API 地址（如使用代理），可修改 Base URL。

<!-- TODO: 截图 - 标准提供商配置表单，展示 API Key 和 Base URL 输入 -->

### Azure OpenAI

需要额外配置：

| 字段 | 说明 |
|------|------|
| API Key | Azure API 密钥 |
| Endpoint | Azure 资源 URL |
| Resource Name | Azure 资源名 |
| API Version | API 版本号（默认 2024-10-01） |

### Amazon Bedrock

使用 AWS 凭证认证：

| 字段 | 说明 |
|------|------|
| Region | AWS 区域（默认 us-east-1） |
| Access Key ID | AWS 访问密钥 |
| Secret Access Key | AWS 秘密密钥 |
| Session Token | 临时凭证的会话令牌（可选） |

### Google Vertex AI

| 字段 | 说明 |
|------|------|
| API Key | 服务账号密钥 |
| Project | GCP 项目 ID |
| Location | 区域（默认 us-central1） |

### OpenAI 兼容端点

选择 **OpenAI Compatible** 类型，填入自定义 API 地址和密钥。适用于任何兼容 OpenAI API 格式的服务。

### Ollama（本地模型）

默认连接 `http://localhost:11434`，无需 API Key。确保 Ollama 已在本地运行并拉取了模型。

## 模型管理

每个提供商配置完成后，可以：

- **获取模型列表** - 自动从 API 拉取可用模型
- **手动添加模型** - 输入模型 ID 手动添加
- **收藏模型** - 常用模型标记收藏，方便快速切换
- **自定义能力** - 手动调整模型的能力标记（视觉、工具调用、思考等）

<!-- TODO: 截图 - 模型列表界面，展示模型获取和收藏功能 -->
