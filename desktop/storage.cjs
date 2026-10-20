const fs = require('node:fs');
const path = require('node:path');
const KEYS = new Set([
  'candySnakeHighScore',
  'candySnakeSoundEnabled',
  'candySnakeCampaignProgress',
  'candySnakeExpedition',
]);

class FileStore {
  constructor(directory) {
    this.file = path.join(directory, 'save.json');
    this.values = {};
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (value && value.version === 1 && typeof value.data === 'object' && value.data)
        for (const key of KEYS)
          if (typeof value.data[key] === 'string') this.values[key] = value.data[key];
    } catch {
      /* 首次启动或损坏文件时使用空存档。 */
    }
  }
  get(key) {
    return KEYS.has(key) ? (this.values[key] ?? null) : null;
  }
  set(key, value) {
    if (!KEYS.has(key) || typeof value !== 'string' || value.length > 32768) return false;
    const next = { ...this.values, [key]: value };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, data: next }), 'utf8');
      fs.renameSync(`${this.file}.tmp`, this.file);
      this.values = next;
      return true;
    } catch {
      // 写盘失败仍保留会话进度；返回值可供诊断，不中断规则层。
      this.values = next;
      return false;
    }
  }
}
module.exports = { FileStore };
