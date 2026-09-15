# Pixel Snake - 像素贪吃蛇

一个用 Vibe Coding 方式做的像素风格贪吃蛇小游戏，单文件 HTML 实现，双击即玩。

## 功能特性

- 🎮 经典贪吃蛇玩法
- 🎨 Game Boy 复古像素风格
- ⌨️ 键盘控制（方向键 / WASD）
- 📱 触屏滑动支持（手机也能玩）
- 🏆 最高分本地存储
- ⏸️ 暂停功能（P 键）
- 🚀 难度递增（越吃越快）

## 操作说明

### 键盘

| 按键 | 功能 |
|------|------|
| ↑ / W | 向上 |
| ↓ / S | 向下 |
| ← / A | 向左 |
| → / D | 向右 |
| 空格 / Enter | 开始 / 重新开始 |
| P / Esc | 暂停 / 继续 |

### 触屏

- 滑动手指控制方向
- 点击屏幕开始 / 重开

## 技术栈

- HTML5 Canvas
- Vanilla JavaScript (ES6+)
- Press Start 2P 像素字体（Google Fonts）
- localStorage 本地存储

## 如何运行

直接双击 `index.html` 用浏览器打开即可。

或者用本地服务器：

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

然后访问 `http://localhost:8000`

## 项目结构

```
03-pixel-snake-game/
├── index.html    # 游戏主文件（HTML + CSS + JS 合一）
└── README.md     # 说明文档
```
