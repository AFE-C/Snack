/** Player-facing copy belongs to content, never to the simulation or renderer. */
export const STAR_COPY = Object.freeze({
  canvasHint: '游戏棋盘，方向键或 WASD 移动。目标星核带四角标记，按住 Q 选择方向，松开施法。',
  paused: '已暂停',
  roomComplete: '本区完成',
  runComplete: '第一星区已完成',
  runLost: '本次航行结束',
  exitReady: '星门已打开',
  targetHint: '收集带角标的星核',
  home: '返回标题',
  continueHint: '下次从本区起点继续。',
  aimHint: '方向键选方向，松开 Q 施法',
  noUpgrades: '通过本区后选择升级。',
  collision: {
    wall: '撞上边界。',
    obstacle: '撞上陨石。',
    body: '碰到了自己的身体。',
    completed: '',
    'order-completed': '',
  },
});
