import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import HomeLayout from './components/HomeLayout.vue'
import PreviewBanner from './components/PreviewBanner.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-top': () => h(PreviewBanner),
    }),
  enhanceApp({ app }) {
    app.component('HomeLayout', HomeLayout)
  },
} satisfies Theme
