# 星蛇 3.0.0 架构与扩展

## 数据与所有权

```text
输入适配器 → 当前协调器 → GameApplication → GameEngine
                                 ↓             ↓
                            PresentationFrame  Snapshot + Events
                                 └──────→ 单一 GameView → HUD / Canvas / Audio
```

- 核心：整数网格移动、转向队列、碰撞、订单、计分、技能与只读快照，不读取 DOM、时间、存储。随机源可注入。
- 内容：地图、模式、技能参数、升级和中文文案。规则 ID 与显示主题分离。
- 应用：一个活动房间、一个 RAF，管理瞄准窗口、释放停顿、移动累积、结算延迟与存档边界。
- 平台：键盘、指针、手柄、Web Audio、浏览器存储和 Electron 桥。
- 表现：远征使用 StarGameView，糖果模式使用 CandyGameView。每局只构造对应实现，各自拥有 HUD 与效果。
- 外层：ShellUi 拥有设置弹窗和画面设置；导航清理输入手势并销毁旧局。

## 状态、技能与时钟

GameStatus 保持 start / playing / paused / gameover / won。远征增加 SkillAction 判别联合：idle，或 aiming（方向及 SkillPreview）。瞄准属于 playing 内部状态，不触发暂停遮罩。

```ts
engine.dispatch({ type: 'begin-aim' });
engine.dispatch({ type: 'aim', direction: 'up' });
const action = engine.getSnapshot().skillAction;
if (action?.kind === 'aiming') console.log(action.preview);
engine.dispatch({ type: 'commit-aim' });
```

进入瞄准清空旧转向；turn 在瞄准时改为调整瞄准方向。反向限制始终相对进入时的实际航向，不能通过先向上再向左绕过。暂停取消瞄准，不扣身体。

resolveSkillEffects 是无随机、无副作用的纯计算：预测断尾后的身体、破岩、随后牵引及下一格危险。提交使用同一计算结果，再应用缓时、计分、订单、生长与补货。预览不能调用补货或随机源。效果顺序固定为断尾、破岩、缓时、牵引。

原 use-skill / cut-tail 立即施法命令保留给已有规则调用与回放，不能在瞄准中绕过确认。实际远征输入使用按下、松开、取消；旧糖果 Q 仍立即断尾。

GameApplication 拥有 1200ms 瞄准倒计时和 60ms 释放停顿，数值在 action-timing.ts。倒计时使用非负原始帧间隔，移动使用至多 250ms 的帧间隔、每帧至多五步。时停与释放阶段不积累移动时间。恢复后走完整当前步长。

PresentationFrame 提供 worldDeltaMs、aimRemainingMs、releaseRemainingMs。普通世界效果在瞄准时冻结，瞄准环继续更新；暂停时所有相对时间冻结。音频聚焦状态独立于暂停，施放或取消立即清理蓄力音符。

## 输入、投影与绘制

输入设备仅发动作。一次瞄准绑定 keyboard / gamepad / pointer / button 来源，其他来源松开无效；超时后保持来源占用直到松开。手柄 X / RB 作为一个逻辑技能键，断开与切后台后要求松开再按。重开和路由清理触屏捕获。

投影参数：相对地面俯角 60°，水平旋转为 0°。世界 x 向右、y 向下，z 向上，单位为一格。BoardProjection 负责适配、投影和地面逆变换，所有绘制使用同一变换。逻辑网格与碰撞不使用屏幕坐标。

实体按地面 y、x 稳定排序；地面标记先画，世界粒子后画。陨石前景遮挡关键对象时使用 0.35 透明度，占格底边保留。星蛇球体和收集物按投影位置绘制，不把整张 Canvas 做 CSS 倾斜。

Canvas 实际像素随显示宽度和 DPR 调整，DPR 上限 2。标准粒子上限 192，精简模式 64。菜单、舞台、HUD 和旧糖果样式拆分，使用 CSS layer 和 data-theme 隔离；文字与 HUD 不参与世界投影。

## 内容扩展

添加地图时使用 LevelDefinition：尺寸、普通障碍、脆障碍、安全出生路径、订单与出口。prepareLevel 检查重叠、越界、连通性和出生方向。远征出生路径须容纳最多 12 节；为三种技能补充完整通关测试。

当前章节明确为六个区域，中间四区各两个变体。ROOMS 保存十张地图，getRoom 按房间槽位和种子选取；新增下一章时需扩展槽位选择和 RunState 版本，不能仅向数组末尾追加后假定自动出现。

添加模式时实现 ModeDefinition 的移动映射、计分和步长策略。新增主动技能优先组合已有 breakRange / slowDuration / magnetRange；新增效果则在核心定义处理、扩展事件并补充共享预览验证。渲染和输入不判定命中。

STAR_KINDS 将 grape / strawberry / orange / watermelon 映射成星星、月牙、晶体、星环；旧模式继续使用水果。技能与升级显示内容在 content/expedition.ts，通用提示在 star-copy.ts。

## 存档与检查

RunState 版本仍为 1；其字段和稳定 ID 不变。仅保存房间入口、失败结算、奖励和升级选择，恢复回到本区入口。parseRun 校验后逐项构造对象，快照只读冻结。最高分仍只由 classic 写入。

starSnakeVisualSettings 为独立版本 1 设置，包含 effects 和 shake；存储不可用时保留内存设置。默认尊重首次读取时的 prefers-reduced-motion。Electron 文件存档白名单包含新键，包名 candy-snake 与旧键保持兼容。

提交检查：npm run check、npm run build。桌面另执行 desktop:verify 与 desktop:smoke，静态包完整不能代替真实启动。完整审查入口见 REVIEW.md。
