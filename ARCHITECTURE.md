# 架构与玩法开发指南

## 数据流与职责

```text
键盘 / Pointer Events / 按钮
          │ InputAction
          ▼
   GameCoordinator ─── MenuUi / 进度读写
          │ 只拥有一个当前局
          ▼
   GameApplication ◀── FrameClock（一个 RAF）
          │ GameCommand / step()
          ▼
     GameEngine
   ┌──────┴───────┐
GameSnapshot   GameEvent[]
   └──────┬───────┘
          ▼
    HUD / Canvas / 特效 / 音效
```

| 模块                       | 职责                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `core`                     | 移动、碰撞、转向队列、补货、计分、订单、断尾、出口与地图校验；不依赖 DOM、Canvas、音频、时钟或存储 |
| `content`                  | 水果、地图、模式注册和显示名称                                                                     |
| `app/game-application.ts`  | 当前局的单一动画循环、暂停计时、事件分发与外设协调                                                 |
| `app/game-coordinator.ts`  | 首页、选关、下一关、当前局销毁与进度保存                                                           |
| `app/campaign-progress.ts` | 版本化进度解析、顺序解锁与完成记录，纯函数                                                         |
| `platform`                 | 浏览器输入、Web Audio、localStorage 适配                                                           |
| `render`                   | 根据快照绘图，根据事件生成效果；不判定玩法                                                         |
| `ui`                       | 菜单、订单、按钮和结算文案，使用文本节点更新                                                       |

`main.ts` 组装具体外设。输入适配器全程只有一个实例，转交动作给当前局；切换页面清除未完成触屏手势。旧局的 RAF、音频和特效会销毁。HMR 还会注销全局输入监听器。

## 核心 API 与状态

```ts
const engine = new GameEngine({ level, mode, random: Math.random });
engine.dispatch({ type: 'start' });
engine.dispatch({ type: 'turn', direction: 'up' });
const events = engine.step();
engine.dispatch({ type: 'cut-tail' });
const snapshot = engine.getSnapshot();
```

`dispatch` 接受 `start`、`restart`、`pause`、`resume`、`turn`、`cut-tail`。`step` 仅推进一个网格步，暂停和结束时不执行。随机源必须返回 `[0, 1)`，与视觉随机数独立。

`GameSnapshot` 及嵌套数据冻结为只读。`foods` 是数组，经典模式也通过 `foods[0]` 访问；没有水果时为 `[]`。`orderProgress` 含水果类型、目标数、已收集数；`exitActive` 是出口状态，`canCutTail` 已包括状态与长度条件。`victoryCondition` 告诉表现层当前目标类型。

状态为 `start → playing ⇄ paused → gameover / won`。重试新建当前关局面和 `sessionId`，保留已完成关卡。暂停、恢复、重开和结束清空转向队列；断尾保留队列且不增加 tick。

事件包括 `session-started`、`status-changed`、`food-eaten`、`combo-milestone`、`order-item-completed`、`tail-cut`、`exit-opened`、`level-completed`、`game-ended`。`order-item-completed` 携带 `fruitType`，仅在该类计数首次达到要求时触发；继续吃已收齐类型不会重复通知，重试重新计算。`tail-cut` 带移除的段坐标，供表现层绘图；闯关 `game-ended.reason` 为 `order-completed`。只有进入激活出口才发 `level-completed`，应用据此保存进度。

`core/order.ts` 的 `getRemainingOrder` 从只读进度派生 `{ fruitType, remaining }` 列表，过滤已完成项，HUD 与 Canvas 共同使用。目标水果绘制固定角标和底衬，所有同类目标同时标记；不添加导航或优先路线，补货、断尾和重试后的快照直接决定标记。`GameSnapshot` 与存档格式不变。

闯关 HUD 为需求预留 60px 两行空间，为反馈预留 24px；收齐项隐藏或切换出口提示时保持高度。短反馈使用 900ms 相对计时，暂停时传入 0，重开和销毁清除。收齐反馈优先于普通加分，出口反馈优先于单类收齐。闯关棋盘不画加分/连击飘字、不播放连击震动，只保留少量局部粒子；经典模式不变。

每步依次消费转向、映射目标格、检查墙/障碍/身体、移动、进食计分、推进订单、补货、判断胜利。未进食时先排除本步移走的尾格。补货枚举有限空格，不使用“随机直到找到空格”的循环。

## 添加地图

地图与模式分开配置。下面是可以放进 `content/catalog.ts` 的闯关示例：

```ts
const PICNIC_LEVEL: LevelDefinition = {
  id: 'picnic',
  name: '野餐角落',
  cols: 10,
  rows: 8,
  obstacles: [
    { x: 6, y: 3 },
    { x: 6, y: 4 },
  ],
  initialSnake: [
    { x: 3, y: 6 },
    { x: 2, y: 6 },
    { x: 1, y: 6 },
  ],
  initialDirection: 'right',
  order: [{ fruitType: 'strawberry', required: 3 }],
  exit: { x: 8, y: 1 },
};
```

将地图追加到 `CAMPAIGN_LEVELS`，就会出现在选关菜单，并自动进入 `LEVELS` 注册表。添加专属说明可扩展 `ui/menu-ui.ts` 的 `LEVEL_DESCRIPTIONS`。更新最终结算文案和通关测试。已完成列表依赖关卡顺序，发布后优先在末尾追加；重排、改 id 时应升级存档版本并提供迁移。

