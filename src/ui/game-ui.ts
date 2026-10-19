import type { PlayerSettings } from '../app/ports';
import type { GameSnapshot } from '../core/types';

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`游戏界面缺少元素：${selector}`);
  return element;
}

/** 使用固定 DOM 节点，不在切换遮罩时替换按钮或重复绑定事件。 */
export class GameUi {
  private readonly score: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly best: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly title: HTMLElement;
  private readonly overlayScore: HTMLElement;
  private readonly highlight: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly primary: HTMLButtonElement;
  private readonly sound: HTMLButtonElement;
  private readonly pause: HTMLButtonElement;
  private readonly popup: HTMLElement;
  private readonly canvasWrap: HTMLElement;
  private popupRemainingMs = 0;
  private bestScore = 0;

  constructor(root: HTMLElement) {
    this.score = requireElement(root, '#score');
    this.combo = requireElement(root, '#combo');
    this.best = requireElement(root, '#highScore');
    this.overlay = requireElement(root, '#overlay');
    this.title = requireElement(root, '#overlayTitle');
    this.overlayScore = requireElement(root, '#overlayScore');
    this.highlight = requireElement(root, '#overlayHighlight');
    this.hint = requireElement(root, '#overlayHint');
    this.primary = requireElement(root, '#primaryBtn');
    this.sound = requireElement(root, '#soundBtn');
    this.pause = requireElement(root, '#pauseBtn');
    this.popup = requireElement(root, '#comboDisplay');
    this.canvasWrap = requireElement(root, '#canvasWrap');
  }

  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void {
    this.bestScore = settings.highScore;
    this.score.textContent = String(snapshot.score);
    this.best.textContent = String(settings.highScore);
    this.combo.textContent = `x${snapshot.combo}`;
    this.combo.style.color =
      snapshot.combo >= 10 ? '#f97316' : snapshot.combo >= 5 ? '#ec4899' : '#a855f7';
    this.sound.textContent = settings.soundEnabled ? '🔊' : '🔇';
    const soundLabel = settings.soundEnabled ? '关闭音效' : '开启音效';
    this.sound.title = soundLabel;
    this.sound.setAttribute('aria-label', soundLabel);
    this.sound.setAttribute('aria-pressed', String(settings.soundEnabled));
    this.pause.disabled = snapshot.status !== 'playing' && snapshot.status !== 'paused';
    this.pause.textContent = snapshot.status === 'paused' ? '▶' : 'Ⅱ';
    const pauseLabel = snapshot.status === 'paused' ? '继续游戏' : '暂停游戏';
    this.pause.title = pauseLabel;
    this.pause.setAttribute('aria-label', pauseLabel);
  }

  showOverlay(snapshot: GameSnapshot, isNewRecord: boolean): void {
    const paused = snapshot.status === 'paused';
    const starting = snapshot.status === 'start';
    const won = snapshot.status === 'won';
    this.title.textContent = starting
      ? 'CANDY SNAKE'
      : paused
        ? 'PAUSED'
        : won
          ? 'CLEARED'
          : 'GAME OVER';
    this.overlayScore.textContent = starting
      ? `最高分: ${this.bestScore}`
      : `得分: ${snapshot.score}`;
    this.highlight.hidden = !isNewRecord;
    this.highlight.textContent = isNewRecord ? '✨ NEW RECORD! ✨' : '';
    this.hint.textContent = starting
      ? '吃水果累积连击\n每 10 连击有惊喜哦 ✨'
      : paused
        ? '按 P / Esc 或点击按钮继续'
        : won
          ? '你填满了所有可用格子\n按空格或点击按钮再玩一局'
          : '按空格或点击按钮再玩一局';
    this.primary.textContent = starting ? '开始游戏' : paused ? '继续游戏' : '再来一局';
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  showCombo(combo: number, milestone: boolean): void {
    this.popup.textContent = milestone ? `🌟 x${combo} COMBO! 🌟` : `x${combo} COMBO!`;
    this.popup.classList.remove('show');
    void this.popup.offsetWidth;
    this.popup.classList.add('show');
    this.popupRemainingMs = 800;
    if (milestone) {
      this.canvasWrap.classList.remove('shake');
      void this.canvasWrap.offsetWidth;
      this.canvasWrap.classList.add('shake');
    }
  }

  update(deltaMs: number, shaking: boolean): void {
    this.popupRemainingMs = Math.max(0, this.popupRemainingMs - deltaMs);
    if (this.popupRemainingMs === 0) this.popup.classList.remove('show');
    if (!shaking) this.canvasWrap.classList.remove('shake');
  }

  reset(): void {
    this.popupRemainingMs = 0;
    this.popup.textContent = '';
    this.popup.classList.remove('show');
    this.canvasWrap.classList.remove('shake');
  }
}
