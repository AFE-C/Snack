import type { GameView, PlayerSettings, PresentationFrame } from '../app/ports';
import type { GameEvent, GameSnapshot } from '../core/types';
import type { RunState } from '../app/expedition-run';
import type { VisualSettings } from '../app/visual-settings';
import { CanvasRenderer } from '../render/canvas-renderer';
import { EffectSystem } from '../render/effects';
import { GameUi } from './game-ui';
import { StarGameView } from './star-game-view';

/** Select a single view implementation at the composition boundary. */
export class BrowserGameView implements GameView {
  private readonly view: GameView;
  constructor(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    run?: () => RunState,
    preferences?: () => VisualSettings,
  ) {
    this.view = run
      ? new StarGameView(root, canvas, run, preferences)
      : new CandyGameView(root, canvas);
  }
  reset(snapshot: GameSnapshot): void {
    this.view.reset(snapshot);
  }
  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void {
    this.view.updateHud(snapshot, settings);
  }
  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    this.view.handleEvents(events, snapshot);
  }
  draw(snapshot: GameSnapshot, deltaMs: number, frame?: PresentationFrame): void {
    this.view.draw(snapshot, deltaMs, frame);
  }
  showOverlay(snapshot: GameSnapshot, record: boolean): void {
    this.view.showOverlay(snapshot, record);
  }
  hideOverlay(): void {
    this.view.hideOverlay();
  }
  dispose(): void {
    this.view.dispose();
  }
}

class CandyGameView implements GameView {
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
    if (snapshot.victoryCondition === 'orders-and-exit') this.ui.showCampaignFeedback(events);
    else
      for (const event of events)
        if (event.type === 'food-eaten' && event.combo > 1)
          this.ui.showCombo(event.combo, event.combo % 10 === 0);
  }
  draw(snapshot: GameSnapshot, deltaMs: number): void {
    this.effects.update(deltaMs);
    this.ui.update(deltaMs, this.effects.isShaking);
    this.renderer.draw(snapshot, deltaMs, this.effects);
  }
  showOverlay(snapshot: GameSnapshot, record: boolean): void {
    this.ui.showOverlay(snapshot, record);
  }
  hideOverlay(): void {
    this.ui.hideOverlay();
  }
  dispose(): void {
    this.effects.reset();
    this.ui.reset();
  }
}
