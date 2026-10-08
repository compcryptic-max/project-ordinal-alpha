export function reinforceWeapon(p) {
  const item=p.inventory.find(i=>i.id===p.equipment?.weapon);
  if (!item || !Number.isFinite(item.power) || item.power<=0) throw Error('Equip a weapon before reinforcing it.');
  const rank=item.reinforcements||0;
  if (!Number.isInteger(rank)||rank<0||rank>=3) throw Error('This weapon has reached its reinforcement limit.');
  const cost=25*(rank+1);
  if(p.gold<cost)throw Error(`Reinforcement costs ${cost} gold.`);
  p.gold-=cost;item.power+=2;item.reinforcements=rank+1;
  item.history??=[];item.history.push(`Reinforced by ${p.name} at the Sanctuary workbench.`);
  return `WORKBENCH — ${item.name} reinforced to Power ${item.power}.`;
}
