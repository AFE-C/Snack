import type { GameView, PlayerSettings } from '../app/ports';
import type { GameEvent, GameSnapshot } from '../core/types';
import { CanvasRenderer } from '../render/canvas-renderer';
import { EffectSystem } from '../render/effects';
import { GameUi } from './game-ui';

export class BrowserGameView implements GameView {
  private readonly renderer: CanvasRenderer;
  private readonly effects = new EffectSystem();
  private readonly ui: GameUi;

  constructor(root: HTMLElement, canvas: HTMLCanvasElement) {
    this.renderer = new CanvasRenderer(canvas);
    this.ui = new GameUi(root);
  }

  reset(snapshot: GameSnapshot): void {
    this.effects.reset();
    this.ui.reset();
    this.renderer.reset(snapshot);
  }

  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void {
    this.ui.updateHud(snapshot, settings);
  }

  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    this.effects.handleEvents(events, snapshot);
    if (snapshot.victoryCondition === 'orders-and-exit') {
      this.ui.showCampaignFeedback(events);
      return;
    }
    for (const event of events) {
      if (event.type === 'food-eaten' && event.combo > 1) {
        this.ui.showCombo(event.combo, event.combo % 10 === 0);
      }
    }
  }

  draw(snapshot: GameSnapshot, deltaMs: number): void {
    this.effects.update(deltaMs);
    this.ui.update(deltaMs, this.effects.isShaking);
    this.renderer.draw(snapshot, deltaMs, this.effects);
  }

  showOverlay(snapshot: GameSnapshot, isNewRecord: boolean): void {
    this.ui.showOverlay(snapshot, isNewRecord);
  }

  hideOverlay(): void {
    this.ui.hideOverlay();
  }

  dispose(): void {
    this.effects.reset();
    this.ui.reset();
  }
}
