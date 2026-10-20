import { getRoom, SKILLS, UPGRADES } from '../content/expedition';
import type { RunState } from '../app/expedition-run';
import type { UpgradeId } from '../core/expedition';
import type { GameSnapshot } from '../core/types';

export class ExpeditionUi {
  constructor(private readonly root: HTMLElement) {}

  show(screen: string): void {
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-screen]'))
      element.hidden = element.id !== screen;
    this.root.dataset.screen = screen;
    this.root.querySelector<HTMLElement>('#overlay')?.setAttribute('hidden', '');
  }

  showRecipes(): void {
    this.show('recipeScreen');
    const list = this.element('recipeList');
    list.replaceChildren();
    for (const skill of SKILLS) {
      const button = this.card(skill.icon, skill.name, skill.description, skill.detail);
      button.dataset.action = 'select-skill';
      button.dataset.skillId = skill.id;
      button.classList.add(`recipe-${skill.id}`);
      list.append(button);
    }
  }

  showRewards(run: RunState, choices: readonly UpgradeId[]): void {
    this.show('rewardScreen');
    this.element('rewardSummary').textContent =
      `${getRoom(run.seed, run.roomIndex).level.name}已送达 · ${run.hearts} 颗心 · 身体 ${run.entryLength} 节`;
    const list = this.element('upgradeList');
    list.replaceChildren();
    for (const id of choices) {
      const upgrade = UPGRADES.find((item) => item.id === id);
      if (!upgrade) continue;
      const button = this.card(
        upgrade.icon,
        upgrade.name,
        upgrade.description,
        '选择后进入下一房间',
      );
      button.dataset.action = 'choose-upgrade';
      button.dataset.upgradeId = id;
      list.append(button);
    }
  }

  updateHud(snapshot: GameSnapshot, run: RunState): void {
    this.root.dataset.mode = 'expedition';
    this.element('expeditionHud').hidden = false;
    this.element('levelLabel').textContent =
      `巧克力工坊 · ${run.roomIndex + 1} / 6 · ${snapshot.level.name}`;
    this.element('runHearts').textContent = '♥'.repeat(run.hearts) + '♡'.repeat(3 - run.hearts);
    this.element('runHearts').setAttribute('aria-label', `剩余 ${run.hearts} 颗心`);
    this.element('highScore').textContent = String(snapshot.snake.length);
    this.element('recordLabel').textContent = '身体';
    const skill = SKILLS.find((item) => item.id === run.skillId);
    const status = snapshot.skill;
    this.element('skillPower').textContent =
      `${skill?.icon ?? ''} ${skill?.name ?? ''} · ${status?.power ?? 1} 级`;
    const button = this.element('cutTailBtn') as HTMLButtonElement;
    button.disabled = !status?.available;
    button.textContent = status?.available
      ? `Q 施放 · 消耗 ${status.cost} 节`
      : snapshot.status === 'playing'
        ? `Q 施放 · 还需 ${Math.max(0, (status?.cost ?? 3) + 3 - snapshot.snake.length)} 节`
        : snapshot.status === 'paused'
          ? 'Q 施放 · 暂停中'
          : snapshot.status === 'start'
            ? 'Q 施放 · 等待开始'
            : 'Q 施放 · 本房间已结束';
    this.element('skillNote').textContent = snapshot.slowSteps
      ? `缓流剩余 ${snapshot.slowSteps} 步 · 最少保留 3 节`
      : '6 / 9 / 12 节增强技能 · 最少保留 3 节';
    this.element('runLesson').textContent = getRoom(run.seed, run.roomIndex).lesson;
    const build = run.upgrades.map((id) => UPGRADES.find((item) => item.id === id));
    this.element('runUpgrades').textContent = build.length
      ? build.map((item) => item?.name).join(' · ')
      : '通过房间后，选择你的第一个升级。';
    for (const id of ['menuBtn', 'overlayMenuBtn']) {
      const menu = this.element(id);
      menu.dataset.action = 'home';
      menu.textContent = '保存并返回';
    }
    this.element('score').textContent = String(
      run.score + (snapshot.status === 'won' ? 0 : snapshot.score),
    );
  }

  showOverlay(snapshot: GameSnapshot, run: RunState): void {
    const starting = snapshot.status === 'start';
    const paused = snapshot.status === 'paused';
    const won = snapshot.status === 'won';
    this.element('overlayTitle').textContent = starting
      ? snapshot.level.name
      : paused
        ? '配方还在，休息一下'
        : won
          ? run.phase === 'won'
            ? '工坊订单全部送达'
            : '这一箱，送到了'
          : run.phase === 'lost'
            ? '这次远征结束了'
            : '还有机会，再试一次';
    this.element('overlayScore').textContent = starting
      ? `房间 ${run.roomIndex + 1} / 6 · ${run.hearts} 颗心 · 150ms / 步`
      : `远征得分 ${run.score + (won ? 0 : snapshot.score)} · ${run.hearts} 颗心`;
    this.element('overlayHint').textContent = starting
      ? `${getRoom(run.seed, run.roomIndex).lesson}\n收齐订单后进入绿色出口。按 Q 断尾施法。`
      : paused
        ? `${SKILLS.find((item) => item.id === run.skillId)?.detail}\n${run.upgrades.map((id) => UPGRADES.find((item) => item.id === id)?.description).join('\n') || '当前还没有升级。'}\n返回首页后，可从本房间入口续玩。`
        : won
          ? run.phase === 'won'
            ? '你完成了六个房间。换一份配方，走另一条路吧。'
            : '选择一个升级，再带着现在的身体进入下一房间。'
          : run.phase === 'lost'
            ? '升级和订单将在新一局重置。尝试另一种配方。'
            : '当前房间回到入口状态；已选升级保留。';
    this.element('primaryBtn').textContent = starting
      ? '进入房间'
      : paused
        ? '继续远征'
        : won
          ? run.phase === 'won'
            ? '换配方再出发'
            : '选择升级'
          : run.phase === 'lost'
            ? '重新选择配方'
            : '重试房间';
  }

  private element(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`远征界面缺少 ${id}`);
    return element;
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
    ]) {
      const node = document.createElement(tag ?? 'span');
      node.textContent = text ?? '';
      node.className = className ?? '';
      button.append(node);
    }
    return button;
  }
}
