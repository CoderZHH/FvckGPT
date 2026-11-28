export const defaultWeapon = 'carbine';

const center = Object.freeze([0, 0]);
const singleBolt = Object.freeze([center]);
const scatterFan = Object.freeze([
  center, Object.freeze([-.05, .012]), Object.freeze([.05, .012]),
  Object.freeze([-.024, -.036]), Object.freeze([.024, -.036]),
]);

export const weapons = Object.freeze({
  carbine: Object.freeze({
    id: 'carbine', name: '电弧卡宾', capacity: 24, reserve: 72, damage: 25,
    cooldown: .20, reloadSeconds: 1.25, range: 24, fullDamageRange: 16, rays: singleBolt,
  }),
  scatter: Object.freeze({
    id: 'scatter', name: '裂片散射器', capacity: 5, reserve: 15, damage: 75,
    cooldown: .65, reloadSeconds: 1.6, range: 12, fullDamageRange: 3.5, rays: scatterFan,
  }),
  pulse: Object.freeze({
    id: 'pulse', name: '重脉冲器', capacity: 8, reserve: 24, damage: 38,
    cooldown: .42, reloadSeconds: 1.85, range: 52, fullDamageRange: 52, rays: singleBolt,
  }),
});

export function getWeapon(id) {
  return typeof id === 'string' && Object.hasOwn(weapons, id) ? weapons[id] : undefined;
}
