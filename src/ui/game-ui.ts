import type { PlayerSettings } from '../app/ports';
import type { GameSnapshot } from '../core/types';
import { CAMPAIGN_LEVELS, FRUIT_ICONS, FRUIT_LABELS } from '../content/catalog';

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
  private orderKey = '';
  private readonly orderNodes = new Map<string, HTMLElement>();

  constructor(private readonly root: HTMLElement) {
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
    const campaign = snapshot.victoryCondition === 'orders-and-exit';
    this.bestScore = settings.highScore;
    this.score.textContent = String(snapshot.score);
    this.best.textContent = String(campaign ? snapshot.snake.length : settings.highScore);
    requireElement(this.root, '#recordLabel').textContent = campaign ? '长度' : 'BEST';
    requireElement(this.root, '#levelLabel').textContent = campaign
      ? `${CAMPAIGN_LEVELS.findIndex((level) => level.id === snapshot.level.id) + 1} / ${CAMPAIGN_LEVELS.length} · ${snapshot.level.name}`
      : '经典模式';
    requireElement(this.root, '#campaignHud').hidden = !campaign;
    requireElement(this.root, '#campaignTools').hidden = !campaign;
    for (const selector of ['#menuBtn', '#overlayMenuBtn']) {
      const menu = requireElement(this.root, selector);
      menu.dataset.action = campaign ? 'level-select' : 'home';
      menu.textContent = campaign ? '返回选关' : '返回首页';
    }
    const cut = requireElement<HTMLButtonElement>(this.root, '#cutTailBtn');
    cut.disabled = !snapshot.canCutTail;
    cut.textContent = snapshot.canCutTail
      ? 'Q 断尾 · 舍去 3 节'
      : snapshot.status === 'paused'
        ? 'Q 断尾 · 暂停中'
        : snapshot.status === 'gameover' || snapshot.status === 'won'
          ? 'Q 断尾 · 本局已结束'
          : `Q 断尾 · ${snapshot.snake.length} / 6 节`;
    if (campaign) this.updateOrder(snapshot);
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
    const campaign = snapshot.victoryCondition === 'orders-and-exit';
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
    if (campaign) {
      const final = snapshot.level.id === CAMPAIGN_LEVELS.at(-1)?.id;
      this.title.textContent = starting
        ? snapshot.level.name
        : paused
          ? '休息一下'
          : won
            ? final
              ? '三关完成！'
              : '订单送达！'
            : '再试一次';
      this.overlayScore.textContent = starting
        ? '150ms / 步 · 无时间限制'
        : `本关得分: ${snapshot.score}`;
      this.hint.textContent = starting
        ? '按任意顺序收集订单水果\n订单完成后，走进绿色出口\n长度达到 6 节可按 Q 断尾'
        : paused
          ? '进度已保留，继续完成这份订单'
          : won
            ? final
              ? '糖果草地、庭院、小巷全部完成\n可以回到选关，挑战更高分'
              : '下一站有新的路线等着你\n已完成的关卡可以随时重玩'
            : '避开墙壁和自己的身体\n重试会重置当前关的订单';
      this.primary.textContent = starting
        ? '开始本关'
        : paused
          ? '继续游戏'
          : won
            ? final
              ? '返回选关'
              : '下一关'
            : '重试本关';
      if (won && final) {
        const menu = requireElement(this.root, '#overlayMenuBtn');
        menu.dataset.action = 'home';
        menu.textContent = '返回首页';
      }
    }
    this.overlay.hidden = false;
  }

  private updateOrder(snapshot: GameSnapshot): void {
    const key = `${snapshot.level.id}:${JSON.stringify(snapshot.level.order)}`;
    if (key !== this.orderKey) {
      this.orderKey = key;
      this.orderNodes.clear();
      const list = requireElement(this.root, '#orderProgress');
      list.replaceChildren();
      for (const item of snapshot.orderProgress) {
        const chip = document.createElement('span');
        chip.className = 'order-chip';
        this.orderNodes.set(item.fruitType, chip);
        list.append(chip);
      }
    }
    for (const item of snapshot.orderProgress) {
      const chip = this.orderNodes.get(item.fruitType);
      if (!chip) continue;
      chip.textContent = `${FRUIT_ICONS[item.fruitType] ?? '🍬'} ${FRUIT_LABELS[item.fruitType] ?? item.fruitType} ${item.collected}/${item.required}`;
      chip.dataset.complete = String(item.collected >= item.required);
    }
    const hint = requireElement(this.root, '#exitHint');
    const text = snapshot.exitActive
      ? '出口已点亮！走进绿色出口 →'
      : '收齐订单，点亮出口 · 灰色出口可经过';
    if (hint.textContent !== text) hint.textContent = text;
    hint.dataset.active = String(snapshot.exitActive);
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
