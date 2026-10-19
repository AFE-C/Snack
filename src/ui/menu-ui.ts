import type { NavigationView } from '../app/game-coordinator';
import { isLevelUnlocked } from '../app/campaign-progress';
import type { CampaignProgress, PlayerSettings } from '../app/ports';
import { CAMPAIGN_LEVELS, FRUIT_ICONS, FRUIT_LABELS } from '../content/catalog';

const LEVEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  garden: '开阔草地，学着收齐第一份订单。',
  courtyard: '穿过巧克力墙的缺口，安排路线。',
  alleys: '在窄通道里，用断尾为自己让路。',
};

export class MenuUi implements NavigationView {
  constructor(private readonly root: HTMLElement) {}

  showHome(progress: CampaignProgress, settings: PlayerSettings): void {
    this.show('homeScreen');
    this.element('homeProgress').textContent =
      `闯关 ${progress.completedLevelIds.length} / ${CAMPAIGN_LEVELS.length} 已完成 · 经典最高分 ${settings.highScore}`;
  }

  showLevels(progress: CampaignProgress): void {
    this.show('levelScreen');
    const list = this.element('levelList');
    list.replaceChildren();
    CAMPAIGN_LEVELS.forEach((level, index) => {
      const unlocked = isLevelUnlocked(progress, level.id);
      const completed = progress.completedLevelIds.includes(level.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-button';
      button.dataset.action = 'select-level';
      button.dataset.levelId = level.id;
      button.disabled = !unlocked;
      const title = document.createElement('strong');
      title.textContent = `${String(index + 1).padStart(2, '0')}  ${level.name}`;
      const description = document.createElement('span');
      description.textContent = LEVEL_DESCRIPTIONS[level.id] ?? level.name;
      const order = document.createElement('span');
      order.className = 'level-order';
      for (const item of level.order ?? []) {
        const fruit = document.createElement('span');
        fruit.className = 'level-fruit';
        fruit.textContent = `${FRUIT_ICONS[item.fruitType] ?? FRUIT_LABELS[item.fruitType]} ×${item.required}`;
        order.append(fruit);
      }
      const status = document.createElement('small');
      status.textContent = completed
        ? '✓ 已完成 · 可重玩'
        : unlocked
          ? '开始挑战 →'
          : `完成第 ${index} 关后解锁`;
      button.setAttribute('aria-label', `${level.name}，${status.textContent}`);
      button.append(title, description, order, status);
      list.append(button);
    });
    this.element('levelProgress').textContent =
      progress.completedLevelIds.length === CAMPAIGN_LEVELS.length
        ? '三关全部完成！挑一关再玩一次吧。'
        : `已完成 ${progress.completedLevelIds.length} / ${CAMPAIGN_LEVELS.length} 关 · 进度自动保存在当前浏览器`;
  }

  showGame(): void {
    this.show('playScreen');
  }

  private show(id: string): void {
    for (const screen of ['homeScreen', 'levelScreen', 'playScreen'])
      this.element(screen).hidden = screen !== id;
    this.element('overlay').hidden = true;
  }

  private element(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`游戏菜单缺少元素：${id}`);
    return element;
  }
}
