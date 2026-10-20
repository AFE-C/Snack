# 2.0.0 试玩版交付与发行准备

## 交付物

- `dist/index.html`：内嵌脚本、样式和字体的离线网页。
- 同级 `candy-snake-windows/Candy Snake-win32-x64/`：Windows x64 桌面包，入口 `CandySnake.exe`。分享时压缩整个目录，保留 DLL、resources、locales 和许可文件。
- 同级 `candy-snake-media/`：真实游戏截图、响应式测量与 23 秒实机预告草案。
- 同级 `candy-snake.zip`：源码、文档和网页产物，不包含 node_modules、Git 数据、运行缓存或桌面运行时。

Windows 包当前已生成。此工作环境的目录 ACL 阻止 Electron 沙箱读取程序目录；自动审批拒绝了添加沙箱读取权限，要求用户明确授权。实际桌面启动验收仍待该授权，未关闭沙箱，也未修改目录 ACL。此状态未标为已通过发布验收。

## 桌面存档与测试

正式桌面存档位于 Electron `userData` 中的 `save.json`。文件只接受四个既有/新增存档键；临时文件写入后原子替换，损坏数据恢复，写盘不可用时保留当前会话。

`npm run desktop:smoke` 使用项目 `work/desktop-smoke` 作为独立测试资料目录，隐藏窗口启动生成的程序，验证页面就绪、沙箱、上下文隔离和文件持久化。它不读取或覆盖正式玩家存档。

桌面壳只载入本地发布 HTML，禁用新窗口和页面导航。IPC 仅提供白名单存档与全屏操作；渲染层没有 Node 或任意文件读写入口。原有浏览器进度不自动迁移到桌面文件。

## 制作预告与截图

1. 运行开发服务，打开 `/tests/browser/expedition.html`。
2. 通过配方与回放按钮检查正式模块，用固定时钟保存实机截图。
3. 点击“录制23秒实机预告”，导出 1280×720 / 30fps WebM；画面由公开指令驱动正式核心和绘图模块，配乐为原创 Web Audio 合成。本次同时交付 H.264 / AAC 的 MP4 转码版本。
4. 预告为开发中草案，录制三个起始配方，发布宣传前按最新试玩反馈重剪。正式包不含验收自动驾驶和录像代码。

截图用于说明实际体验。Steam 商店素材以游戏内画面为准，封面、介绍和宣传文案另行制作；不使用尚未实现的功能宣传。

## Steam 后续流程

由项目负责人办理 Steamworks 开发者注册、身份/税务资料和协议。外部试玩达标后再准备商店页与公开 Demo，核对当期审核与活动时间。Steam 的构建审核不替代项目自己的完整 QA。

- [Steam 入驻](https://partner.steamgames.com/doc/gettingstarted/onboarding)
- [审核流程](https://partner.steamgames.com/doc/store/review_process)
- [Demo 文档](https://partner.steamgames.com/doc/store/application/demos)
- [Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)

同一作品参加新品节的机会有限，选择代表最终体验的版本后再报名。Steam 成就、云存档、平台商店上传和正式商业发布不包含在当前试玩版中。
