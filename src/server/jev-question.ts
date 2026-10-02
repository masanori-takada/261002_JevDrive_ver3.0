// 実 Jev への質問（目標レーン・throttle）の組み立て。実 Jev で 98% 一致した文面をそのまま使う

export const LANE_NAMES = ['far_left', 'left', 'center', 'right', 'far_right'] as const;
const LANE_CENTERS = [-0.8, -0.4, 0, 0.4, 0.8];

export type JevQuestion = {
  state: Record<string, unknown>;
  lane: { type: 'choice'; instructions: string; criteria: Record<string, string> };
  throttle: { type: 'choice'; instructions: string; criteria: Record<string, string> };
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function buildJevQuestion(
  cl: number[], current: number, speed: number, margin: number, throttleNear: number,
): JevQuestion {
  const clearance: Record<string, number> = {};
  const laneCriteria: Record<string, string> = {};
  LANE_NAMES.forEach((n, i) => {
    clearance[n] = round3(cl[i]);
    laneCriteria[n] = `${n} レーン（道路上の位置 ${LANE_CENTERS[i]}）を目標にする`;
  });
  return {
    state: {
      説明:
        'レーシングゲームの 5 レーン。左から far_left, left, center, right, far_right。' +
        '各レーンの余裕は、そのレーン上で最も近い障害物までの距離（0..1）。小さいほど危険、1 は障害物なし。',
      現在のレーン: LANE_NAMES[current],
      速度: round3(speed),
      各レーンの余裕: clearance,
    },
    lane: {
      type: 'choice',
      instructions:
        '各レーンの余裕が最も大きいレーンを目標に選ぶ。ただし、最大の余裕が現在のレーンの余裕より ' +
        `${margin} 以上大きくない場合は、現在のレーンを維持する。最大が複数あるときは center に近いレーン（同距離なら左側）を選ぶ。`,
      criteria: laneCriteria,
    },
    throttle: {
      type: 'choice',
      instructions:
        `選んだ目標レーンの余裕が ${throttleNear} 未満なら hold。そうでなく、速度が 0.8 未満なら accelerate。それ以外は hold。` +
        '（brake は使わない）',
      criteria: {
        brake: '減速する',
        hold: '速度を維持する（加速も減速もしない）',
        accelerate: '加速する',
      },
    },
  };
}
