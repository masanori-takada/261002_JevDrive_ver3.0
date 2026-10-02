export type Steer = -1 | 0 | 1;
export type Action = { steer: Steer; throttle: Steer };
export type ObstacleClass = 'car' | 'truck' | 'bus' | 'motorcycle';
export type Box = { x: number; y: number; w: number; h: number }; // 左上基準、画面比 0..1
export type Detection = Box & { cls: ObstacleClass; conf: number };
export type Road = { left: number; right: number; centerOffset: number };
/** targetX は現在の目標レーンの中心（省略時は 0）。サーバーが「現在のレーン」として使う */
export type Observation = { frame: number; speed: number; road: Road; obstacles: Detection[]; targetX?: number };
/** Jev の判断: 目標レーンの中心（-0.8/-0.4/0/0.4/0.8）と throttle。ハンドル操作は毎フレーム車側で行う */
export type Plan = { targetX: number; throttle: Steer };
export type SystemOneResponse = { plan: Plan | null; latencyMs: number; source: 'jev' | 'hold' };
