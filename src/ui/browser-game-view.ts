import type { GameView, PlayerSettings, PresentationFrame } from '../app/ports';
import { StarRenderer } from '../render/star-renderer';
import type { GameEvent, GameSnapshot } from '../core/types';
import { CanvasRenderer } from '../render/canvas-renderer';
import { EffectSystem } from '../render/effects';
import { GameUi } from './game-ui';
import { ExpeditionUi } from './expedition-ui';
import type { RunState } from '../app/expedition-run';

export class BrowserGameView implements GameView {
  private readonly renderer: CanvasRenderer;
  private readonly effects = new EffectSystem();
  private readonly ui: GameUi;

  private readonly expeditionUi: ExpeditionUi;
  private readonly starRenderer: StarRenderer | null;

  constructor(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    private readonly run?: () => RunState,
  ) {
    this.renderer = new CanvasRenderer(canvas);
    this.ui = new GameUi(root);
    this.expeditionUi = new ExpeditionUi(root);
    this.starRenderer = run ? new StarRenderer(canvas) : null;
  }

  reset(snapshot: GameSnapshot): void {
    this.effects.reset();
    this.ui.reset();
    this.renderer.reset(snapshot);
    this.starRenderer?.reset(snapshot);
  }

  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void {
    this.ui.updateHud(snapshot, settings);
    if (this.run) this.expeditionUi.updateHud(snapshot, this.run());
  }

  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    this.effects.handleEvents(events, snapshot);
    this.starRenderer?.handle(events, snapshot);
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

  draw(snapshot: GameSnapshot, deltaMs: number, frame?: PresentationFrame): void {
    this.effects.update(deltaMs);
    this.ui.update(deltaMs, this.effects.isShaking);
    if (this.starRenderer) this.starRenderer.draw(snapshot, deltaMs, frame);
    else this.renderer.draw(snapshot, deltaMs, this.effects);
  }

  showOverlay(snapshot: GameSnapshot, isNewRecord: boolean): void {
    this.ui.showOverlay(snapshot, isNewRecord);
    if (this.run) this.expeditionUi.showOverlay(snapshot, this.run());
  }

  hideOverlay(): void {
    this.ui.hideOverlay();
  }

  dispose(): void {
    this.effects.reset();
    this.ui.reset();
  }
}
