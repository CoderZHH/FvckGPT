export const bounds = { x: 17, z: 23 };
export const roundSeconds = 90;
export const winScore = 2;
export const eyeHeight = 1.62;
export const maxHealth = 100;
export const batterySpeedMultiplier = .86;
export const teams = [
  { name: '橙队', color: '#ff9b4e', spawn: { x: 0, z: 20.7, yaw: 0 }, goal: { x: 0, z: 21 } },
  { name: '蓝队', color: '#74d4ff', spawn: { x: 0, z: -20.7, yaw: Math.PI }, goal: { x: 0, z: -21 } },
];

export const cover = [
  { x: -5.4, z: 5.8, w: 3.1, d: 5.8, h: 2.9, kind: 'container', color: 0x536375, number: '03' },
  { x: 5.6, z: -5.9, w: 3.1, d: 5.8, h: 2.9, kind: 'container', color: 0x426363, number: '07' },
  { x: 3.2, z: 7.4, w: 2.2, d: 1.9, h: 1.34, kind: 'crate' },
  { x: -3.4, z: -7.2, w: 2.2, d: 1.9, h: 1.34, kind: 'crate' },
  { x: 4.1, z: 1.6, w: 1.8, d: 3.1, h: 1.14, kind: 'crate' },
  { x: -1.9, z: -3.7, w: 2.1, d: 1.65, h: 1.45, kind: 'crate' },
  { x: -9.6, z: 0, w: 2.8, d: 0.45, h: 2.8, kind: 'wall' },
  { x: -4.65, z: 0, w: 2.4, d: 0.45, h: 2.8, kind: 'wall' },
  { x: 7.1, z: 15.1, w: 3.6, d: 6.8, h: 2.9, kind: 'container', color: 0xa26441, number: '12' },
  { x: -7.3, z: -15.3, w: 3.5, d: 6.7, h: 2.9, kind: 'container', color: 0x50726a, number: '19' },
  { x: 13.4, z: 4.1, w: 2.9, d: 5.2, h: 2.8, kind: 'container', color: 0x506371, number: '24' },
  { x: -13.3, z: -3.0, w: 3, d: 5.5, h: 2.9, kind: 'container', color: 0xa26441, number: '32' },
  { x: -3.8, z: 15.4, w: 2.1, d: 2.0, h: 1.25, kind: 'crate' },
  { x: 3.8, z: -15.4, w: 2.0, d: 2.1, h: 1.2, kind: 'crate' },
];
export const shutter = { x: -6.99, z: 0, w: 2.3, d: 0.17, h: 2.7, kind: 'shutter' };
export const shutterMaxHP = 3;
export const perimeter = [-1, 1].flatMap(side => [
  { x: side * (bounds.x + .15), z: 0, w: .3, h: 3.1, d: bounds.z * 2 },
  { x: 0, z: side * (bounds.z + .15), w: bounds.x * 2 + .3, h: 3.1, d: .3 },
]);

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
