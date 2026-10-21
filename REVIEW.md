# 3.0.0 代码审查说明

面向 DeepSeek 或人工审查者。请先运行命令，再沿数据流检查规则与生命周期，报告能够定位和复现的问题。不要仅因文件长、变量风格偏好或缺少未来功能而判为缺陷。

## 基线与命令

- 基线：`8797c4b`，Candy Snake 2.0.0，共 231 项测试。
- 第一节点：`8fbcb67`，时停与投影原型。
- 第二节点：`11addbb`，完整星空模式、独立视图、文案与设置。
- 第三节点：验收、图标、发布验证和本文档。用 `git log -3 --oneline` 取得最终 SHA。
- 执行 `npm ci`、`npm run check`、`npm run build`。当前共 268 项测试；原 231 项行为覆盖保留，远征结算的文字断言随“配方→技能”更新。

## 入口与依赖

`main.ts → InputController / GamepadInput → 当前协调器 → GameApplication → GameEngine → GameEvent / GameSnapshot → 对应 GameView → Canvas 与 HUD`。

`core` 只依赖自身，ESLint 禁止导入应用、表现、内容或平台模块，并禁止真实时钟、DOM 与存储全局。随机源注入。`content` 定义关卡、技能、文案与显示映射；`app` 定义端口与单局时序；`platform` 访问外部设备。

远征和糖果模式在 `BrowserGameView` 构造时选择一个视图实现。`StarGameView` 不调用旧 `GameUi`，因此不会先显示旧订单、再覆盖成星空订单。UI 不判定碰撞、技能命中或订单完成。

## 优先检查的不变量

1. `begin-aim` 只在 playing 且身体足够时有效。进入时清空转向队列；核心 `step()` 在瞄准时无操作。瞄准方向不得与进入时的航向相反，连续改变瞄准也不能绕过限制。
2. `resolveSkillEffects` 是纯函数，同时用于预览和实际施法。破岩先于牵引；残余裂岩和完整陨石均阻挡牵引。下一格危险判断使用断尾后的身体和待生长状态。
3. `GameEngine` 不计真实时间。应用持有 1200ms 瞄准窗口、60ms 释放停顿和移动累积。单独调用核心 step 不包含释放停顿，这是分层约定。
4. 应用用未截断的相对时间判断瞄准超时，用截断后的时间推进移动；时停和释放期间不积累移动时间。暂停清理瞄准，恢复重新计时。
5. 每次瞄准绑定输入来源。其他来源松开不能确认。超时后来源仍被占用，直到松开；键盘 repeat、双技能手柄键和触控 click 均不能重复施放。
6. 切换房间销毁当前局，旧结算由 token / settled 拒绝重复处理。所有路由最终只拥有一个 RAF。手柄轮询不创建绘制循环。
7. 分数、订单、关间奖励和存档仍由规则和远征状态机产生；主题只映射显示名称与图形。画面设置不进入 RunState。

## 投影约定

世界 x 向右、y 向下，z 表示离地高度，单位为一格。相机俯角 60°，无水平旋转：`screenX = originX + x × scale`，`screenY = originY + (y × sin60° - z × cos60°) × scale`。

`BoardProjection` 同时提供地面逆变换和包含高度余量的适配。碰撞与射线只看世界网格。实体按地面 y、x 稳定排序，高度不改变排序键。前景陨石挡住蛇头或目标时透明度为 0.35，占格底边仍可见。文字、倒计时和 HUD 使用屏幕坐标。

## 存档与平台

- `candySnakeHighScore`、`candySnakeSoundEnabled`、`candySnakeCampaignProgress`、`candySnakeExpedition` 不变；远征版本仍为 1，因为其字段、ID、地图坐标和入口恢复语义未改变。
- `parseRun` 逐项验证并构造 RunState，没有 `as unknown as RunState` 整体转换。瞄准不保存，恢复从本区入口开始。
- 新键 `starSnakeVisualSettings` 在浏览器和桌面白名单均可用，异常数据回默认值。写入失败不会中断游戏。
- Electron 继续启用 sandbox、contextIsolation，关闭 nodeIntegration。桌面包静态验证与真实启动是两项不同检查。

## 已知验证边界

Windows 包在当前环境启动前遇到 AppContainer 目录读取权限错误，运行验收未通过。实体手柄、真实手机和至少十名新玩家的试玩尚未完成。自动化手柄输入和响应式尺寸检查不能代替这些实机结论。

GitHub CI 配置使用官方 [checkout](https://github.com/actions/checkout) 和 [setup-node](https://github.com/actions/setup-node)；远端运行结果以 Actions 页面为准。
