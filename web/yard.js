export const bounds = { x: 11, z: 14 };
export const roundSeconds = 90;
export const winScore = 2;
export const eyeHeight = 1.62;
export const teams = [
  { name: '橙队', color: '#ff9b4e', spawn: { x: 0, z: 11.9, yaw: 0 }, goal: { x: 0, z: 12.1 } },
  { name: '蓝队', color: '#74d4ff', spawn: { x: 0, z: -11.9, yaw: Math.PI }, goal: { x: 0, z: -12.1 } },
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
];
export const shutter = { x: -6.99, z: 0, w: 2.3, d: 0.17, h: 2.7, kind: 'shutter' };
export const shutterMaxHP = 3;
export const perimeter = [-1, 1].flatMap(side => [
  { x: side * (bounds.x + .15), z: 0, w: .3, h: 3.1, d: 28 },
  { x: 0, z: side * (bounds.z + .15), w: 22.3, h: 3.1, d: .3 },
]);

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
