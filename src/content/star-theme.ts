export interface StarKind {
  readonly name: string;
  readonly symbol: string;
  readonly color: string;
  readonly shape: 'star' | 'moon' | 'crystal' | 'ring';
}

/** Stable fruit IDs are save/rule identities; this catalog only changes their appearance. */
export const STAR_KINDS: Readonly<Record<string, StarKind>> = Object.freeze({
  grape: { name: '星星', symbol: '✦', color: '#FFD35A', shape: 'star' },
  strawberry: { name: '月牙', symbol: '☽', color: '#64E4E8', shape: 'moon' },
  orange: { name: '晶体', symbol: '◆', color: '#FF819D', shape: 'crystal' },
  watermelon: { name: '星环', symbol: '◎', color: '#F4F4E8', shape: 'ring' },
});

export function starKind(type: string): StarKind {
  const kind = STAR_KINDS[type];
  if (!kind) throw new Error(`Unknown collectible: ${type}`);
  return kind;
}

export const ROOM_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'workshop-entry': '出发地',
  'shelves-a': '碎石带',
  'shelves-b': '双环之间',
  'shortcut-a': '裂岩捷径',
  'shortcut-b': '岔路',
  'ribbons-a': '狭长航道',
  'ribbons-b': '回转航道',
  'mix-a': '交汇处',
  'mix-b': '星环之间',
  dispatch: '最后一站',
});

export function roomName(id: string, fallback: string): string {
  return ROOM_NAMES[id] ?? fallback;
}
