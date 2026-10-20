import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { FileStore } = require('../desktop/storage.cjs') as {
  FileStore: new (directory: string) => {
    get(key: string): string | null;
    set(key: string, value: string): boolean;
  };
};
function directory() {
  const root = path.resolve('work', 'storage-tests');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, 'save-'));
}
describe('桌面文件存档', () => {
  it('重新打开文件后恢复设置、旧进度和远征，拒绝非白名单键', () => {
    const folder = directory();
    const store = new FileStore(folder);
    expect(store.set('candySnakeExpedition', '{"version":1}')).toBe(true);
    store.set('candySnakeHighScore', '123');
    store.set('candySnakeSoundEnabled', 'false');
    const reopened = new FileStore(folder);
    expect(reopened.get('candySnakeHighScore')).toBe('123');
    expect(reopened.get('candySnakeExpedition')).toBe('{"version":1}');
    expect(store.set('../outside', 'bad')).toBe(false);
    expect(store.get('constructor')).toBeNull();
    expect(JSON.parse(readFileSync(path.join(folder, 'save.json'), 'utf8')).version).toBe(1);
  });
  it('损坏的文件和无效类型恢复为空记录，过大的输入不会写盘', () => {
    const folder = directory();
    writeFileSync(path.join(folder, 'save.json'), 'broken');
    const store = new FileStore(folder);
    expect(store.get('candySnakeHighScore')).toBeNull();
    expect(store.set('candySnakeExpedition', 'a'.repeat(32769))).toBe(false);
    expect(store.set('candySnakeHighScore', '7')).toBe(true);
    expect(new FileStore(folder).get('candySnakeHighScore')).toBe('7');
  });
});
