import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
assert(!/<script\b[^>]*\bsrc\s*=/i.test(html), '发布 HTML 不应引用外部脚本');
assert(!/<link\b[^>]*\brel=["']stylesheet["']/i.test(html), '发布 HTML 不应引用外部样式');
for (const match of html.matchAll(/url\(([^)]+)\)/gi)) {
  const url = match[1]?.trim().replace(/^["']|["']$/g, '');
  assert(url?.startsWith('data:') || url?.startsWith('#'), `资源未内嵌：${url?.slice(0, 80)}`);
}
assert(html.includes('data:font/woff2;base64,'), '发布 HTML 应包含内嵌字体');
assert(html.includes('SIL OPEN FONT LICENSE'), '发布 HTML 应包含字体许可');
assert(html.includes('糖果闯关') && html.includes('cut-tail'), '发布 HTML 应包含新玩法');
assert(
  html.includes('order-item-completed') && html.includes('orderReady'),
  '发布 HTML 应包含实时订单提示',
);
assert(!html.includes('candySnakeQa:') && !html.includes('qaState'), '发布 HTML 不应包含验收夹具');
console.log(
  `发布资源检查通过：${Buffer.byteLength(html)} 字节；脚本、样式与字体已内嵌，测试夹具未打包。`,
);
