import { getRoom, SKILLS, UPGRADES } from '../content/expedition';
import { STAR_COPY } from '../content/star-copy';
import { starKind } from '../content/star-theme';
import { getRemainingOrder } from '../core/order';
import type { RunState } from '../app/expedition-run';
import type { PlayerSettings } from '../app/ports';
import type { UpgradeId } from '../core/expedition';
import type { GameEvent, GameSnapshot, EndReason } from '../core/types';
import { element } from './dom';
import { AIM_DURATION_MS } from '../app/action-timing';

export class ExpeditionUi {
  private feedbackRemaining = 0;
  private feedbackPriority = 0;
  private lastEnd: EndReason | null = null;
  private orderKey = '';
  private readonly orderNodes = new Map<string, HTMLElement>();
  private bodyKey = '';
  constructor(private readonly root: HTMLElement) {}

  show(screen: string): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-screen]'))
      node.hidden = node.id !== screen;
    this.root.dataset.screen = screen;
    this.root.dataset.theme = 'star';
    element(this.root, 'gameCanvas').setAttribute('aria-label', STAR_COPY.canvasHint);
    this.root.dataset.mode = 'expedition';
    element(this.root, 'overlay').hidden = true;
    element(this.root, 'expeditionHud').hidden = screen !== 'playScreen';
    const window = this.root.ownerDocument.defaultView;
    if (window && window.scrollY !== 0) window.scrollTo(0, 0);
  }

  showRecipes(): void {
    this.show('recipeScreen');
    const list = element(this.root, 'recipeList');
    list.replaceChildren();
    for (const skill of SKILLS) {
      const button = this.card(skill.icon, skill.name, skill.description, skill.detail);
      button.dataset.action = 'select-skill';
      button.dataset.skillId = skill.id;
      button.classList.add('recipe-' + skill.id);
      list.append(button);
    }
  }

  showRewards(run: RunState, choices: readonly UpgradeId[]): void {
    this.show('rewardScreen');
    element(this.root, 'rewardSummary').textContent =
      getRoom(run.seed, run.roomIndex).level.name + '完成，选一个升级带到下一区。';
    const list = element(this.root, 'upgradeList');
    list.replaceChildren();
    for (const id of choices) {
      const upgrade = UPGRADES.find((item) => item.id === id);
      if (!upgrade) throw new Error('Unknown upgrade: ' + id);
      const button = this.card(upgrade.icon, upgrade.name, upgrade.description, '');
      button.dataset.action = 'choose-upgrade';
      button.dataset.upgradeId = id;
      list.append(button);
    }
  }

  updateHud(
    snapshot: GameSnapshot,
    run: RunState,
    settings: PlayerSettings = { highScore: 0, soundEnabled: true },
  ): void {
    this.root.dataset.mode = 'expedition';
    this.root.dataset.theme = 'star';
    element(this.root, 'expeditionHud').hidden = false;
    element(this.root, 'campaignHud').hidden = false;
    element(this.root, 'campaignTools').hidden = false;
    element(this.root, 'levelLabel').textContent =
      '第一星区  ' + (run.roomIndex + 1) + ' / 6  ' + snapshot.level.name;
    element(this.root, 'runHearts').textContent =
      '♥'.repeat(run.hearts) + '♡'.repeat(3 - run.hearts);
    element(this.root, 'runHearts').setAttribute('aria-label', '剩余 ' + run.hearts + ' 颗心');
    element(this.root, 'highScore').textContent = String(snapshot.snake.length);
    element(this.root, 'recordLabel').textContent = '身体';
    element(this.root, 'scoreLabel').textContent = '得分';
    element(this.root, 'comboLabel').textContent = '连击';
    element(this.root, 'combo').textContent = '×' + snapshot.combo;
    element(this.root, 'score').textContent = String(
      run.score + (snapshot.status === 'won' ? 0 : snapshot.score),
    );
    const skill = SKILLS.find((item) => item.id === run.skillId);
    if (!skill || !snapshot.skill) throw new Error('Star HUD requires a valid skill');
    const status = snapshot.skill,
      aiming = snapshot.skillAction?.kind === 'aiming';
    element(this.root, 'skillPower').textContent = skill.name + '  ' + status.power + ' 级';
    const button = element<HTMLButtonElement>(this.root, 'cutTailBtn');
    button.disabled = !status.available;
    button.textContent = aiming
      ? '松开施法'
      : status.available
        ? '按住 Q 瞄准 · 消耗 ' + status.cost + ' 节'
        : snapshot.status === 'playing'
          ? '还需 ' + Math.max(0, status.cost + 3 - snapshot.snake.length) + ' 节身体'
          : snapshot.status === 'paused'
            ? '已暂停'
            : '按住 Q 瞄准';
    element(this.root, 'skillNote').textContent = snapshot.slowSteps
      ? '缓时剩余 ' + snapshot.slowSteps + ' 步'
      : '9 节二级，12 节三级。至少保留 3 节。';
    element(this.root, 'runLesson').textContent = getRoom(run.seed, run.roomIndex).lesson;
    element(this.root, 'runUpgrades').textContent =
      run.upgrades.map((id) => UPGRADES.find((item) => item.id === id)?.name ?? id).join('、') ||
      STAR_COPY.noUpgrades;
    const bodyKey = snapshot.snake.length + ':' + aiming + ':' + status.cost;
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      const meter = element(this.root, 'bodySegments');
      meter.replaceChildren();
      for (let i = 0; i < 12; i += 1) {
        const segment = document.createElement('span');
        segment.className =
          i < snapshot.snake.length
            ? aiming && i >= snapshot.snake.length - status.cost
              ? 'filled is-cost'
              : 'filled'
            : '';
        meter.append(segment);
      }
      meter.setAttribute('aria-label', '身体 ' + snapshot.snake.length + ' / 12 节');
    }
    for (const id of ['menuBtn', 'overlayMenuBtn']) {
      const menu = element(this.root, id);
      menu.dataset.action = 'home';
      menu.textContent = STAR_COPY.home;
    }
    const sound = element<HTMLButtonElement>(this.root, 'soundBtn');
    sound.textContent = settings.soundEnabled ? '声音 开' : '声音 关';
    sound.setAttribute('aria-label', settings.soundEnabled ? '关闭声音' : '开启声音');
    sound.setAttribute('aria-pressed', String(settings.soundEnabled));
    const pause = element<HTMLButtonElement>(this.root, 'pauseBtn');
    pause.disabled = snapshot.status !== 'playing' && snapshot.status !== 'paused';
    pause.textContent = snapshot.status === 'paused' ? '继续' : '暂停';
    pause.setAttribute('aria-label', snapshot.status === 'paused' ? '继续游戏' : '暂停游戏');
    this.updateOrder(snapshot);
    this.updateAim(snapshot, AIM_DURATION_MS);
  }

  updateAim(snapshot: GameSnapshot, remaining: number): void {
    const aiming = snapshot.skillAction?.kind === 'aiming';
    this.root.dataset.aiming = String(aiming);
    const note = element(this.root, 'aimStatus');
    note.textContent = aiming ? (remaining / 1000).toFixed(1) + ' 秒 · 松开施法' : '';
  }

  private updateOrder(snapshot: GameSnapshot): void {
    const key = snapshot.level.id + ':' + JSON.stringify(snapshot.level.order);
    if (key !== this.orderKey) {
      this.orderKey = key;
      this.orderNodes.clear();
      const list = element(this.root, 'orderProgress');
      list.replaceChildren();
      for (const order of snapshot.orderProgress) {
        const chip = document.createElement('span');
        chip.className = 'order-chip';
        chip.style.color = starKind(order.fruitType).color;
        this.orderNodes.set(order.fruitType, chip);
        list.append(chip);
      }
    }
    const remaining = new Map(
      getRemainingOrder(snapshot.orderProgress).map((item) => [item.fruitType, item.remaining]),
    );
    for (const [type, chip] of this.orderNodes) {
      const count = remaining.get(type) ?? 0,
        kind = starKind(type);
      chip.hidden = count === 0;
      chip.textContent = count ? kind.symbol + ' ×' + count : '';
      chip.setAttribute('aria-label', '还缺' + kind.name + ' ' + count + ' 颗');
    }
    element(this.root, 'orderRow').hidden = snapshot.exitActive;
    element(this.root, 'orderReady').hidden = !snapshot.exitActive;
    element(this.root, 'orderReady').textContent = STAR_COPY.exitReady;
    element(this.root, 'exitHint').textContent = snapshot.exitActive
      ? '进入星门，前往下一区'
      : STAR_COPY.targetHint;
  }

  showOverlay(snapshot: GameSnapshot, run: RunState): void {
    const starting = snapshot.status === 'start',
      paused = snapshot.status === 'paused',
      won = snapshot.status === 'won';
    element(this.root, 'overlayTitle').textContent = starting
      ? snapshot.level.name
      : paused
        ? STAR_COPY.paused
        : won
          ? run.phase === 'won'
            ? STAR_COPY.runComplete
            : STAR_COPY.roomComplete
          : run.phase === 'lost'
            ? STAR_COPY.runLost
            : '重试本区';
    element(this.root, 'overlayScore').textContent = starting
      ? '第 ' + (run.roomIndex + 1) + ' 区 / 6 · ' + run.hearts + ' 颗心'
      : '得分 ' + (run.score + (won ? 0 : snapshot.score)) + ' · 剩余 ' + run.hearts + ' 颗心';
    element(this.root, 'overlayHighlight').hidden = true;
    const skill = SKILLS.find((item) => item.id === run.skillId);
    const upgrades = run.upgrades
      .map((id) => {
        const item = UPGRADES.find((u) => u.id === id);
        return item ? item.name + '：' + item.description : '';
      })
      .join('\n');
    element(this.root, 'overlayHint').textContent = starting
      ? getRoom(run.seed, run.roomIndex).lesson + '\n按住 Q 时停，方向键选方向，松开施法。'
      : paused
        ? (skill?.name ?? '') +
          '：' +
          (skill?.detail ?? '') +
          '\n' +
          (upgrades || STAR_COPY.noUpgrades) +
          '\n' +
          STAR_COPY.continueHint
        : won
          ? run.phase === 'won'
            ? '六个区域全部完成。可以换一种技能再出发。'
            : '身体长度保留。选好升级后进入下一区。'
          : (this.lastEnd ? STAR_COPY.collision[this.lastEnd] : '') +
            (run.phase === 'lost'
              ? '新一局会重置升级和收集进度。'
              : '重试从本区起点开始，保留已选升级。');
    element(this.root, 'primaryBtn').textContent = starting
      ? '进入本区'
      : paused
        ? '继续'
        : won
          ? run.phase === 'won'
            ? '再出发'
            : '选择升级'
          : run.phase === 'lost'
            ? '重新选择技能'
            : '重试本区';
    element(this.root, 'overlay').hidden = false;
  }

  handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) if (event.type === 'game-ended') this.lastEnd = event.reason;
    const completed = events.find((e) => e.type === 'order-item-completed'),
      food = events.find((e) => e.type === 'food-eaten');
    if (events.some((e) => e.type === 'exit-opened')) this.feedback(STAR_COPY.exitReady, 4);
    else if (completed) this.feedback(starKind(completed.fruitType).name + '收齐', 3);
    else if (food)
      this.feedback('+' + food.points + (food.combo > 1 ? '  连击 ×' + food.combo : ''), 1);
  }

  update(deltaMs: number): void {
    this.feedbackRemaining = Math.max(0, this.feedbackRemaining - deltaMs);
    if (this.feedbackRemaining === 0 && this.feedbackPriority > 0) this.clearFeedback();
  }
  hideOverlay(): void {
    element(this.root, 'overlay').hidden = true;
  }
  reset(): void {
    this.clearFeedback();
    this.lastEnd = null;
    this.bodyKey = '';
    this.orderKey = '';
    this.root.dataset.aiming = 'false';
    element(this.root, 'aimStatus').textContent = '';
  }
  private feedback(text: string, priority: number): void {
    if (this.feedbackRemaining > 0 && priority < this.feedbackPriority) return;
    const node = element(this.root, 'campaignFeedback');
    node.textContent = text;
    node.hidden = false;
    element(this.root, 'exitHint').hidden = true;
    this.feedbackRemaining = 900;
    this.feedbackPriority = priority;
  }
  private clearFeedback(): void {
    const node = element(this.root, 'campaignFeedback');
    node.textContent = '';
    node.hidden = true;
    element(this.root, 'exitHint').hidden = false;
    this.feedbackPriority = 0;
    this.feedbackRemaining = 0;
  }
  private card(icon: string, name: string, description: string, note: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    for (const [tag, text, className] of [
      ['span', icon, 'choice-icon'],
      ['strong', name, 'choice-name'],
      ['span', description, 'choice-description'],
      ['small', note, 'choice-note'],
    ] as const) {
      if (!text) continue;
      const node = document.createElement(tag);
      node.textContent = text;
      node.className = className;
      button.append(node);
    }
    return button;
  }
}
