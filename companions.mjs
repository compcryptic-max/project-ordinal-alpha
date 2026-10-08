const DURATION = 2 * 60 * 60 * 1000;
export function companionState(player, now = Date.now()) {
  player.companion ??= {name: 'Mossling', unlocked: false, expedition: null, completed: 0};
  const pet = player.companion;
  if (player.level >= 2) pet.unlocked = true;
  return {...pet, ready: !!pet.expedition && now >= pet.expedition.returnAt};
}
export function companionAction(player, action, now = Date.now()) {
  const view = companionState(player, now), pet = player.companion;
  if (!view.unlocked) throw Error('Reach level 2 to befriend a Mossling.');
  if (action === 'dispatch') {
    if (pet.expedition) throw Error('Your Mossling already has an expedition.');
    pet.expedition = {startedAt: now, returnAt: now + DURATION};
    return 'MOSSLING — gathering sanctuary supplies. Return in two hours; the app can be closed.';
  }
  if (action === 'claim') {
    if (!view.ready) throw Error('Your Mossling has not returned yet.');
    const tonic = player.inventory.find(item => item.id === 'potion');
    if ((tonic?.qty || 0) >= 20) throw Error('Use a tonic before collecting these supplies.');
    if (tonic) tonic.qty++; else player.inventory.push({id: 'potion', name: 'Wayfarer Tonic', rarity: 'Uncommon', qty: 1});
    player.gold += 12;
    pet.expedition = null;
    pet.completed++;
    return 'MOSSLING — brought back a tonic and 12 gold.';
  }
  throw Error('Unknown companion activity.');
}
