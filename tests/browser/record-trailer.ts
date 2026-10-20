import { SKILLS, UPGRADES } from '../../src/content/expedition';
import type { GameCommand, GameSnapshot } from '../../src/core/types';
import type { RunState } from '../../src/app/expedition-run';
import { SKILL_IDS } from '../../src/core/expedition';
import type { SkillId } from '../../src/core/expedition';
import { nextRoute } from '../helpers/campaign-run';

interface RecordingDriver {
  start(skill: SkillId): void;
  snapshot(): GameSnapshot;
  run(): RunState | null;
  step(): void;
  command(command: GameCommand): void;
  status(text: string): void;
}

/** 导出由公开指令驱动的实机画面。仅开发验收页导入，生产包不含脚本或自动驾驶。 */
export async function recordTrailer(
  board: HTMLCanvasElement,
  driver: RecordingDriver,
): Promise<void> {
  const composite = document.createElement('canvas');
  composite.width = 1280;
  composite.height = 720;
  const ctx = composite.getContext('2d');
  if (!ctx) throw new Error('无法创建录像画布');
  if (!globalThis.MediaRecorder || !composite.captureStream)
    throw new Error('当前浏览器不支持实机录像导出');
  const stream = composite.captureStream(30);
  const audio = new AudioContext();
  await audio.resume();
  const destination = audio.createMediaStreamDestination();
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('当前浏览器不支持 WebM');
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  const melody = [0, 7, 12, 7, 4, 7, 9, 7, 2, 7, 11, 7, 4, 9, 12, 9];
  for (let index = 0; index < 64; index++) {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      at = audio.currentTime + index * 0.36;
    oscillator.type = 'triangle';
    oscillator.frequency.value = 261.63 * 2 ** ((melody[index % 16] ?? 0) / 12);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.07, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(at);
    oscillator.stop(at + 0.29);
  }
  const label = (text: string, x: number, y: number, size = 24, color = '#634b42') => {
    ctx.fillStyle = color;
    ctx.font = `${size}px "Microsoft YaHei",sans-serif`;
    ctx.fillText(text, x, y);
  };
  let scene = -1,
    step = 0,
    accumulator = 0,
    last = 0;
  const start = performance.now();
  recorder.start(200);
  try {
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const elapsed = now - start,
          delta = last ? Math.min(100, now - last) : 0;
        last = now;
        const nextScene =
          elapsed < 2000 ? -1 : elapsed >= 20000 ? 3 : Math.floor((elapsed - 2000) / 6000);
        ctx.fillStyle = '#f9ebdc';
        ctx.fillRect(0, 0, 1280, 720);
        ctx.strokeStyle = '#dfcbb8';
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 24, 1232, 672);
        if (nextScene < 0 || nextScene === 3) {
          label('CANDY SNAKE', 170, 230, 64, '#714937');
          label(nextScene < 0 ? '把身体，变成下一条路。' : '糖果远征 · 巧克力工坊', 170, 330, 42);
          label(
            nextScene < 0
              ? '实时路线规划  /  断尾施法  /  局内构筑'
              : '六个房间 · 三种起始配方 · 九项升级',
            170,
            405,
            26,
          );
          label('开发中试玩版 · 实机画面', 170, 520, 20, '#96745d');
        } else {
          if (nextScene !== scene) {
            scene = nextScene;
            step = 0;
            accumulator = 0;
            driver.start(SKILL_IDS[scene] ?? 'crush');
          }
          accumulator += delta;
          while (
            accumulator >= driver.snapshot().stepMs &&
            driver.snapshot().status === 'playing'
          ) {
            accumulator -= driver.snapshot().stepMs;
            const snapshot = driver.snapshot();
            if (scene === 0 && step < 7)
              driver.command({ type: 'turn', direction: step < 2 ? 'right' : 'up' });
            else {
              const route = nextRoute(snapshot);
              if (route?.[0]) driver.command({ type: 'turn', direction: route[0] });
            }
            if (
              snapshot.skill?.available &&
              ((scene === 0 && step === 7) ||
                (scene === 1 && step === 4) ||
                (scene === 2 && step === 6) ||
                (step > 10 && snapshot.snake.length >= 9))
            )
              driver.command({ type: 'use-skill' });
            driver.step();
            step++;
          }
          ctx.fillStyle = '#8d6352';
          ctx.fillRect(60, 62, 600, 600);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(board, 72, 74, 576, 576);
          const snapshot = driver.snapshot(),
            run = driver.run(),
            skill = SKILLS[scene];
          label('糖果远征', 710, 115, 28, '#b56572');
          label(skill?.name ?? '', 710, 175, 38);
          label(
            scene === 0
              ? '断尾施法，打开捷径'
              : scene === 1
                ? '放慢脚步，重新规划'
                : '隔着空格，收集订单',
            710,
            220,
            24,
          );
          label(
            `身体 ${snapshot.snake.length} 节   Q 消耗 ${snapshot.skill?.cost ?? 3} 节`,
            710,
            295,
            24,
          );
          label('还缺的水果，直接标在棋盘上', 710, 345, 22);
          snapshot.orderProgress.forEach((item, index) =>
            label(
              `${{ grape: '葡萄', strawberry: '草莓', orange: '橙子', watermelon: '西瓜' }[item.fruitType] ?? item.fruitType} ×${Math.max(0, item.required - item.collected)}`,
              710,
              390 + index * 34,
              22,
            ),
          );
          label(`♥ ${run?.hearts ?? 3}    得分 ${snapshot.score}`, 710, 570, 24, '#b56572');
          label(
            run?.upgrades.map((id) => UPGRADES.find((item) => item.id === id)?.name).join(' · ') ||
              '通过房间后，三选一升级',
            710,
            615,
            19,
          );
          label('开发中试玩版 · 实机画面', 710, 655, 16, '#96745d');
        }
        if (elapsed >= 23000) {
          resolve();
          return;
        }
        driver.status(`实机预告录制中：${Math.floor(elapsed / 1000)} / 23 秒`);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'candy-snake-gameplay-trailer.webm';
    anchor.textContent = '下载实机预告（WebM）';
    document.querySelector('#expeditionQaPanel')?.append(anchor);
    anchor.click();
    driver.status('实机预告已导出：1280×720 / 30fps / 原创合成音乐。');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    await audio.close();
  }
}
