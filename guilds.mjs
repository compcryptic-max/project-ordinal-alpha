import {randomBytes} from 'node:crypto';

// Membership lives with the roster, so reconnects cannot produce stale player flags.
export function createGuildService(pool,{startDuel,loadPlayer,syncPlayer}={}) {
 let world={guilds:[]},tail=Promise.resolve();
 const ready=pool?pool.query("create table if not exists ordinal_guild_world (id integer primary key, payload jsonb not null)").then(()=>pool.query("insert into ordinal_guild_world(id,payload) values(1,'{\"guilds\":[]}') on conflict do nothing")):Promise.resolve();
 return async function guildRequest(player,action='',input={}) {
  let release;const previous=tail;tail=new Promise(r=>release=r);await previous;let client;
  try {
   await ready;
   if(pool){client=await pool.connect();await client.query('begin');const r=await client.query('select payload from ordinal_guild_world where id=1 for update');world=r.rows[0].payload;}
   const draft=structuredClone(world),guild=draft.guilds.find(g=>g.members.some(m=>m.key===player.key));
   draft.mystery??={solvers:{},artifacts:[],opened:false};
   let reward=null,changedPlayer=null;
   const otherPlayers=[];
   draft.market??=[];draft.contracts??=[];
   const integer=(value,min,max)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Choose a whole number between '+min+' and '+max+'.');return n;};
   const metric=(p,type)=>type==='hunt'?(p.stats?.kills||0):type==='discover'?(p.knownDiscoveries||[]).length:(p.activity?.totalFieldActions||0);
   const requirePeace=()=>{if(player.combat||player.pendingEncounter||player.pendingLoot||player.pendingChoice)throw Error('Resolve your encounter before using the exchange.');};
   draft.bounties??=[];draft.issued??={};
   draft.bounties=draft.bounties.filter(b=>Date.now()-b.createdAt<86400000);
   const member=guild?.members.find(m=>m.key===player.key);
   const requireGuild=()=>{if(!guild)throw Error('Join a guild first.');};
   const requireLeader=()=>{requireGuild();if(member.role!=='Leader')throw Error('Only the guild leader can do this.');};
   const requireSteward=()=>{requireGuild();if(!['Leader','Officer'].includes(member.role))throw Error('Only a guild leader or officer can do this.');};
   if(action==='list-item'){
    requirePeace();const price=integer(input.price,1,10000);
    const item=player.inventory.find(i=>i.id===String(input.item||'')&&i.power>0&&!i.qty);
    if(!item||player.equipment?.weapon===item.id)throw Error('Choose an unequipped relic to list.');
    if(draft.market.filter(l=>l.seller===player.key&&l.status==='open').length>=10)throw Error('You can list ten relics at a time.');
    changedPlayer=structuredClone(player);changedPlayer.inventory=changedPlayer.inventory.filter(i=>i.id!==item.id);
    const escrowItem=structuredClone(item);
    if(!escrowItem.id.startsWith('door-relic-')&&!escrowItem.id.startsWith('exchange-'))escrowItem.id='exchange-'+randomBytes(16).toString('hex');
    draft.market.push({id:randomBytes(12).toString('hex'),seller:player.key,name:player.name,price,item:escrowItem,status:'open'});
   }else if(action==='cancel-listing'){
    requirePeace();const listing=draft.market.find(l=>l.id===String(input.listing||'')&&l.seller===player.key&&l.status==='open');
    if(!listing)throw Error('Your open listing was not found.');listing.status='cancelled';changedPlayer=structuredClone(player);changedPlayer.inventory.push(listing.item);
   }else if(action==='buy-item'){
    requirePeace();const listing=draft.market.find(l=>l.id===String(input.listing||'')&&l.status==='open');
    if(!listing||listing.seller===player.key)throw Error('Choose an available relic from another Wayfarer.');
    if(player.gold<listing.price)throw Error('You do not have enough gold.');
    const seller=client?(await client.query('select payload from ordinal_players where player_key=$1 for update',[listing.seller])).rows[0]?.payload:await loadPlayer?.(listing.seller);
    if(!seller)throw Error('The seller’s account is unavailable. Your gold has not been charged.');
    const item=structuredClone(listing.item);item.history??=[];item.history.unshift('Passed from '+listing.name+' to '+player.name+' through the Wayfall Exchange.');item.history=item.history.slice(0,12);
    changedPlayer=structuredClone(player);changedPlayer.gold-=listing.price;changedPlayer.inventory.push(item);
    seller.gold+=listing.price;otherPlayers.push(seller);listing.status='sold';
    const artifact=draft.mystery.artifacts.find(a=>a.item===item.id);if(artifact){artifact.owner=player.key;artifact.name=player.name;}
   }else if(action==='post-contract'){
    requirePeace();const type=String(input.metric||'');if(!['hunt','discover','field'].includes(type))throw Error('Choose hunting, discovery or field work.');
    const target=integer(input.target,1,25),payment=integer(input.payment,5,500);
    if(player.gold<payment)throw Error('The reward must be funded before posting.');
    if(draft.contracts.filter(c=>c.owner===player.key&&['open','accepted'].includes(c.status)).length>=5)throw Error('You can fund five active contracts at a time.');
    changedPlayer=structuredClone(player);changedPlayer.gold-=payment;
    draft.contracts.push({id:randomBytes(12).toString('hex'),owner:player.key,name:player.name,type,target,payment,status:'open'});
   }else if(action==='accept-contract'){
    const contract=draft.contracts.find(c=>c.id===String(input.contract||'')&&c.status==='open'&&c.owner!==player.key);
    if(!contract)throw Error('Choose an open contract from another Wayfarer.');
    if(draft.contracts.filter(c=>c.worker===player.key&&c.status==='accepted').length>=3)throw Error('Finish or abandon an active contract first.');
    contract.status='accepted';contract.worker=player.key;contract.baseline=metric(player,contract.type);
   }else if(action==='claim-contract'){
    const contract=draft.contracts.find(c=>c.id===String(input.contract||'')&&c.status==='accepted'&&c.worker===player.key);
    if(!contract||metric(player,contract.type)-contract.baseline<contract.target)throw Error('Complete the new field work before claiming the reward.');
    contract.status='complete';changedPlayer=structuredClone(player);changedPlayer.gold+=contract.payment;
   }else if(action==='abandon-contract'){
    const contract=draft.contracts.find(c=>c.id===String(input.contract||'')&&c.status==='accepted'&&c.worker===player.key);
    if(!contract)throw Error('Your active contract was not found.');contract.status='open';delete contract.worker;delete contract.baseline;
   }else if(action==='cancel-contract'){
    const contract=draft.contracts.find(c=>c.id===String(input.contract||'')&&c.status==='open'&&c.owner===player.key);
    if(!contract)throw Error('Only an unaccepted contract can be cancelled.');contract.status='cancelled';changedPlayer=structuredClone(player);changedPlayer.gold+=contract.payment;
   }else if(action==='create-bounty'){
    const today=new Date().toISOString().slice(0,10);
    if(draft.issued[player.key]===today)throw Error('You can offer one voluntary Echo duel each day.');
    if(draft.bounties.some(b=>b.owner===player.key&&['open','accepted'].includes(b.status)))throw Error('Your Echo already has an active bounty.');
    draft.issued[player.key]=today;
    draft.bounties.push({id:randomBytes(12).toString('hex'),owner:player.key,name:player.name,origin:player.origin,level:player.level,maxHp:player.maxHp,status:'open',createdAt:Date.now()});
   }else if(action==='hunt-bounty'){
    if(!startDuel)throw Error('Echo arena is unavailable.');
    if(player.combat||player.pendingEncounter||player.pendingLoot||player.pendingChoice)throw Error('Resolve your encounter first.');
    const bounty=draft.bounties.find(b=>b.id===String(input.bounty||'')&&b.status==='open');
    if(!bounty||bounty.owner===player.key)throw Error('Choose another consenting Wayfarer’s Echo.');
    if(Math.abs((player.level||1)-bounty.level)>3)throw Error('This Echo is outside your arena level bracket.');
    bounty.status='accepted';bounty.challenger=player.key;
    changedPlayer=structuredClone(player);startDuel(changedPlayer,bounty);
   }else if(action==='claim-bounty'){
    const bounty=draft.bounties.find(b=>b.id===player.bountyVictory&&b.challenger===player.key&&b.status==='accepted');
    if(!bounty)throw Error('No verified arena victory to claim.');
    bounty.status='complete';changedPlayer=structuredClone(player);changedPlayer.gold+=20;changedPlayer.reputation+=2;changedPlayer.bountyVictory=null;
   }else if(action==='fail-bounty'){
    const bounty=draft.bounties.find(b=>b.id===String(input.bounty||'')&&b.challenger===player.key&&b.status==='accepted');
    if(!bounty)throw Error('No accepted arena challenge.');bounty.status='complete';
   }else if(action==='mystery'){
    const progress=draft.mystery.solvers[player.key]||0;
    if(progress>=3)throw Error('You have already unraveled this mystery.');
    const gates=[(player.knownDiscoveries||[]).length>=1,(player.stats?.kills||0)>=3,(player.journey?.chapter||1)>=2];
    if(!gates[progress])throw Error('Your field experience has not revealed this layer yet.');
    const answers=['echo','mercy','memory'];
    if(String(input.choice||'')!==answers[progress])throw Error('The door remains silent. Study the inscription again.');
    draft.mystery.solvers[player.key]=progress+1;
    if(progress===2){
     draft.mystery.opened=true;
     if(draft.mystery.artifacts.length<100){
      reward={id:'door-relic-'+randomBytes(12).toString('hex'),name:"Remembrance of the First Door",rarity:'Legendary',power:12,trait:'Prism Guard',history:['Recovered by '+player.name+' after unraveling the First Door.','One of a finite founding collection.']};
      draft.mystery.artifacts.push({owner:player.key,item:reward.id,name:player.name});
     }
    }
   }else if(action==='create'){
    if(guild)throw Error('Leave your current guild before founding another.');
    const name=String(input.name||'').trim();
    if(!/^[\p{L}\p{N} '\-]{3,32}$/u.test(name))throw Error('Use a guild name of 3–32 letters, numbers, spaces, apostrophes or hyphens.');
    if(draft.guilds.some(g=>g.name.toLowerCase()===name.toLowerCase()))throw Error('That guild name is already taken.');
    let code;do{code=randomBytes(6).toString('hex').toUpperCase();}while(draft.guilds.some(g=>g.code===code));
    draft.guilds.push({name,code,hallLevel:1,resources:0,renown:0,specialty:null,alliances:[],requests:[],members:[{key:player.key,name:player.name,role:'Leader'}],chronicle:['The guild founded its Town Hall.']});
   }else if(action==='join'){
    if(guild)throw Error('You already belong to a guild.');
    const target=draft.guilds.find(g=>g.code===String(input.code||'').trim().toUpperCase());
    if(!target)throw Error('Invitation not found.');
    if(target.members.length>=50)throw Error('This guild is full.');
    target.members.push({key:player.key,name:player.name,role:'Member'});target.chronicle.unshift(player.name+' joined the guild.');
   }else if(action==='contribute'){
    requireGuild();draft.contributions??={};
    const before=draft.contributions[player.key]||{kills:0,discoveries:0,contracts:0};
    const now={kills:player.stats?.kills||0,discoveries:(player.knownDiscoveries||[]).length,contracts:player.contracts?.completed||0};
    const gained={kills:Math.max(0,now.kills-before.kills),discoveries:Math.max(0,now.discoveries-before.discoveries),contracts:Math.max(0,now.contracts-before.contracts)};
    let amount=gained.kills+3*gained.discoveries+2*gained.contracts;
    if(guild.specialty==='Sentinels')amount+=gained.kills;
    if(guild.specialty==='Pathfinders')amount+=2*gained.discoveries;
    if(guild.specialty==='Artisans')amount+=2*gained.contracts;
    if(!amount)throw Error('Explore, hunt or finish contracts to bring something new to the Hall.');
    draft.contributions[player.key]={kills:Math.max(before.kills,now.kills),discoveries:Math.max(before.discoveries,now.discoveries),contracts:Math.max(before.contracts,now.contracts)};
    guild.resources=(guild.resources||0)+amount;guild.renown=(guild.renown||0)+amount;guild.chronicle.unshift(player.name+' brought field knowledge and supplies to the Hall.');
   }else if(action==='upgrade'){
    requireSteward();const cost=(guild.hallLevel||1)*25;
    if(guild.hallLevel>=5)throw Error('The Town Hall is fully restored.');
    if((guild.resources||0)<cost)throw Error('The next Hall restoration requires '+cost+' supplies.');
    guild.resources-=cost;guild.hallLevel++;guild.chronicle.unshift('The guild restored its Town Hall to level '+guild.hallLevel+'.');
   }else if(action==='specialize'){
    requireLeader();if((guild.hallLevel||1)<2)throw Error('Restore the Town Hall to level 2 before choosing a specialty.');
    const specialty=String(input.specialty||'');if(!['Pathfinders','Sentinels','Artisans'].includes(specialty))throw Error('Choose Pathfinders, Sentinels or Artisans.');
    if(guild.specialty===specialty)throw Error('That is already your Hall specialty.');
    if(guild.specialty){if((guild.resources||0)<25)throw Error('Changing a Hall specialty requires 25 supplies.');guild.resources-=25;}
    guild.specialty=specialty;guild.chronicle.unshift('The Town Hall became known as '+specialty+'.');
   }else if(action==='alliance'){
    requireLeader();const target=draft.guilds.find(g=>g.code===String(input.code||'').trim().toUpperCase());
    if(!target||target===guild)throw Error('Use another guild leader’s invitation.');
    target.requests??=[];guild.alliances??=[];
    if(guild.alliances.includes(target.code)||target.requests.includes(guild.code))throw Error('That alliance is already active or pending.');
    if(target.requests.length>=20)throw Error('That Hall has too many pending invitations.');
    target.requests.push(guild.code);
   }else if(action==='accept-alliance'){
    requireLeader();const target=draft.guilds.find(g=>g.name===String(input.name||''));
    if(!target||!(guild.requests||[]).includes(target.code))throw Error('Alliance invitation not found.');
    guild.alliances??=[];target.alliances??=[];
    guild.alliances.push(target.code);target.alliances.push(guild.code);guild.requests=guild.requests.filter(c=>c!==target.code);
    guild.chronicle.unshift('Alliance formed with '+target.name+'.');target.chronicle.unshift('Alliance formed with '+guild.name+'.');
   }else if(action==='leave'){
    requireGuild();
    if(member.role==='Leader'&&guild.members.length>1)throw Error('Transfer leadership before leaving.');
    guild.members=guild.members.filter(m=>m.key!==player.key);
    if(!guild.members.length)draft.guilds=draft.guilds.filter(g=>g!==guild);
    else guild.chronicle.unshift(player.name+' left the guild.');
   }else if(action==='transfer'){
    requireLeader();const target=guild.members.find(m=>m.key===String(input.member||''));
    if(!target||target===member)throw Error('Choose another guild member.');
    member.role='Member';target.role='Leader';guild.chronicle.unshift(target.name+' became guild leader.');
   }else if(action==='promote'){
    requireLeader();const target=guild.members.find(m=>m.key===String(input.member||''));
    if(!target||target.role!=='Member')throw Error('Choose a guild member to promote.');target.role='Officer';guild.chronicle.unshift(target.name+' became a guild officer.');
   }else if(action==='demote'){
    requireLeader();const target=guild.members.find(m=>m.key===String(input.member||''));
    if(!target||target.role!=='Officer')throw Error('Choose a guild officer to demote.');target.role='Member';guild.chronicle.unshift(target.name+' returned to member rank.');
   }else if(action)throw Error('Unknown guild action.');
   for(const g of draft.guilds)g.chronicle=g.chronicle.slice(0,30);
   const updatedPlayer=reward?{...player,inventory:[...player.inventory,reward]}:changedPlayer;
   if(client){
    if(action)await client.query('update ordinal_guild_world set payload=$1 where id=1',[JSON.stringify(draft)]);
    if(updatedPlayer)await client.query('update ordinal_players set payload=$1,updated_at=now() where player_key=$2',[JSON.stringify(updatedPlayer),player.key]);
    for(const other of otherPlayers)await client.query('update ordinal_players set payload=$1,updated_at=now() where player_key=$2',[JSON.stringify(other),other.key]);
    await client.query('commit');
   }
   if(updatedPlayer)Object.assign(player,updatedPlayer);
   if(updatedPlayer)syncPlayer?.(updatedPlayer);
   for(const other of otherPlayers)syncPlayer?.(other);
   world=draft;
   const current=world.guilds.find(g=>g.members.some(m=>m.key===player.key));
   const stage=world.mystery.solvers[player.key]||0;
   const prompts=[{prompt:'The first inscription reads: I answer without a mouth and return what you send into the dark.',options:['echo','flame','stone'],requirement:'Chart a hidden discovery.'},{prompt:'The wounded gatekeeper asks: What opens a path without breaking its guardian?',options:['force','mercy','silence'],requirement:'Defeat three hostiles.'},{prompt:'The final inscription reads: The world keeps what the traveler leaves behind. What lets a place remember?',options:['gold','speed','memory'],requirement:'Reach story chapter two.'}];
   const mystery={title:'The Door That Remembers',stage,complete:stage===3,opened:world.mystery.opened,layer:stage<3?prompts[stage]:null,artifact:world.mystery.artifacts.some(a=>a.owner===player.key)?'Remembrance of the First Door':null};
   const bounties=world.bounties.filter(b=>b.status==='open').slice(-20).map(b=>({bounty:b.id,name:b.name,origin:b.origin,level:b.level,own:b.owner===player.key}));
   const market=world.market.filter(l=>l.status==='open').slice(-100).map(l=>({listing:l.id,seller:l.name,price:l.price,item:l.item,own:l.seller===player.key}));
   const contracts=world.contracts.filter(c=>c.status==='open'||c.status==='accepted'&&(c.worker===player.key||c.owner===player.key)).slice(-100).map(c=>({contract:c.id,author:c.name,metric:c.type,target:c.target,payment:c.payment,status:c.status,own:c.owner===player.key,accepted:c.worker===player.key,progress:c.worker===player.key?Math.min(c.target,Math.max(0,metric(player,c.type)-c.baseline)):0}));
   if(!current)return {guild:null,persistent:!!pool,mystery,bounties,market,contracts};
   const me=current.members.find(m=>m.key===player.key);
   const guildNames=codes=>(codes||[]).map(c=>world.guilds.find(g=>g.code===c)?.name).filter(Boolean);
   const specialtyEffects={Pathfinders:'Discovery contributions bring +2 supplies.',Sentinels:'Hostile defeats bring +1 supply.',Artisans:'Completed contracts bring +2 supplies.'};
   return {persistent:!!pool,mystery,bounties,market,contracts,guild:{name:current.name,invitation:['Leader','Officer'].includes(me.role)?current.code:null,role:me.role,hallLevel:current.hallLevel,resources:current.resources||0,renown:current.renown||0,specialty:current.specialty||null,specialtyEffect:specialtyEffects[current.specialty]||'Restore Hall level 2 to choose a specialty.',alliances:guildNames(current.alliances),requests:me.role==='Leader'?guildNames(current.requests):[],chronicle:current.chronicle,members:current.members.map(m=>({name:m.name,role:m.role,member:me.role==='Leader'&&m.key!==player.key?m.key:null}))}};
  }catch(e){if(client)await client.query('rollback').catch(()=>{});throw e;}
  finally{client?.release();release();}
 };
}
