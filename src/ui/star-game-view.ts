import type { GameView, PlayerSettings, PresentationFrame } from '../app/ports';
import type { RunState } from '../app/expedition-run';
import type { GameEvent, GameSnapshot } from '../core/types';
import type { VisualSettings } from '../app/visual-settings';
import { DEFAULT_VISUAL_SETTINGS } from '../app/visual-settings';
import { AIM_DURATION_MS } from '../app/action-timing';
import { StarRenderer } from '../render/star-renderer';
import { ExpeditionUi } from './expedition-ui';

/** One UI owner per active mode. The legacy GameUi never updates star HUD nodes. */
export class StarGameView implements GameView {
  private readonly renderer: StarRenderer;
  private readonly ui: ExpeditionUi;
  constructor(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    private readonly run: () => RunState,
    private readonly preferences: () => VisualSettings = () => DEFAULT_VISUAL_SETTINGS,
  ) {
    this.renderer = new StarRenderer(canvas);
    this.ui = new ExpeditionUi(root);
  }
  reset(snapshot: GameSnapshot): void {
    this.ui.reset();
    this.renderer.reset(snapshot);
  }
  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void {
    this.ui.updateHud(snapshot, this.run(), settings);
  }
  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    this.renderer.handle(events, snapshot);
    this.ui.handleEvents(events);
  }
  draw(snapshot: GameSnapshot, deltaMs: number, frame?: PresentationFrame): void {
    const settings = this.preferences();
    this.renderer.configure(settings.effects === 'reduced', settings.shake);
    this.ui.update(frame?.worldDeltaMs ?? deltaMs);
    this.ui.updateAim(snapshot, frame?.aimRemainingMs ?? AIM_DURATION_MS);
    this.renderer.draw(snapshot, deltaMs, frame);
  }
  showOverlay(snapshot: GameSnapshot): void {
    this.ui.showOverlay(snapshot, this.run());
  }
  hideOverlay(): void {
    this.ui.hideOverlay();
  }
  dispose(): void {
    this.ui.reset();
    this.renderer.dispose();
  }
}
