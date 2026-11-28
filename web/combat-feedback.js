import { defaultWeapon, getWeapon } from './weapons.js';

export function combatFeedback(snapshot, slot) {
  const player = snapshot.players[slot];
  const weapon = getWeapon(player.weapon) ?? getWeapon(defaultWeapon);
  const signals = [];
  for (const event of snapshot.events) {
    if (event.type === 'shot') {
      if (event.player === slot) signals.push(event.target == null ? 'shot' : 'hit');
      if (event.target === slot || event.impacts?.some(impact => impact.target === slot && impact.damage > 0)) signals.push('damage');
    }
    if (event.type === 'break') signals.push('break');
    if (event.player !== slot) continue;
    if (event.type === 'dash') signals.push('dash');
    if (event.type === 'drop') signals.push('drop');
    if (event.type === 'reload-start') signals.push(event.type);
    if (event.type === 'reload-complete') signals.push('reload');
    if (event.type === 'dry-fire') signals.push('empty');
    if (event.type === 'pickup') signals.push('pickup');
    if (event.type === 'score') signals.push(event.reason === 'delivery' ? 'delivery' : 'score');
  }
  return { type: 'combat', phase: snapshot.phase, ready: player.ready, hp: player.hp, dashWait: player.dashWait, ammo: player.ammo, reserve: player.reserve,
    reloading: player.reloading, weapon: weapon.id, weaponName: weapon.name, capacity: weapon.capacity, signals };
}
