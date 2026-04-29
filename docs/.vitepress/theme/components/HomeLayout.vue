<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const features = [
  {
    icon: '🌐',
    title: '多提供商支持',
    desc: 'OpenAI / Anthropic / Gemini / DeepSeek / Ollama 等 28+ 提供商，支持任意 OpenAI 兼容端点',
  },
  {
    icon: '🧠',
    title: '深度思考',
    desc: '支持 o1/o3、Claude、Gemini、DeepSeek 等模型的扩展推理模式',
  },
  {
    icon: '⚡',
    title: '多模型对比',
    desc: '同时向多个模型提问，并排显示回答，直观对比效果',
  },
  {
    icon: '📚',
    title: '知识库 (RAG)',
    desc: '本地向量化知识库，支持 PDF / Word / URL 等文档，语义检索自动注入对话',
  },
  {
    icon: '🔧',
    title: '工具 & MCP',
    desc: '内置网页搜索、代码运行等工具，支持 MCP 协议连接外部工具服务',
  },
  {
    icon: '🎙️',
    title: '语音交互',
    desc: 'Whisper 语音输入 + TTS 语音朗读，支持本地引擎与云端 API',
  },
  {
    icon: '🎨',
    title: '图片 & 视频生成',
    desc: '支持 DALL-E / Gemini / Grok 等模型的图片生成，火山引擎视频生成',
  },
  {
    icon: '🔒',
    title: '隐私优先',
    desc: 'SQLite 本地数据库存储，支持备份恢复与 WebDAV 云同步，数据由你掌控',
  },
]

const providers = [
  'OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Groq', 'xAI',
  'Mistral', 'Perplexity', 'Ollama', 'OpenRouter',
  '硅基流动', 'Kimi', '智谱', '火山引擎', 'MiniMax', '阿里百炼',
  'Together AI', 'Fireworks', 'Cerebras', 'Cohere',
  'DeepInfra', 'SambaNova', '302.AI', 'AiHubMix',
]

// TODO: 替换为实际截图路径
const screenshots = [
  '/images/screenshot-1.png',
  '/images/screenshot-2.png',
  '/images/screenshot-3.png',
  '/images/screenshot-4.png',
  '/images/screenshot-5.png',
  '/images/screenshot-6.png',
]

const DEFAULT_SLIDE_INDEX = 1
const DRAG_THRESHOLD = 6

const visible = ref(false)
const activeIndex = ref(DEFAULT_SLIDE_INDEX)
const galleryRef = ref<HTMLElement>()
let isDragging = false
let didDrag = false
let pointerDownIndex: number | null = null
let startX = 0
let scrollStart = 0

function selectSlide(index: number) {
  activeIndex.value = index
  scrollToSlide(index)
}

function scrollToSlide(index: number, smooth = true) {
  const gallery = galleryRef.value
  if (!gallery) return
  const slide = gallery.children[index] as HTMLElement
  if (!slide) return
  const offset = slide.offsetLeft - gallery.offsetWidth / 2 + slide.offsetWidth / 2
  gallery.scrollTo({ left: offset, behavior: smooth ? 'smooth' : 'auto' })
}

function onPointerDown(e: PointerEvent) {
  const gallery = galleryRef.value
  if (!gallery) return
  isDragging = true
  didDrag = false
  const target = e.target as HTMLElement | null
  const item = target?.closest('.gallery-item') as HTMLElement | null
  pointerDownIndex = item ? Number(item.dataset.index) : null
  startX = e.clientX
  scrollStart = gallery.scrollLeft
  gallery.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging || !galleryRef.value) return
  const dx = e.clientX - startX
  if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD) return
  if (!didDrag) {
    didDrag = true
    galleryRef.value.style.cursor = 'grabbing'
    galleryRef.value.style.scrollSnapType = 'none'
  }
  galleryRef.value.scrollLeft = scrollStart - dx
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging || !galleryRef.value) return
  isDragging = false
  galleryRef.value.style.cursor = ''
  galleryRef.value.style.scrollSnapType = ''
  galleryRef.value.releasePointerCapture(e.pointerId)

  if (didDrag) {
    // Find closest slide after drag.
    updateActiveFromScroll()
    pointerDownIndex = null
    return
  }

  if (pointerDownIndex !== null && !Number.isNaN(pointerDownIndex)) {
    selectSlide(pointerDownIndex)
  }
  pointerDownIndex = null
}

