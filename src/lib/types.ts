export type Steer = -1 | 0 | 1;
export type Action = { steer: Steer; throttle: Steer };
export type ObstacleClass = 'car' | 'truck' | 'bus' | 'motorcycle';
export type Box = { x: number; y: number; w: number; h: number }; // 左上基準、画面比 0..1
export type Detection = Box & { cls: ObstacleClass; conf: number };
export type Road = { left: number; right: number; centerOffset: number };
export type Observation = { frame: number; speed: number; road: Road; obstacles: Detection[] };
export type SystemOneResponse = { action: Action | null; latencyMs: number; source: 'jev' | 'hold' };