出生蛇身从头到尾相邻排列，不能重叠、越界或朝向颈部。障碍不能重复或覆盖出生点。订单与出口必须一起提供：订单类型不重复、数量为正整数；出口必须为空格。闯关地图还检查所有可走格从出生点静态可达，订单水果必须存在且权重大于零。

静态连通不代表实时操作必胜；设计地图后，运行固定种子完整通关用例，验证路线和技能。当前三关用例在 `tests/campaign-engine.test.ts`，第三关实际执行断尾。

Canvas 自动按 `cols × rows × 20` 设置逻辑尺寸，再按屏幕宽度缩放；碰撞、食物与绘图均读取同一份地图。经典地图可省略订单与出口，配合 `fill-board` 规则。

## 注册模式

`ModeDefinition` 集中描述能力和策略：

| 字段                  | 作用                                          |
| --------------------- | --------------------------------------------- |
| `foodCount`           | 同时存在的最大水果数                          |
| `victoryCondition`    | `fill-board` 或 `orders-and-exit`             |
| `tailCut`             | `null` 禁用，或 `{ segments, minimumLength }` |
| `fruits`              | 类型、颜色、分数与权重                        |
| `resolveNextPosition` | 下一格和地图 → 实际目标格，可实现穿墙         |
| `calculatePoints`     | 已吃水果和新连击 → 非负安全整数分数           |
| `getStepMs`           | 当前上下文 → 正数毫秒，可动态调整             |

例如注册穿墙练习模式：

```ts
export const PRACTICE_MODE: ModeDefinition = {
  ...CLASSIC_MODE,
  id: 'practice',
  name: '穿墙练习',
  getStepMs: () => 180,
  resolveNextPosition: (next, level) => ({
    x: (next.x + level.cols) % level.cols,
    y: (next.y + level.rows) % level.rows,
  }),
};
// 在 MODES 中增加 practice: PRACTICE_MODE。
```

注册表负责查询；要给玩家入口，在首页增加 `data-action`，于 `InputAction`、输入映射和协调器增加对应导航动作，并调用同一 `openSession(level, mode)` 流程。绘图和转向模块无需理解穿墙或计分策略。规则函数保持确定性，不操作存档、DOM 或真实时钟。

闯关补货先保留现有水果、补齐空位，再检查是否含未完成目标；如不含则替换一颗非目标。出口和蛇身、障碍都不参与食物位置抽样。订单完成后不再采样水果。无空位只减少水果数，闯关不会触发经典的填满通关。

`cut-tail` 只在 playing 且长度至少为 `segments + minimumLength` 时执行，立即移除末尾并补货。当前闯关配置为 3 + 3，UI 对玩家明确展示此规则；如果设计新的技能数值，也应同步对应文案。

## 生命周期与存档

- `GameApplication.mount()` 幂等；重开仅重置状态，不创建新循环。每帧最多计入 250ms、补算最多五步。暂停/恢复重置时钟，特效按经过时间更新。
- 结算等待 800ms，使用局次绑定的相对时间，不使用旧局 `setTimeout`。导航销毁局、取消 RAF，并用会话标识拒绝旧局回调。
- 转向队列最多两条，基于队尾判定重复和反向。键盘 repeat 被忽略。触屏支持单指/触控笔、取消与 30 CSS 像素阈值，小屏另有方向按钮。
- 音频在用户操作后解锁；暂停、静音、销毁停止并断开音符。设备不可用不影响规则。
- `app/audio-feedback.ts` 在闯关每批事件中只选一个主提示音，优先级为出口开启、单类收齐、连击、普通进食；技能与生命周期音效正常分发。所有事件仍完整发送给视图，经典音效不筛选。
- `StorageAdapter` 提供设置读写与 `loadCampaignProgress` / `saveCampaignProgress`。浏览器实现捕获访问和写入异常；纯进度函数校验版本、id、连续顺序和重复记录。
- 正式键为 `candySnakeHighScore`、`candySnakeSoundEnabled`、`candySnakeCampaignProgress`。进度 JSON 为 `{ "version": 1, "completedLevelIds": ["garden"] }`。
- 协调器在内存保留进度，即使写入失败当前会话也能解锁；不保证禁用存储后的刷新恢复。经典最高分只在 `modeId === 'classic'` 结算时更新。

接手柄时转换为 `InputAction`；桌面文件存档实现 `StorageAdapter`；成就订阅 `GameEvent`。让平台能力留在适配层。

## 规范与验证

TypeScript 启用 strict、数组索引检查、精确可选属性、未使用符号及隐式返回检查。使用判别联合描述事件与动作，Prettier/EditorConfig/.gitattributes 统一格式和 LF；依赖版本与锁文件固定。

提交前执行 `npm run check` 和 `npm run build`。此前 126 项回归用例保留，按新界面更新剩余需求展示断言，另增 20 项订单派生、收齐事件、目标标记、音效优先级与反馈生命周期测试，共 146 项。`tests/helpers/campaign-run.ts` 通过公开快照与指令规划路线，不修改核心内部状态。

开发服务下的 `/tests/browser/index.html` 复用正式 DOM、渲染、应用和输入，用种子 42 与手动 `FrameClock` 检查浏览器完整三关流程。QA 存档加前缀，避免污染正式进度；生产入口不导入测试页。正式页面另外验证真实时钟、键盘、暂停、音效、触屏按钮和窄屏。

发布单 HTML 使用 `vite-plugin-singlefile` 内嵌资源。浏览器工具不能访问 `file://`，因此工具验证使用 HTTP 发布预览并检查内嵌资源；人工双击验收步骤见 `VALIDATION.md`。