function updateActiveFromScroll() {
  const gallery = galleryRef.value
  if (!gallery) return
  const center = gallery.scrollLeft + gallery.offsetWidth / 2
  let closest = 0
  let minDist = Infinity
  for (let i = 0; i < gallery.children.length; i++) {
    const child = gallery.children[i] as HTMLElement
    const childCenter = child.offsetLeft + child.offsetWidth / 2
    const dist = Math.abs(center - childCenter)
    if (dist < minDist) {
      minDist = dist
      closest = i
    }
  }
  activeIndex.value = closest
}

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
    activeIndex.value = DEFAULT_SLIDE_INDEX
    scrollToSlide(DEFAULT_SLIDE_INDEX, false)
  })
})
</script>

<template>
  <div class="home-custom">
    <!-- Hero -->
    <section class="hero" :class="{ visible }">
      <div class="hero-bg">
        <div class="hero-glow hero-glow-1" />
        <div class="hero-glow hero-glow-2" />
      </div>
      <div class="hero-text">
        <h1 class="hero-title">
          Chat<span class="hero-title-accent">Neo</span>
        </h1>
        <p class="hero-tagline">
          跨平台 AI 聊天客户端<br />
          <span class="hero-tagline-sub">支持 28+ AI 服务提供商，数据本地存储</span>
        </p>
        <div class="hero-actions">
          <a href="/getting-started" class="btn btn-primary">快速上手</a>
          <a
            href="https://github.com/0xxb/chatneo/releases"
            target="_blank"
            class="btn btn-secondary"
          >下载安装</a>
        </div>
      </div>

      <!-- Gallery -->
      <div class="gallery-section">
        <div
          ref="galleryRef"
          class="gallery"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @scroll="updateActiveFromScroll"
        >
          <div
            v-for="(src, i) in screenshots"
            :key="i"
            :data-index="i"
            class="gallery-item"
            :class="{ active: activeIndex === i }"
            @click="selectSlide(i)"
          >
            <img :src="src" :alt="`ChatNeo Screenshot ${i + 1}`" draggable="false" />
          </div>
        </div>
        <!-- Dots -->
        <div class="gallery-dots">
          <button
            v-for="(_, i) in screenshots"
            :key="i"
            class="gallery-dot"
            :class="{ active: activeIndex === i }"
            @click="selectSlide(i)"
          />
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="features" :class="{ visible }">
      <div class="features-inner">
        <h2 class="section-title">功能特性</h2>
        <div class="features-grid">
          <div
            v-for="(f, i) in features"
            :key="i"
            class="feature-card"
            :style="{ '--delay': `${i * 80}ms` }"
          >
            <div class="feature-icon">{{ f.icon }}</div>
            <h3 class="feature-title">{{ f.title }}</h3>
            <p class="feature-desc">{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Providers -->
    <section class="providers" :class="{ visible }">
      <div class="providers-inner">
        <h2 class="section-title">支持的提供商</h2>
        <p class="section-sub">覆盖国内外主流 AI 平台，支持任意 OpenAI 兼容端点</p>
        <div class="provider-marquee">
          <div class="provider-track">
            <span v-for="(p, i) in [...providers, ...providers]" :key="i" class="provider-tag">
              {{ p }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta" :class="{ visible }">
      <div class="cta-inner">
        <h2 class="cta-title">开始使用 ChatNeo</h2>
        <p class="cta-desc">跨平台支持 macOS / Windows</p>
        <div class="hero-actions">
          <a href="/getting-started" class="btn btn-primary">查看文档</a>
          <a
            href="https://github.com/0xxb/chatneo/releases"
            target="_blank"
            class="btn btn-secondary"
          >前往下载</a>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-custom {
  --c-brand: #6366f1;
  --c-brand-light: #818cf8;
  --c-cyan: #06b6d4;
}

/* Hero */
.hero {
  position: relative;
  overflow: hidden;
  padding: 80px 0 40px;
  text-align: center;
}

.hero-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.25;
  animation: glow-float 8s ease-in-out infinite;
}

.hero-glow-1 {
  width: 500px;
  height: 500px;
  background: var(--c-brand);
  top: -100px;
  left: 50%;
  transform: translateX(-70%);
}

.hero-glow-2 {
  width: 400px;
  height: 400px;
  background: var(--c-cyan);
  bottom: -50px;
  right: 50%;
  transform: translateX(70%);
  animation-delay: -4s;
}

@keyframes glow-float {
  0%, 100% { transform: translateX(-70%) translateY(0); }
  50% { transform: translateX(-70%) translateY(-30px); }
}

.hero-text {
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 24px;
}

.hero-title {
  font-size: clamp(48px, 8vw, 72px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.1;
  margin-bottom: 16px;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s ease 0.2s;
}

.hero-title-accent {
  background: linear-gradient(120deg, var(--c-brand), var(--c-cyan));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-tagline {
  font-size: 18px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin-bottom: 32px;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s ease 0.3s;
}

.hero-tagline-sub {
  font-size: 15px;
  color: var(--vp-c-text-3);
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s ease 0.4s;
}

.visible .hero-title,
.visible .hero-tagline,
.visible .hero-actions {
  opacity: 1;
  transform: translateY(0);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}

.btn-primary {
  background: var(--c-brand);
  color: #fff;
}

.btn-primary:hover {
  background: var(--c-brand-light);
}

.btn-secondary {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.btn-secondary:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}

/* Gallery */
.gallery-section {
  margin-top: 48px;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.8s ease 0.5s;
}

.visible .gallery-section {
  opacity: 1;
  transform: translateY(0);
}

.gallery {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  cursor: grab;
  padding-left: 50%;
  padding-right: 50%;
}

.gallery::-webkit-scrollbar {
  display: none;
}

.gallery-item {
  flex: 0 0 auto;
  scroll-snap-align: center;
  opacity: 0.5;
  transform: scale(0.95);
  transition: opacity 0.4s ease, transform 0.4s ease;
  user-select: none;
}

.gallery-item.active {
  opacity: 1;
  transform: scale(1);
}

.gallery-item img {
  display: block;
  height: min(50vw, 500px);
  width: auto;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  pointer-events: none;
}

/* Dots */
.gallery-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 20px;
}

.gallery-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: var(--vp-c-divider);
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;
}

.gallery-dot.active {
  background: var(--c-brand);
  width: 24px;
  border-radius: 4px;
}

/* Section Common */
.section-title {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.section-sub {
  text-align: center;
  color: var(--vp-c-text-3);
  font-size: 15px;
  margin-bottom: 32px;
}

/* Features */
.features {
  padding: 60px 24px;
}

.features-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 960px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .features-grid { grid-template-columns: 1fr; }
}

.feature-card {
  padding: 24px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid transparent;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease var(--delay),
              transform 0.5s ease var(--delay),
              border-color 0.3s ease;
}

.visible .feature-card {
  opacity: 1;
  transform: translateY(0);
}

.feature-card:hover {
  border-color: var(--vp-c-brand-soft);
}

.feature-icon {
  font-size: 28px;
  margin-bottom: 12px;
}

.feature-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
}

.feature-desc {
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

/* Providers */
.providers {
  padding: 60px 24px;
}

.providers-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.provider-marquee {
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
}

.provider-track {
  display: flex;
  gap: 10px;
  width: max-content;
  animation: marquee 40s linear infinite;
}

.provider-track:hover {
  animation-play-state: paused;
}

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.provider-tag {
  flex-shrink: 0;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  white-space: nowrap;
  transition: color 0.25s ease, border-color 0.25s ease;
}

.provider-tag:hover {
  color: var(--c-brand);
  border-color: var(--c-brand);
}

/* CTA */
.cta {
  padding: 80px 24px;
  text-align: center;
}

.cta-inner {
  max-width: 500px;
  margin: 0 auto;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cta-desc {
  color: var(--vp-c-text-3);
  margin-bottom: 24px;
  font-size: 15px;
}
</style>
