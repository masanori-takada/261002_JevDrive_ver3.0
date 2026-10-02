import type { Detection, Road } from '../lib/types';
import { getDetector } from './detector';
import { readRoad } from './road';

export async function createVision() {
  const detector = await getDetector();
  return {
    async analyze(canvas: HTMLCanvasElement): Promise<{ road: Road; detections: Detection[] }> {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const road = readRoad(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const detections = await detector.detect(canvas);
      return { road, detections };
    },
  };
}
