import { createCodePlugin } from '@streamdown/code';
import type { CodeHighlighterPlugin } from '@streamdown/code';
import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import type { ThemeInput } from '@streamdown/code';

const math = createMathPlugin({ singleDollarTextMath: true });

type ThemePair = [ThemeInput, ThemeInput];

const CODE_THEMES: Record<string, ThemePair> = {
  auto: ['github-light', 'github-dark'],
  github: ['github-light', 'github-dark'],
  'one-dark': ['one-light', 'one-dark-pro'],
  monokai: ['monokai', 'monokai'],
};

let currentThemeKey = 'auto';
let codePlugin: CodeHighlighterPlugin = createCodePlugin();

function getThemePair(key: string): ThemePair {
  return CODE_THEMES[key] ?? CODE_THEMES.auto;
}

export function setCodeTheme(themeKey: string) {
  if (themeKey === currentThemeKey) return;
  currentThemeKey = themeKey;
  codePlugin = createCodePlugin({ themes: getThemePair(themeKey) });
  streamdownPlugins.code = codePlugin;
}

export const streamdownPlugins: { code: CodeHighlighterPlugin; cjk: typeof cjk; math: typeof math; mermaid: typeof mermaid } = {
  code: codePlugin,
  cjk,
  math,
  mermaid,
};
