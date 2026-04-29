import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ChatNeo',
  description: '跨平台 AI 聊天客户端',
  lang: 'zh-CN',
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/images/logo.png',

    nav: [
      {
        text: '下载',
        link: 'https://github.com/0xxb/chatneo/releases',
      },
    ],

    sidebar: [
      { text: '快速上手', link: '/getting-started' },
      { text: '提供商配置', link: '/providers' },
      { text: '对话功能', link: '/chat' },
      { text: '外观设置', link: '/appearance' },
      { text: '内置工具', link: '/tools' },
      { text: 'MCP 服务', link: '/mcp' },
      { text: '知识库 (RAG)', link: '/knowledge-base' },
      { text: '插件', link: '/plugins' },
      { text: '语音交互', link: '/voice' },
      { text: '图片与视频生成', link: '/media-generation' },
      { text: '导出与截图', link: '/export' },
      { text: '备份与同步', link: '/backup' },
      { text: '快捷键', link: '/shortcuts' },
      { text: '模型参数', link: '/model-params' },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/0xxb/chatneo' },
    ],

    footer: {
      copyright: `All rights reserved © 2026 <a href="https://huohuastudio.com" target="_blank">ChatNeo</a>`
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    editLink: {
      pattern: 'https://github.com/0xxb/chatneo/edit/master/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
      },
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    outline: {
      label: '页面导航',
    },
  },
})
