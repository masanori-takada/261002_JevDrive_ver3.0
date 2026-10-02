import { describe, expect, it } from 'vitest';
import { buildObservation } from '../../src/vision/observation';

const road = { left: 0.2, right: 0.8, centerOffset: 0 };
const det = (y: number, h: number, conf = 0.9) => ({ cls: 'car' as const, conf, x: 0.4, y, w: 0.2, h });

describe('buildObservation', () => {
  it('小数を3桁に丸める', () => {
    const o = buildObservation({ frame: 5, speed: 0.123456, road, detections: [det(0.123456, 0.2, 0.987654)] });
    expect(o.speed).toBe(0.123);
    expect(o.obstacles[0].y).toBe(0.123);
    expect(o.obstacles[0].conf).toBe(0.988);
  });
  it('手前（y+h が大きい）順に並べる', () => {
    const o = buildObservation({ frame: 0, speed: 0.5, road, detections: [det(0.4, 0.1), det(0.6, 0.3)] });
    expect(o.obstacles[0].y).toBe(0.6);
  });
  it('最大6件に絞る', () => {
    const many = Array.from({ length: 9 }, (_, i) => det(0.3 + i * 0.01, 0.1));
    expect(buildObservation({ frame: 0, speed: 0.5, road, detections: many }).obstacles).toHaveLength(6);
  });
});
