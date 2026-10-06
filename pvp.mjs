import {randomBytes,createHash} from 'node:crypto';

export function createArenaService(pool,{now=Date.now}={}) {
 let world={matches:[],records:{}},tail=Promise.resolve();
 const ready=pool?pool.query('create table if not exists ordinal_arena_world (id integer primary key,payload jsonb not null)').then(()=>pool.query("insert into ordinal_arena_world(id,payload) values(1,'{\"matches\":[],\"records\":{}}') on conflict do nothing")):Promise.resolve();
 const fighter=p=>({key:p.key,name:p.name,origin:p.origin,level:p.level,hp:100,focus:0,stamina:100,stance:'open',power:Math.min(8,Math.max(0,p.inventory.find(i=>i.id===p.equipment?.weapon)?.power||0))});
 return async (player,action='',input={})=>{
  let release;const before=tail;tail=new Promise(r=>release=r);await before;let client;
  try {
   await ready;if(pool){client=await pool.connect();await client.query('begin');world=(await client.query('select payload from ordinal_arena_world where id=1 for update')).rows[0].payload;}
   const draft=structuredClone(world);let dirty=false;
   const finish=(m,winner,reason)=>{
    m.status='complete';m.winner=winner;m.result=reason;m.revision++;dirty=true;
    for(const f of m.fighters){const r=draft.records[f.key]??={wins:0,losses:0,draws:0};if(!winner)r.draws++;else if(f.key===winner)r.wins++;else r.losses++;}
   };
   for(const m of draft.matches){
    if(m.status==='waiting'&&now()>m.deadline){m.status='cancelled';dirty=true;}
    else if(m.status==='active'&&now()>m.deadline)finish(m,m.fighters.find(f=>f.key!==m.turn).key,'Turn timed out.');
   }
   let match=[...draft.matches].reverse().find(m=>m.fighters.some(f=>f.key===player.key)&&['waiting','active'].includes(m.status));
   const peace=()=>{if(player.combat||player.pendingEncounter||player.pendingLoot||player.pendingChoice)throw Error('Resolve your Field encounter before entering PvP.');if(player.travel?.mode==='transit')throw Error('Enter the arena when you have stopped travelling.');};
   if(action==='create'){
    peace();if(match)throw Error('You already have an arena invitation or match.');
    let code;do{code=randomBytes(6).toString('hex').toUpperCase();}while(draft.matches.some(m=>m.code===code));
    match={code,status:'waiting',fighters:[fighter(player)],revision:0,deadline:now()+600000,createdAt:now(),events:['Private duel invitation created.']};draft.matches.push(match);dirty=true;
   }else if(action==='join'){
    peace();if(match)throw Error('Finish your current arena session first.');
    match=draft.matches.find(m=>m.code===String(input.code||'').trim().toUpperCase()&&m.status==='waiting');
    if(!match||match.fighters[0].key===player.key)throw Error('Valid invitation from another player required.');
    if(Math.abs(match.fighters[0].level-player.level)>3)throw Error('Duelists must be within three levels.');
    match.fighters.push(fighter(player));match.status='active';match.turn=match.fighters[0].key;match.deadline=now()+45000;match.revision=1;match.events.unshift(player.name+' accepted. Both players are now in the live arena.');dirty=true;
   }else if(action==='cancel'){
    if(!match||match.status!=='waiting')throw Error('No waiting invitation to cancel.');match.status='cancelled';dirty=true;
   }else if(action==='forfeit'){
    if(!match||match.status!=='active')throw Error('No active match to leave.');finish(match,match.fighters.find(f=>f.key!==player.key).key,player.name+' forfeited.');
   }else if(action==='move'){
    if(!match||match.status!=='active')throw Error('No active duel.');
    if(match.turn!==player.key)throw Error('Wait for the other player’s move.');
    if(input.revision!==match.revision)throw Error('The match has advanced. Refresh before choosing your move.');
    const move=String(input.move||'');if(!['attack','guard','dodge','skill'].includes(move))throw Error('Choose attack, guard, evade or skill.');
    const me=match.fighters.find(f=>f.key===player.key),foe=match.fighters.find(f=>f.key!==player.key);
    let damage=0;
    if(move==='skill'){
     if(me.focus<40||me.stamina<20)throw Error('Skill requires 40 Focus and 20 stamina.');me.focus-=40;me.stamina-=20;damage=27+me.power;
    }else if(move==='attack'){
     if(me.stamina<10)throw Error('Guard to recover stamina.');me.stamina-=10;me.focus=Math.min(100,me.focus+12);damage=12+me.power;
    }else if(move==='guard'){me.stance='guard';me.stamina=Math.min(100,me.stamina+25);me.focus=Math.min(100,me.focus+18);}
    else {if(me.stamina<20)throw Error('Evading requires 20 stamina.');me.stamina-=20;me.stance='dodge';me.focus=Math.min(100,me.focus+12);}
    if(damage){
     if(foe.stance==='guard')damage=Math.max(1,Math.round(damage*(foe.origin==='Vanguard'?.30:.40)));
     if(foe.stance==='dodge'){const roll=parseInt(createHash('sha256').update(match.code+':'+match.revision).digest('hex').slice(0,8),16)%100;if(roll<(foe.origin==='Rogue'?65:55))damage=0;}
     foe.stance='open';foe.hp=Math.max(0,foe.hp-damage);foe.focus=Math.min(100,foe.focus+8);
    }
    me.stamina=Math.min(100,me.stamina+8);match.events.unshift(me.name+' used '+move+(damage?' for '+damage+' damage.':'.'));match.events=match.events.slice(0,12);match.revision++;dirty=true;
    if(foe.hp===0)finish(match,me.key,me.name+' won the duel.');
    else if(match.revision>=100)finish(match,null,'The duel ended in a draw.');
    else {match.turn=foe.key;match.deadline=now()+45000;}
   }else if(action)throw Error('Unknown arena action.');
   if(client){if(dirty)await client.query('update ordinal_arena_world set payload=$1 where id=1',[JSON.stringify(draft)]);await client.query('commit');}world=draft;
   match=match||[...world.matches].reverse().find(m=>m.fighters.some(f=>f.key===player.key));
   const me=match?.fighters.find(f=>f.key===player.key),foe=match?.fighters.find(f=>f.key!==player.key);
   return {record:world.records[player.key]||{wins:0,losses:0,draws:0},match:match?{status:match.status,invitation:match.status==='waiting'?match.code:null,revision:match.revision,yourTurn:match.turn===player.key,secondsLeft:Math.max(0,Math.ceil((match.deadline-now())/1000)),you:me?(({key,...f})=>f)(me):null,opponent:foe?(({key,...f})=>f)(foe):null,result:match.result||null,won:match.winner===player.key,events:match.events}:null};
  }catch(e){if(client)await client.query('rollback').catch(()=>{});throw e;}
  finally{client?.release();release();}
 };
}
