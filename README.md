# Candy Snake · 糖果贪吃蛇

保留原版糖果像素画风和操作方式，将玩法、关卡、渲染与浏览器外设分开的 TypeScript 小游戏。

## 开始游玩

直接双击 **dist/index.html**。发布文件已包含脚本、样式和字体，可以离线运行。

方向键 / WASD / 触屏滑动控制方向；空格或 Enter 开始、重开，暂停时可继续；P / Esc 或右上角暂停按钮暂停、继续。切到其他标签页会自动暂停。

## 开发与检查

需要 Node.js 24.15 以上的 24.x 版本，或 Node.js 26 及更新版本。本项目没有游戏框架或运行时 JavaScript 依赖。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址。源码通过开发服务运行；供分享的版本由构建生成。

| 命令                   | 用途                               |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | 启动 Vite 开发服务与热更新         |
| `npm run typecheck`    | TypeScript 严格类型检查            |
| `npm run lint`         | ESLint 检查                        |
| `npm run format`       | 使用 Prettier 格式化源码和文档     |
| `npm run format:check` | 检查格式，不修改文件               |
| `npm test`             | 执行所有回归测试                   |
| `npm run test:watch`   | 开发时持续执行相关测试             |
| `npm run check`        | 依次执行类型、静态、格式检查和测试 |
| `npm run build`        | 类型检查后构建单文件 HTML          |
| `npm run preview`      | 通过本地服务预览构建版本           |

分享时只需要 `dist/index.html`，无需分享 `node_modules`。开发时修改 `src`，重新构建更新发布文件。

## 当前规则

- 默认棋盘 20×20，出生蛇身 3 格，每步 150ms，撞墙、身体或障碍结束。
- 一次最多缓存两次转向，每步消费一次，重复与反向输入忽略。
- 未进食时可进入本步正在移走的尾格；填满所有非障碍格后通关。
- 葡萄 / 草莓 / 橙子 / 西瓜基础分分别为 1 / 2 / 3 / 5，生成权重分别为 50 / 30 / 15 / 5。
- 第 2 个果实起使用 1.5 倍计分，第 5 个起使用 2 倍，单次得分向下取整；每 10 连击有彩虹特效。连击本局持续，不设超时衰减。
- 最高分和音效开关保存在本机。存储被禁用或损坏时仍可游玩。最高分沿用 `candySnakeHighScore` 键。

本地服务、不同网站和文件页面的存档受浏览器存储隔离影响，本项目不执行跨来源存档迁移。

## 从哪里修改玩法

| 目的                         | 入口                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| 新增地图、选择默认地图       | `src/content/catalog.ts` 的 `LEVELS` 与 `DEFAULT_SELECTION` |
| 新增模式、调整移动/分数/速度 | 同文件中的 `MODES` 和 `ModeDefinition`                      |
| 修改移动、碰撞或核心状态     | `src/core/engine.ts`                                        |
| 修改蛇、背景、障碍绘制       | `src/render/canvas-renderer.ts`                             |
| 修改水果外观、粒子           | `src/render/draw-food.ts`、`src/render/effects.ts`          |
| 修改界面文案与布局           | `src/ui/game-ui.ts`、`index.html`、`src/styles.css`         |
| 接入新的控制器、存档或音效   | `src/app/ports.ts` 与 `src/platform`                        |

完整的数据流、接口说明和可复制的关卡/模式示例见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 与原项目的主要差异

源码改为模块化 TypeScript；游戏核心不再访问 DOM 或浏览器 API。修复了尾格碰撞、满棋盘无限刷食物、旧局结束动画干扰重开、暂停按钮重开游戏，以及损坏存档导致 NaN 的问题。音效设置持久化，小屏棋盘自动缩放，字体随发布文件打包。

原交接文档建议将反向判断直接改成与 `nextDirection` 比较，这个修改单独使用会引入反向风险。当前实现使用有上限、逐步消费的转向队列，相关输入顺序有回归测试。

## 后续桌面版与 Steam

可以继续复用当前核心和 Canvas 渲染，用 Electron 加入桌面外壳。`InputAction` 可接手柄；`StorageAdapter` 可接文件存档；游戏事件可用于成就。桌面适配应放在平台层，避免将 Steam API 写进移动或碰撞逻辑。

当前交付是网页开发工程与离线 HTML。桌面打包、商店资源和 Steam 发布安排在后续版本，届时另行验证桌面体验、素材授权与 Steam 审核要求。

## 字体与原有素材

蛇、水果、云朵和粒子沿用原项目的代码绘图。Press Start 2P 字体通过 Fontsource 提供，采用 SIL Open Font License 1.1；原始版权与完整许可保存在 [licenses/Press-Start-2P-OFL.txt](licenses/Press-Start-2P-OFL.txt)，也嵌入单文件产物中。
