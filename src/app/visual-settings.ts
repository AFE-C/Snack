export interface VisualSettings {
  readonly effects: 'standard' | 'reduced';
  readonly shake: boolean;
}
export const DEFAULT_VISUAL_SETTINGS: VisualSettings = Object.freeze({
  effects: 'standard',
  shake: true,
});

export function parseVisualSettings(
  raw: string | null,
  fallback = DEFAULT_VISUAL_SETTINGS,
): VisualSettings {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 1 ||
      !('effects' in value) ||
      !('shake' in value)
    )
      return fallback;
    if (
      (value.effects !== 'standard' && value.effects !== 'reduced') ||
      typeof value.shake !== 'boolean'
    )
      return fallback;
    return Object.freeze({ effects: value.effects, shake: value.shake });
  } catch {
    return fallback;
  }
}
