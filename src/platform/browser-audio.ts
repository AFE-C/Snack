import type { AudioPort } from '../app/ports';
import type { GameEvent, GameSnapshot } from '../core/types';

type AudioContextFactory = () => AudioContext;

/** 实时合成音效；只在用户动作后创建音频上下文。 */
export class BrowserAudio implements AudioPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Map<OscillatorNode, GainNode>();
  private enabled = true;
  private paused = false;
  private disposed = false;
  private musicElapsed = 0;
  private musicNote = 0;
  private focused = false;

  constructor(
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
    private readonly music = false,
  ) {}

  unlock(): void {
    if (this.disposed) return;
    try {
      if (!this.context && this.enabled) {
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.syncGain();
      }
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      // 浏览器不支持音频或禁止播放时，游戏逻辑仍正常运行。
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopVoices();
    this.syncGain();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.stopVoices();
    this.syncGain();
  }

  setFocused(focused: boolean): void {
    if (this.focused && !focused) this.stopVoices();
    this.focused = focused;
    this.syncGain();
  }

  play(event: GameEvent): void {
    if (!this.enabled || this.paused || this.disposed) return;
    if (event.type === 'aim-started') {
      this.tone(196, 1.2, 'sine', 0.035);
      this.tone(392, 1.2, 'triangle', 0.018);
    } else if (event.type === 'terrain-broken') {
      this.tone(110, 0.09, 'triangle', 0.12);
      this.tone(330, 0.12, 'sine', 0.05, 0.03);
    } else if (event.type === 'session-started') {
      this.musicNote = 0;
      this.musicElapsed = 0;
      this.stopVoices();
      this.tone(523, 0.08, 'square', 0.08);
      this.tone(659, 0.08, 'square', 0.08, 0.08);
      this.tone(784, 0.12, 'square', 0.1, 0.16);
    } else if (event.type === 'food-eaten') {
      if (event.combo > 1) {
        this.tone(880, 0.06, 'square', 0.08);
        this.tone(1100, 0.06, 'square', 0.08, 0.05);
        this.tone(1320, 0.08, 'square', 0.07, 0.1);
      } else {
        const frequency = 600 + event.food.points * 100;
        this.tone(frequency, 0.08, 'square', 0.1);
        this.tone(frequency * 1.5, 0.1, 'square', 0.08, 0.06);
      }
    } else if (event.type === 'combo-milestone') {
      this.milestone(event.level);
    } else if (event.type === 'order-item-completed') {
      this.tone(784, 0.07, 'triangle', 0.09);
      this.tone(1047, 0.1, 'triangle', 0.08, 0.07);
    } else if (event.type === 'skill-used') {
      const frequency = event.skill.id === 'crush' ? 220 : event.skill.id === 'slow' ? 523 : 784;
      this.tone(frequency, 0.12, 'triangle', 0.1);
      this.tone(frequency * 1.5, 0.16, 'triangle', 0.08, 0.08);
    } else if (event.type === 'tail-cut') {
      this.tone(660, 0.08, 'triangle', 0.1);
      this.tone(330, 0.12, 'triangle', 0.08, 0.06);
    } else if (event.type === 'exit-opened') {
      this.milestone(1);
    } else if (event.type === 'game-ended') {
      if (event.reason === 'completed' || event.reason === 'order-completed') this.milestone(2);
      else {
        this.tone(440, 0.15, 'square', 0.12);
        this.tone(330, 0.15, 'square', 0.1, 0.12);
        this.tone(220, 0.3, 'square', 0.08, 0.24);
      }
    }
  }

  update(deltaMs: number, snapshot: GameSnapshot): void {
    if (
      !this.music ||
      !this.enabled ||
      this.paused ||
      this.disposed ||
      snapshot.status !== 'playing'
    )
      return;
    this.musicElapsed += deltaMs;
    const beat = snapshot.level.id === 'dispatch' ? 280 : 360;
    if (this.musicElapsed < beat) return;
    this.musicElapsed %= beat;
    // 原创的八小节五声音阶，直接合成；不下载第三方音乐或创建第二个计时器。
    const melody = [
      0, 7, 12, 7, 4, 7, 9, 7, 2, 7, 11, 7, 4, 9, 12, 9, 0, 4, 7, 12, 9, 7, 4, 7, 2, 5, 9, 12, 7, 5,
      2, 7,
    ];
    const note = melody[this.musicNote % melody.length] ?? 0;
    this.tone(261.63 * 2 ** (note / 12), 0.2, 'triangle', 0.035);
    if (this.musicNote % 4 === 0)
      this.tone(130.81 * 2 ** ((this.musicNote % 16 < 8 ? 0 : 5) / 12), 0.26, 'sine', 0.045);
    this.musicNote += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopVoices();
    if (this.context) void this.context.close().catch(() => undefined);
    this.master?.disconnect();
    this.master = null;
    this.context = null;
  }

  private milestone(level: number): void {
    const notes = [523, 523 * 1.25, 523 * 1.5, 523 * 2, 523 * 2.5];
    notes.slice(0, Math.min(notes.length, 3 + level)).forEach((frequency, index) => {
      this.tone(frequency, 0.12, 'square', 0.1, index * 0.08);
      this.tone(frequency * 2, 0.08, 'triangle', 0.06, index * 0.08 + 0.02);
    });
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.enabled || this.paused || this.disposed) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + delay;
      oscillator.type = this.music && type === 'square' ? 'triangle' : type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain);
      gain.connect(master);
      this.voices.set(oscillator, gain);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.voices.delete(oscillator);
      };
      oscillator.start(at);
      oscillator.stop(at + duration);
    } catch {
      // 音频设备失效不会中断游戏循环。
    }
  }

  private stopVoices(): void {
    for (const [oscillator, gain] of this.voices) {
      try {
        oscillator.stop();
      } catch {
        // 已结束的振荡器无需再停止。
      }
      oscillator.disconnect();
      gain.disconnect();
      oscillator.onended = null;
    }
    this.voices.clear();
  }

  private syncGain(): void {
    if (this.master && this.context) {
      this.master.gain.setValueAtTime(
        this.enabled && !this.paused ? (this.focused ? 0.4 : 1) : 0,
        this.context.currentTime,
      );
    }
  }
}
