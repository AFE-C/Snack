# 星蛇 3.0.0 交付

## 网页和源码

- dist/index.html：单文件可玩产物。
- ../star-snake.html：同一发布 HTML 的便捷副本。
- ../star-snake.zip：源码、锁文件、中文文档与 dist/index.html，不包含 node_modules、缓存或 Git 数据。
- ../star-snake-media：游玩、瞄准、手机布局截图与结构化验收记录。
- REVIEW.md：供 DeepSeek 审查的入口和不变量。

本地预览：npm run preview -- --port 4173。

## Windows

执行 npm run desktop:package，输出 ../star-snake-windows/Star Snake-win32-x64/StarSnake.exe。先完整解压整个目录，再启动 exe，不能仅复制单个程序。文件存档仍使用原包名对应的用户数据目录，兼容旧键。

desktop:verify 核对 ASAR 和运行文件；desktop:smoke 才会启动程序并测试文件存档。当前环境在启动前遇到沙箱目录权限错误，Windows 实机运行未通过，详见 VALIDATION.md。不得通过关闭沙箱绕过。

打包保留 Chromium、Electron 和字体许可。星蛇图标来自仓库中的原创 SVG，首页与游戏图形使用本地 SVG / Canvas；没有运行时远程资源。

## 提交与分发

第一节点 8fbcb67，第二节点 11addbb，第三节点见当前 git log。保留原 main 历史，可分别查看和回退。归档 SHA256 与最终源码提交写在 ../star-snake-release.json。

构建检查通过后再分发。Steam 上架、商店素材、账户、成就和外部试玩不属于本轮自动发布。
