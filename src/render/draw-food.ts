import type { Food } from '../core/types';

/** 保留原版四种水果的像素绘制；新增水果可在此扩展绘制分支。 */
export function drawFood(
  ctx: CanvasRenderingContext2D,
  food: Food | null,
  GRID: number,
  time: number,
  options: { readonly animatedGlow?: boolean } = {},
): void {
  if (!food) return;

  const fx = food.x * GRID;
  const fy = food.y * GRID;
  const y = fy;

  // 像素光晕（十字星）
  if (options.animatedGlow !== false) {
    const glowAlpha = 0.25 + 0.1 * Math.sin(time * 0.08);
    ctx.globalAlpha = glowAlpha;
    ctx.fillStyle = food.color;
    ctx.fillRect(fx + GRID / 2 - 1, y + 2, 2, GRID - 4);
    ctx.fillRect(fx + 2, y + GRID / 2 - 1, GRID - 4, 2);
    ctx.fillRect(fx + GRID / 2 - 2, y + 4, 4, GRID - 8);
    ctx.fillRect(fx + 4, y + GRID / 2 - 2, GRID - 8, 4);
    ctx.globalAlpha = 1;
  }

  if (food.type === 'strawberry') {
    // 草莓 - 像素风
    // 底部深色阴影
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(fx + 4, y + 15, 12, 2);
    ctx.fillRect(fx + 6, y + 17, 8, 1);
    // 主体红色
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(fx + 5, y + 6, 10, 9);
    ctx.fillRect(fx + 3, y + 8, 2, 7);
    ctx.fillRect(fx + 15, y + 8, 2, 7);
    ctx.fillRect(fx + 4, y + 7, 12, 1);
    ctx.fillRect(fx + 4, y + 15, 12, 1);
    // 顶部收窄
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(fx + 7, y + 4, 6, 2);
    ctx.fillRect(fx + 8, y + 3, 4, 1);
    // 亮面（左上）
    ctx.fillStyle = '#fca5a5';
    ctx.fillRect(fx + 5, y + 7, 2, 4);
    ctx.fillRect(fx + 6, y + 6, 1, 1);
    // 籽（像素点）
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(fx + 7, y + 9, 1, 1);
    ctx.fillRect(fx + 11, y + 10, 1, 1);
    ctx.fillRect(fx + 9, y + 12, 1, 1);
    ctx.fillRect(fx + 13, y + 13, 1, 1);
    ctx.fillRect(fx + 6, y + 12, 1, 1);
    // 萼片（绿色叶子）
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(fx + 9, y + 1, 2, 3);
    ctx.fillRect(fx + 6, y + 2, 2, 2);
    ctx.fillRect(fx + 12, y + 2, 2, 2);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(fx + 9, y + 2, 2, 2);
    ctx.fillRect(fx + 7, y + 3, 1, 1);
    ctx.fillRect(fx + 12, y + 3, 1, 1);
  } else if (food.type === 'orange') {
    // 橘子 - 像素风
    // 底部阴影
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(fx + 5, y + 15, 10, 2);
    ctx.fillRect(fx + 7, y + 17, 6, 1);
    // 主体橙色
    ctx.fillStyle = '#f97316';
    ctx.fillRect(fx + 4, y + 6, 12, 9);
    ctx.fillRect(fx + 3, y + 8, 14, 6);
    ctx.fillRect(fx + 5, y + 5, 10, 1);
    ctx.fillRect(fx + 5, y + 15, 10, 1);
    // 顶部
    ctx.fillRect(fx + 7, y + 4, 6, 1);
    ctx.fillRect(fx + 8, y + 3, 4, 1);
    // 亮面
    ctx.fillStyle = '#fdba74';
    ctx.fillRect(fx + 5, y + 7, 3, 3);
    ctx.fillRect(fx + 6, y + 6, 2, 1);
    // 橘子皮纹理
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(fx + 11, y + 8, 1, 1);
    ctx.fillRect(fx + 13, y + 11, 1, 1);
    ctx.fillRect(fx + 8, y + 12, 1, 1);
    ctx.fillRect(fx + 10, y + 14, 1, 1);
    // 叶子
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(fx + 9, y + 1, 2, 3);
    ctx.fillRect(fx + 7, y + 2, 2, 2);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(fx + 9, y + 2, 2, 2);
    ctx.fillRect(fx + 8, y + 3, 1, 1);
  } else if (food.type === 'grape') {
    // 葡萄 - 像素风（一串7颗）
    const grapeColor = '#7c3aed';
    const grapeShadow = '#5b21b6';
    const grapeLight = '#a78bfa';

    // 先画阴影层
    ctx.fillStyle = grapeShadow;
    // 第一行（顶部2颗）
    ctx.fillRect(fx + 6, y + 6, 4, 1);
    ctx.fillRect(fx + 10, y + 6, 4, 1);
    // 第二行（3颗）
    ctx.fillRect(fx + 3, y + 10, 4, 1);
    ctx.fillRect(fx + 8, y + 10, 4, 1);
    ctx.fillRect(fx + 13, y + 10, 4, 1);
    // 第三行（2颗）
    ctx.fillRect(fx + 6, y + 14, 4, 1);
    ctx.fillRect(fx + 10, y + 14, 4, 1);

    // 主体紫色
    ctx.fillStyle = grapeColor;
    // 第一行（顶部2颗）
    ctx.fillRect(fx + 5, y + 3, 5, 4);
    ctx.fillRect(fx + 4, y + 4, 7, 2);
    ctx.fillRect(fx + 11, y + 3, 5, 4);
    ctx.fillRect(fx + 10, y + 4, 7, 2);
    // 第二行（3颗）
    ctx.fillRect(fx + 2, y + 7, 5, 4);
    ctx.fillRect(fx + 1, y + 8, 7, 2);
    ctx.fillRect(fx + 8, y + 7, 5, 4);
    ctx.fillRect(fx + 7, y + 8, 7, 2);
    ctx.fillRect(fx + 14, y + 7, 5, 4);
    ctx.fillRect(fx + 13, y + 8, 7, 2);
    // 第三行（2颗）
    ctx.fillRect(fx + 5, y + 11, 5, 4);
    ctx.fillRect(fx + 4, y + 12, 7, 2);
    ctx.fillRect(fx + 11, y + 11, 5, 4);
    ctx.fillRect(fx + 10, y + 12, 7, 2);

    // 高光
    ctx.fillStyle = grapeLight;
    ctx.fillRect(fx + 6, y + 4, 2, 2);
    ctx.fillRect(fx + 12, y + 4, 2, 2);
    ctx.fillRect(fx + 3, y + 8, 1, 1);
    ctx.fillRect(fx + 9, y + 8, 2, 2);
    ctx.fillRect(fx + 15, y + 8, 1, 1);

    // 葡萄梗
    ctx.fillStyle = '#78350f';
    ctx.fillRect(fx + 9, y + 1, 2, 3);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(fx + 9, y + 1, 1, 2);
  } else if (food.type === 'watermelon') {
    // 西瓜片 - 像素风
    // 绿皮（深色外沿）
    ctx.fillStyle = '#166534';
    ctx.fillRect(fx + 1, y + 13, 18, 3);
    ctx.fillRect(fx + 2, y + 12, 16, 1);
    // 绿皮
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(fx + 2, y + 13, 16, 2);
    // 白瓤
    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(fx + 2, y + 12, 16, 1);
    // 红瓤主体
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(fx + 2, y + 5, 16, 7);
    // 红瓤底部渐变深
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(fx + 2, y + 10, 16, 2);
    // 红瓤顶部弧形
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(fx + 4, y + 4, 12, 1);
    ctx.fillRect(fx + 6, y + 3, 8, 1);
    // 亮面
    ctx.fillStyle = '#fca5a5';
    ctx.fillRect(fx + 3, y + 5, 2, 3);
    ctx.fillRect(fx + 4, y + 6, 1, 2);
    // 西瓜籽（黑色像素点）
    ctx.fillStyle = '#000';
    ctx.fillRect(fx + 6, y + 8, 1, 2);
    ctx.fillRect(fx + 5, y + 9, 1, 1);
    ctx.fillRect(fx + 12, y + 7, 1, 2);
    ctx.fillRect(fx + 13, y + 8, 1, 1);
    ctx.fillRect(fx + 9, y + 10, 1, 2);
    ctx.fillRect(fx + 15, y + 9, 1, 1);
  }
  if (!['grape', 'strawberry', 'orange', 'watermelon'].includes(food.type)) {
    ctx.fillStyle = food.color;
    ctx.fillRect(fx + 4, y + 4, GRID - 8, GRID - 8);
  }
}
