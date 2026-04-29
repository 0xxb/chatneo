# 语音交互

ChatNeo 支持语音输入（STT）和语音朗读（TTS）。在 **设置 > 语音** 中配置。

## 语音输入 (STT)

两种方式：

### Whisper（本地）

使用本地 Whisper 模型进行语音识别，无需网络。

1. 在设置中选择 Whisper 模型并下载
2. 支持多种模型大小，模型越大识别越准
3. 支持自定义模型路径

### OpenAI 兼容 API

使用云端 API 进行语音识别。

| 字段 | 默认值 | 说明 |
|------|--------|------|
| Base URL | `https://api.openai.com` | API 地址 |
| API Key | - | 认证密钥 |
| 模型 | whisper-1 | 模型名称 |

支持的语言：中文、英文、日文、韩文。

可开启 **自动发送**，录音结束后自动发送消息。

## 语音朗读 (TTS)

两种方式：

### Sherpa（本地）

使用本地 TTS 引擎合成语音，无需网络。

在设置中下载并选择 TTS 模型。

### OpenAI 兼容 API

使用云端 API 合成语音。

| 字段 | 默认值 | 说明 |
|------|--------|------|
| Base URL | `https://api.openai.com` | API 地址 |
| API Key | - | 认证密钥 |
| 模型 | tts-1 | TTS 模型 |
| 音色 | alloy | 可选：alloy / echo / fable / onyx / nova / shimmer |

播放设置：
- **语速**：0.5x - 2.0x
- **自动朗读**：开启后 AI 回复自动朗读
