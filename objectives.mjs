export function nextObjective(p) {
  const step=(id,title,detail,action,choice=null,type=null)=>({id,title,detail,action,choice,type});
  if (p.combat) return step('fight','Read the enemy intent','Guard heavy attacks, build Focus, then use your skill.','combat');
  if (p.pendingEncounter) return step('encounter','Inspect the encounter','Read its threat before deciding whether to fight.','engage');
  if (p.pendingLoot) return step('loot','Recover your relic','Take the reward before returning to exploration.','loot');
  if (p.pendingChoice) return step('choice','Resolve the shrine','Choose how this discovery changes the region.','choice');
  if (!p.home?.npc?.lastVisitDay) return step('keeper','Meet the Wayfall Keeper','Visit Sanctuary and answer Sera. Your decision is remembered.','keeper','help');
  if (!(p.stats?.kills > 0)) return step('first-hunt','Break your first hostile signal','Track a signal from home or the Field. Defeat the creature to earn your first title.','investigate');
  if (!(p.stats?.relics > 0)) return step('first-relic','Find your first relic','Continue investigating signals and recover the loot from a victorious encounter.','investigate');
  if (!p.equipment?.weapon || p.equipment.weapon === 'starter') return step('equip','Equip a recovered weapon','Open Gear and compare weapon power before equipping a relic.','inventory');
  if (!(p.home?.investigations > 0)) return step('archive','Follow the archive thread','Trace a Sanctuary signal. Your story can progress without traveling.','home',null,'investigate');
  return step('journey','Continue your personal thread','Complete your Journey directive, develop your Calling, or investigate another signal.','journal');
}
