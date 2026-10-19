# 架构与玩法开发指南

## 模块与数据流

```text
浏览器按键 / Pointer Events / 按钮
                │
           InputAction
                ▼
        GameApplication ◀── FrameClock（单一 RAF）
                │ GameCommand / step()
                ▼
           GameEngine
        ┌───────┴────────┐
  GameSnapshot       GameEvent[]
        │                │
        └───────┬────────┘
                ▼
       界面 / Canvas / 特效 / 音效 / 存档
```

| 模块       | 职责与边界                                                                             |
| ---------- | -------------------------------------------------------------------------------------- |
| `core`     | 网格移动、碰撞、方向队列、加权食物、状态与地图校验；不访问 DOM、音频、文件、时钟或存储 |
| `content`  | 关卡和模式注册、果实配置、默认组合；不管理渲染或监听事件                               |
| `app`      | 调度时钟和核心，通过 ports 协调外设；不实现 Canvas 绘制                                |
| `platform` | 浏览器输入、Web Audio 和 localStorage 的适配                                           |
| `render`   | 读取状态和事件绘图，按毫秒更新特效；不改变核心状态                                     |
| `ui`       | 固定 DOM 节点上的状态展示；按钮动作通过统一输入入口传回应用                            |

`main.ts` 是组装入口，负责选择地图/模式和具体外设。Vite 热更新会注销旧监听器和动画循环。

## 游戏核心接口

```ts
const engine = new GameEngine({ level, mode, random: Math.random });
const startEvents = engine.dispatch({ type: 'start' });
engine.dispatch({ type: 'turn', direction: 'up' });
const stepEvents = engine.step();
const snapshot = engine.getSnapshot();
```

- `dispatch` 接收 `start`、`restart`、`pause`、`resume`、`turn`，返回本次指令产生的事件。
- `step` 只推进一个逻辑步，不接收真实时间。暂停或结束时不推进。
- `getSnapshot` 返回冻结的只读状态及嵌套数据，包含蛇、食物、分数、连击、步数、当前步长和局次标识。
- `random` 必须返回 `[0, 1)` 范围的数值。核心不与视觉随机数混用，便于测试和以后实现种子关卡。

状态转换为 `start → playing ⇄ paused`，结束进入 `gameover` 或 `won`，`restart` 开始新局。暂停、恢复、重开和结束会清空输入队列。

事件包括 `session-started`、`status-changed`、`food-eaten`、`combo-milestone` 和 `game-ended`。事件中的食物数据属于已吃掉的果实；渲染读取快照中的新食物。核心不会播放音效或弹出界面。

每步依次执行转向、目标格映射、碰撞、移动、进食计分与食物生成。非进食移动先排除将移走的尾格，再判断身体碰撞。食物枚举蛇与障碍之外的空格；无空格时通关。

## 添加一张地图

在 `src/content/catalog.ts` 定义地图，并加入同文件的 `LEVELS`。下面是示例，当前发布版本只注册经典地图。

```ts
const COURTYARD_LEVEL: LevelDefinition = {
  id: 'courtyard',
  name: '糖果庭院',
  cols: 12,
  rows: 10,
  obstacles: [
    { x: 8, y: 3 },
    { x: 8, y: 4 },
    { x: 8, y: 5 },
  ],
  initialSnake: [
    { x: 4, y: 5 },
    { x: 3, y: 5 },
    { x: 2, y: 5 },
  ],
  initialDirection: 'right',
};

export const LEVELS: Readonly<Record<string, LevelDefinition>> = {
  classic: CLASSIC_LEVEL,
  courtyard: COURTYARD_LEVEL,
};

export const DEFAULT_SELECTION = Object.freeze({
  levelId: 'courtyard',
  modeId: 'classic',
});
```

出生蛇身从头到尾排列，必须相邻、不重叠、不越界，初始方向不能朝向颈部。障碍不能重复、越界或覆盖出生蛇身。检查在核心启动时执行；配置无效会给出明确错误，开发时先运行测试定位。

地图尺寸以格为单位。Canvas 根据地图宽高和每格 20 个逻辑像素设置尺寸，显示尺寸再适配屏幕，不需要同步修改 CSS 或碰撞常量。

