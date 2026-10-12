import { Marked } from "marked";
import katex from "katex";
import katexCss from "katex/dist/katex.min.css?raw";

const KATEX_VERSION = "0.19.0";
const KATEX_FONT_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/fonts/`;
const STYLE_ID = "yuketang-js-katex-style";

// Order matters: display delimiters before inline ones
const MATH_PATTERNS: { regex: RegExp; display: boolean }[] = [
  { regex: /\$\$([\s\S]+?)\$\$/g, display: true },
  { regex: /\\\[([\s\S]+?)\\\]/g, display: true },
  { regex: /\\\(([\s\S]+?)\\\)/g, display: false },
  { regex: /(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, display: false },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Never pass raw HTML from model output through to the page
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

/**
 * Injects KaTeX CSS once, with font URLs pointed at the CDN since the userscript can't ship font files.
 */
export function ensureKatexStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = katexCss.replace(/url\(fonts\//g, `url(${KATEX_FONT_BASE}`);
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Renders Markdown containing LaTeX ($...$, $$...$$, \(...\), \[...\]) to HTML.
 */
export function renderMarkdownWithMath(markdown: string): string {
  const rendered: string[] = [];
  let source = markdown;

  // Swap math out for placeholders so Markdown doesn't mangle backslashes and underscores
  for (const { regex, display } of MATH_PATTERNS) {
    source = source.replace(regex, (_match, tex: string) => {
      const html = katex.renderToString(tex.trim(), {
        displayMode: display,
        throwOnError: false,
        output: "htmlAndMathml",
      });
      rendered.push(html);
      return `KATEXPLACEHOLDER${rendered.length - 1}END`;
    });
  }

  const html = marked.parse(source) as string;
  return html.replace(
    /KATEXPLACEHOLDER(\d+)END/g,
    (_match, index: string) => rendered[Number(index)] ?? "",
  );
}
