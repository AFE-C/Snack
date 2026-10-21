import type { StorageAdapter } from '../app/ports';
import { DEFAULT_VISUAL_SETTINGS } from '../app/visual-settings';
import type { VisualSettings } from '../app/visual-settings';
import { element } from './dom';

/** Shell settings are independent of room saves and survive mode changes. */
export class ShellUi {
  private visual: VisualSettings;
  private readonly dialog: HTMLDialogElement;
  constructor(
    private readonly root: HTMLElement,
    private readonly storage: StorageAdapter,
  ) {
    this.visual = storage.loadVisualSettings?.() ?? DEFAULT_VISUAL_SETTINGS;
    this.dialog = element<HTMLDialogElement>(root, 'settingsDialog');
    this.sync();
  }
  get settings(): VisualSettings {
    return this.visual;
  }
  get settingsOpen(): boolean {
    return this.dialog.open;
  }
  openSettings(): void {
    this.sync();
    if (!this.dialog.open) this.dialog.showModal();
  }
  closeSettings(): void {
    this.dialog.close();
  }
  toggleEffects(): void {
    this.visual = Object.freeze({
      ...this.visual,
      effects: this.visual.effects === 'standard' ? 'reduced' : 'standard',
    });
    this.save();
  }
  toggleShake(): void {
    this.visual = Object.freeze({ ...this.visual, shake: !this.visual.shake });
    this.save();
  }
  sync(): void {
    element(this.root, 'effectsSetting').textContent =
      this.visual.effects === 'reduced' ? '精简' : '标准';
    const shake = element(this.root, 'shakeSetting');
    shake.textContent = this.visual.shake ? '开' : '关';
    shake.setAttribute('aria-pressed', String(this.visual.shake));
    const sound = element(this.root, 'soundSetting'),
      enabled = this.storage.load().soundEnabled;
    sound.textContent = enabled ? '开' : '关';
    sound.setAttribute('aria-pressed', String(enabled));
    this.root.dataset.effects = this.visual.effects;
  }
  private save(): void {
    this.storage.saveVisualSettings?.(this.visual);
    this.sync();
  }
}