当前不会检查地图是否存在必胜路线。添加关卡时应验证出生区域可移动、目标可达及关卡难度；障碍数据本身不等同于关卡设计完成。

## 添加一种模式

`ModeDefinition` 提供三个规则入口：

| 入口                  | 输入 / 输出                       | 用途           |
| --------------------- | --------------------------------- | -------------- |
| `resolveNextPosition` | 计算出的下一格、地图 → 实际目标格 | 穿墙等移动拓扑 |
| `calculatePoints`     | 已吃果实、新连击数 → 单次整数得分 | 倍率、分数挑战 |
| `getStepMs`           | 当前规则上下文 → 正数毫秒         | 恒速或动态加速 |

例如创建一个较慢的穿墙练习模式：

```ts
const PRACTICE_MODE: ModeDefinition = {
  ...CLASSIC_MODE,
  id: 'practice',
  name: '穿墙练习',
  getStepMs: () => 180,
  resolveNextPosition: (next, level) => ({
    x: (next.x + level.cols) % level.cols,
    y: (next.y + level.rows) % level.rows,
  }),
};

export const MODES: Readonly<Record<string, ModeDefinition>> = {
  classic: CLASSIC_MODE,
  practice: PRACTICE_MODE,
};
```

将 `DEFAULT_SELECTION.modeId` 改为 `practice` 即可验证。当前没有模式选择菜单，注册记录供启动配置使用。以后添加菜单时，通过同一组装流程创建新引擎并销毁旧应用即可。

规则函数应保持确定性，不访问 DOM、存档或时钟，不修改输入对象。分数必须是非负安全整数，步长必须是正的有限数值。未来需要限时、道具或关卡推进时，应增加明确的核心状态和事件，并添加测试；不要在渲染函数中夹带玩法判断。

新增果实时可复用 `FruitDefinition`。注册权重和分数后，在 `draw-food.ts` 增加绘制分支；未定义专用绘制的果实会显示配置颜色的基础方块。

## 生命周期、输入和外设

- `GameApplication.mount()` 幂等，一次应用生命周期只维护一个 RAF。重开清除当前局的计时、遮罩等待和效果，不再创建额外循环。
- 帧差最多计入 250ms，每帧最多补算五步。暂停和恢复重置累加器，当前步骤使用更新前的步长扣除时间，支持模式动态调整速度。
- 结束遮罩使用当前局的相对时间累计，等候 800ms。特效中的蛇身碎裂也使用相对时间，没有旧局 `setTimeout` 回调残留。
- 输入最多缓存两个有效转向，逐步消费；以队尾方向判断重复和反向，队列已满则忽略新输入。
- Pointer Events 只接收当前有效的一根手指或触控笔，滑动阈值为 30 CSS 像素。取消手势与切后台会清除手势状态。
- `AudioPort` 保留原有合成旋律。音频上下文在用户动作后创建；暂停、静音和销毁会停止并断开活动音符，避免稍后重放。
- `StorageAdapter` 对外只提供读取设置、保存最高分和保存音效开关。浏览器实现会处理访问异常与错误数据，最高分沿用旧键。

添加手柄或桌面快捷键时，将输入转换为 `InputAction`。添加桌面文件存档时，提供新的 `StorageAdapter` 并在入口替换。Steam 成就可以消费 `GameEvent`，不需要污染核心逻辑。

## 开发规范和验证

TypeScript 启用 strict、数组索引检查、精确可选属性、未使用符号和隐式返回检查。优先导出明确的类型边界，变量使用完整含义的名称，事件和状态使用判别联合。注释说明规则原因和边界，常规操作由代码自身表达。

ESLint 检查 TypeScript 规范并禁止非空断言，Prettier 与 EditorConfig 统一两空格、单引号、分号和 LF 换行。所有依赖保存精确版本和 npm 锁文件，先用 `npm ci` 安装。

修改规则应为预期行为补充测试，尤其是转向、尾格、障碍、满棋盘及规则替换。修改表现层应确认暂停恢复、快速重开和监听器注销。提交前执行：

```bash
npm run check
npm run build
```

最后分别检查开发服务和 `dist/index.html`，确认键盘、触屏、小屏布局、音效和切后台暂停。`dist` 为生成目录，修改源码后重新构建，不直接编辑产物。
