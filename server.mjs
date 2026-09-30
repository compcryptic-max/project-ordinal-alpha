import http from "node:http";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {randomUUID,createHash} from "node:crypto";

const PORT=Number(process.env.PORT||8787);
const DB=process.env.DATABASE_URL||"";
const pool=DB?new Pool({connectionString:DB,ssl:{rejectUnauthorized:false},max:5}):null;
const memory=new Map(),regions=new Map();
if(pool){
 await pool.query("create table if not exists ordinal_players (player_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
 await pool.query("create table if not exists ordinal_regions (region_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
}
const origins={
 Vanguard:{hp:125,skill:"Shield Break",weapon:"Iron Longsword"},
 Ranger:{hp:105,skill:"Piercing Shot",weapon:"Ashwood Bow"},
 Arcanist:{hp:90,skill:"Rift Spark",weapon:"Glasswood Staff"},
 Rogue:{hp:100,skill:"Veil Strike",weapon:"Twin Knives"}
};
const names=["Ashen Reach","Hollow Meridian","Glassward","Ember Vale","Dusk March"];
const rumors=[
 ["HUNT","Something has been following travelers after sunset.","Pale Hound"],
 ["DISCOVERY","A buried signal repeats beneath the old roads.","Glass Warden"],
 ["MYSTERY","Black glass has appeared where no structure stood yesterday.","Veil Stalker"],
 ["RESCUE","A Wayfall scout vanished while tracing a corrupted trail.","Hollow Marauder"]
];
const clone=x=>structuredClone(x);
const hash=s=>parseInt(createHash("sha256").update(String(s)).digest("hex").slice(0,8),16);
function regionFrom(lat,lon){
 if(Number.isFinite(lat)&&Number.isFinite(lon)){
  const a=Math.floor(lat*90),b=Math.floor(lon*90),key="c1200:"+a+":"+b,h=hash(key);
  return {key,name:names[h%names.length],source:"coarse-location"};
 }
 return {key:"demo-region",name:"Ashen Reach",source:"demo"};
}
function freshRegion(region){return {key:region.key,name:region.name,day:1,stage:"Unsettled",faction:"Wayfall Compact",corruption:37,order:48,prosperity:55,threat:31,ecology:{predators:42,prey:61,anomalies:18},nemesis:null,history:[],discoveries:[]}}
function utcDay(){return new Date().toISOString().slice(0,10)}
function ensureActivity(p){
 const today=utcDay();
 p.activity??={date:today,streak:0,lastCheckin:null,collected:[],dailyScore:0,totalFieldActions:0};
 if(p.activity.date!==today){p.activity.date=today;p.activity.collected=[];p.activity.dailyScore=0;}
 return p.activity;
}
function ordinalRating(p){return Math.max(100,Math.round(100+(p.level-1)*85+p.reputation*14+(p.mastery?.rank||1)*28+(p.activity?.totalFieldActions||0)*3))}
function fieldState(p){
 const a=ensureActivity(p),slot=Math.floor(Date.now()/1200000),seed=hash(p.region.key+":"+slot);
 const types=[
  {kind:"signal",label:p.rumor?.title||"Unresolved Signal",detail:"An active distortion is moving through this sector.",reward:"ENCOUNTER",action:"investigate"},
  {kind:"cache",label:"Veil Cache",detail:"A short-lived field cache surfaced nearby.",reward:"+12 XP · +6G",action:"collect"},
  {kind:"echo",label:"Memory Echo",detail:"Residual world data can be recovered here.",reward:"+1 REP · +8 XP",action:"collect"},
  {kind:"resource",label:"Aether Trace",detail:"A weak trace is stable enough to recover.",reward:"+10 XP",action:"collect"},
  {kind:"event",label:p.region.threat>50?"Threat Surge":"World Pulse",detail:p.region.threat>50?"Hostile pressure is rising in this sector.":"The region is briefly resonating.",reward:"+2 REP · +10 XP",action:"collect"}
 ];
 const pos=[[52,35],[27,58],[73,62],[37,23],[82,31]];
 return types.map((n,i)=>{const id="f:"+p.region.key+":"+slot+":"+i;return {...n,id,x:Math.max(12,Math.min(88,pos[i][0]+((seed>>(i*4))%9)-4)),y:Math.max(15,Math.min(82,pos[i][1]+((seed>>(i*3+2))%9)-4)),distance:90+((seed>>(i*5))%620),collected:a.collected.includes(id),expiresIn:1200-(Math.floor(Date.now()/1000)%1200)}});
}
function fieldCollect(p,id){
 const a=ensureActivity(p),node=fieldState(p).find(n=>n.id===id);
 if(!node||node.action!=="collect"||node.collected)return;
 a.collected.push(id);a.totalFieldActions++;a.dailyScore++;journeyAction(p,"field",1);
 if(node.kind==="cache"){p.gold+=6;level(p,12);if((hash(p.key+id)%100)<28){let pot=p.inventory.find(i=>i.id==="potion");if(pot)pot.qty=(pot.qty||0)+1;else p.inventory.push({id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:1});addFeed(p,"CACHE BONUS — Wayfarer Tonic recovered.");}}
 else if(node.kind==="echo"){p.reputation+=1;level(p,8);}
 else if(node.kind==="event"){p.reputation+=2;level(p,10);p.region.threat=Math.max(5,p.region.threat-1);}
 else level(p,10);
 addFeed(p,"FIELD RECOVERY — "+node.label+" secured.");
}
function roam(p){
 if(p.combat||p.pendingChoice)return;
 const a=ensureActivity(p),now=Date.now(),wait=12000-(now-(a.lastRoamAt||0));
 if(wait>0){addFeed(p,"DEEP SCAN — signal resolving. "+Math.ceil(wait/1000)+"s.");return;}
 a.lastRoamAt=now;a.roams++;a.totalFieldActions++;
 const roll=hash(p.key+":"+a.roams+":"+Math.floor(now/12000))%100;
 if(roll<58){
  if(!p.rumor)newRumor(p);investigate(p);addFeed(p,"DEEP SCAN — a roaming hostile answered your signal.");
 }else{
  const finds=["Veil residue","Broken waypoint","Forgotten inscription","Aether bloom","Unregistered footprint"];
  const found=finds[roll%finds.length];level(p,6);journeyAction(p,"field",1);p.contracts.field++;a.dailyScore++;
  if(roll>90)p.reputation+=1;
  addFeed(p,"DEEP SCAN — "+found+" recovered. The trail continues.");
 }
}
function checkin(p){
 const a=ensureActivity(p),today=utcDay();
 if(a.lastCheckin===today){addFeed(p,"DAILY SYNC — already completed today.");return;}
 const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 a.streak=a.lastCheckin===yesterday?(a.streak||0)+1:1;a.lastCheckin=today;a.dailyScore++;a.totalFieldActions++;journeyAction(p,"any",1);
 p.gold+=5;level(p,10+Math.min(20,a.streak*2));addFeed(p,"DAILY SYNC — streak "+a.streak+". Field bonus received.");
}
function ensureJourney(p){
 if(!p.journey){
  const h=hash(p.key),omens=["The Signal That Knows Your Name","Ash Beneath the Glass","The Door Between Footsteps","A Voice Beyond the Veil","The Unmarked Frequency"],motives=["Find what is calling to you.","Learn why the Veil reacts to your presence.","Trace a disappearance no one else remembers.","Discover who altered your first memory.","Reach the source before another Wayfarer does."];
  p.journey={title:omens[h%omens.length],hook:motives[(h>>3)%motives.length],chapter:1,progress:0,next:8,beats:[],calling:null,callingProgress:0,callingTier:1};
 }
 p.contracts??={field:0,hunts:0,discoveries:0,completed:0};
 return p.journey;
}
const callings={
 hunter:{name:"Hunter",desc:"Track dangerous entities and become known for what you can defeat.",metric:"hunt"},
 seeker:{name:"Seeker",desc:"Chase signals, recoveries and discoveries hidden in the field.",metric:"field"},
 warden:{name:"Warden",desc:"Stabilize regions and build a reputation for protecting them.",metric:"protect"},
 wayfarer:{name:"Wayfarer",desc:"Grow through a mixture of combat, exploration and field activity.",metric:"any"}
};
function journeyAction(p,type,amount=1){
 const j=ensureJourney(p);amount=Math.max(1,Number(amount)||1);
 j.progress+=amount;
 const c=callings[j.calling];
 if(c&&(c.metric===type||c.metric==="any"||(c.metric==="protect"&&["hunt","field"].includes(type))))j.callingProgress+=amount;
 if(type==="field")p.contracts.field+=amount;if(type==="hunt")p.contracts.hunts+=amount;if(type==="discover")p.contracts.discoveries+=amount;
 if(j.progress>=j.next){
  j.progress-=j.next;j.chapter++;j.next=Math.min(30,8+j.chapter*3);
  const beats=["A fragment addressed you by name.","Your signal appeared in a record older than your arrival.","A second presence answered your frequency.","The trail split toward something the region refuses to map.","Someone else has begun following your trail."];
  const beat=beats[(hash(p.key+":"+j.chapter))%beats.length];j.beats.unshift("CHAPTER "+j.chapter+" — "+beat);j.beats=j.beats.slice(0,8);p.reputation+=2;level(p,20+j.chapter*2);addFeed(p,"STORY THREAD — "+beat);
 }
 if(c){
  const target=8+j.callingTier*7;
  if(j.callingProgress>=target){j.callingProgress-=target;j.callingTier++;p.reputation+=3;p.gold+=20+j.callingTier*5;level(p,25);addFeed(p,c.name.toUpperCase()+" GOAL — Tier "+j.callingTier+" reached.");}
 }
}
function chooseCalling(p,id){
 ensureJourney(p);if(!callings[id])return;
 p.journey.calling=id;p.journey.callingProgress=0;addFeed(p,"CALLING CHOSEN — "+callings[id].name+". This can be changed later without resetting your story.");
}
function contractState(p){
 ensureJourney(p);
 return [
  {id:"field",name:"Field Recovery",desc:"Recover activity from the live field.",value:p.contracts.field,target:5,reward:"15 XP · 10G"},
  {id:"hunts",name:"Threat Sweep",desc:"Defeat entities. Repeatable for long sessions.",value:p.contracts.hunts,target:3,reward:"25 XP · 14G"},
  {id:"discoveries",name:"Unmapped",desc:"Chart discoveries and strange places.",value:p.contracts.discoveries,target:2,reward:"20 XP · 12G"}
 ];
}
function claimContract(p,id){
 ensureJourney(p);const cfg={field:[5,15,10],hunts:[3,25,14],discoveries:[2,20,12]}[id];if(!cfg)return;
 const key=id,value=p.contracts[key]||0;if(value<cfg[0]){addFeed(p,"CONTRACT — requirements not met.");return;}
 p.contracts[key]-=cfg[0];p.contracts.completed++;level(p,cfg[1]);p.gold+=cfg[2];p.reputation+=1;addFeed(p,"CONTRACT COMPLETE — reward secured. Another cycle is immediately available.");
}
function freshPlayer(key,name,origin,region){
 const o=origins[origin]||origins.Rogue;
 return {key,name:String(name||"Wayfarer").slice(0,18),origin:origins[origin]?origin:"Rogue",level:1,xp:0,xpNeeded:100,gold:35,hp:o.hp,maxHp:o.hp,skill:o.skill,inventory:[{id:"starter",name:o.weapon,rarity:"Common",power:2,trait:"Wayfarer Issue"},{id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:2}],equipment:{weapon:"starter"},mastery:{rank:1,xp:0,next:25,name:"Unproven"},travel:{mode:"explore",lastChangeAt:0,changes:0},titles:[],reputation:0,activity:{date:utcDay(),streak:0,lastCheckin:null,collected:[],dailyScore:0,totalFieldActions:0},journey:null,contracts:{field:0,hunts:0,discoveries:0,completed:0},region:freshRegion(region),rumor:null,combat:null,pendingLoot:null,pendingChoice:null,feed:[{text:"You entered "+region.name+". The region was already moving before you arrived."}]};
}
async function load(key){
 if(pool){const {rows}=await pool.query("select payload from ordinal_players where player_key=$1",[key]);return rows[0]?.payload||null;}
 return memory.get(key)||null;
}
async function loadRegion(key){
 if(pool){const {rows}=await pool.query("select payload from ordinal_regions where region_key=$1",[key]);return rows[0]?.payload||null;}
 return regions.get(key)||null;
}
async function saveRegion(r){
 regions.set(r.key,r);
 if(pool)await pool.query("insert into ordinal_regions(region_key,payload,updated_at) values($1,$2::jsonb,now()) on conflict(region_key) do update set payload=excluded.payload,updated_at=now()",[r.key,JSON.stringify(r)]);
}
async function save(p){
 await saveRegion(p.region);
 if(pool)await pool.query("insert into ordinal_players(player_key,payload,updated_at) values($1,$2::jsonb,now()) on conflict(player_key) do update set payload=excluded.payload,updated_at=now()",[p.key,JSON.stringify(p)]);
 else memory.set(p.key,clone(p));
}
function addFeed(p,text){p.feed.unshift({text});p.feed=p.feed.slice(0,25);}
function level(p,amount){
 p.xp+=amount;
 while(p.xp>=p.xpNeeded){p.xp-=p.xpNeeded;p.level++;p.xpNeeded=Math.round(p.xpNeeded*1.25);p.maxHp+=8;p.hp=p.maxHp;addFeed(p,"LEVEL UP — You reached level "+p.level+".");}
}
function newRumor(p){
 const r=rumors[(p.region.day+hash(p.region.key))%rumors.length];
 p.rumor={type:r[0],body:r[1],enemy:r[2],title:r[0]==="HUNT"?"Tracks in the Dust":r[0]==="DISCOVERY"?"Signal Under Glass":r[0]==="MYSTERY"?"The Unwritten Shrine":"Missing at Wayfall"};
 addFeed(p,"RUMOR — "+p.rumor.title);
}
function investigate(p){
 if(!p.rumor)newRumor(p);
 const boss=(p.region.nemesis&&p.region.day%3===0)?p.region.nemesis.name:p.rumor.enemy,first=!p.region.discoveries.includes("glass-shrine");
 if(first){p.region.discoveries.push("glass-shrine");p.region.history.unshift(p.name+" discovered the Glass Shrine.");addFeed(p,"FIRST DISCOVERY — Glass Shrine.");}
 const nem=p.region.nemesis?.name===boss?p.region.nemesis.power:0,hp=Math.round(78+p.level*16+p.region.threat*.3+nem*20);
 p.combat={name:boss,hp,maxHp:hp,nemesisPower:nem,turn:1,intent:"The enemy circles for an opening.",stamina:100,focus:0,lastResult:"Encounter started.",phase:1};
 addFeed(p,boss+" emerged from the distortion.");
}
function addMastery(p,amount){
 p.mastery??={rank:1,xp:0,next:25,name:"Unproven"};p.mastery.xp+=amount;
 while(p.mastery.xp>=p.mastery.next){p.mastery.xp-=p.mastery.next;p.mastery.rank++;p.mastery.next=Math.round(p.mastery.next*1.45);p.mastery.name=p.mastery.rank>=6?"Weapon Savant":p.mastery.rank>=4?"Adept":p.mastery.rank>=2?"Initiate":"Unproven";addFeed(p,"MASTERY RANK "+p.mastery.rank+" — "+p.mastery.name+".");}
}
function enemyIntent(c){
 const n=c.name,t=c.turn;
 if(/Pale Hound/i.test(n))return t%3===0?"HEAVY POUNCE — EVADE or time a GUARD.":"The Hound circles, testing your flank.";
 if(/Glass Warden/i.test(n))return t%4===0?"HEAVY PRISM BREAK — GUARD to shatter its rhythm.":"Glass plates rotate toward you.";
 if(/Veil Stalker/i.test(n))return t%3===0?"HEAVY VEIL STEP — EVADE before it rematerializes.":"Its outline disappears between shadows.";
 if(/Hollow Marauder/i.test(n))return t%3===0?"HEAVY EXECUTION CLEAVE — GUARD or EVADE.":"The Marauder drags its weapon into position.";
 return t%3===0?"HEAVY ATTACK TELEGRAPHED — GUARD OR EVADE.":"The enemy searches for an opening.";
}
function weaponPower(p){const w=p.inventory.find(i=>i.id===p.equipment?.weapon);return Number(w?.power||0)}
function combatProfile(p){
 const rank=p.mastery?.rank||1,w=Math.max(0,weaponPower(p));
 return {
  attack:10+p.level*2+Math.round(w*.65)+rank,
  skill:22+p.level*3+Math.round(w*.8)+rank*2,
  guard:p.origin==="Vanguard"?.08:0,
  evade:p.origin==="Rogue"?.10:0,
  skillCost:p.origin==="Arcanist"?32:38,
  crit:p.origin==="Ranger"?.12:0
 };
}
function fight(p,type){
 const c=p.combat;if(!c)return;
 c.stamina??=100;c.focus??=0;c.phase??=1;c.flow??=0;c.lastAction??="";
 if(type==="retreat"){p.combat=null;p.region.threat=Math.min(100,p.region.threat+1);addFeed(p,"WITHDRAWAL — You escaped the encounter. The threat remains in the region.");return;}
 const profile=combatProfile(p),heavy=/HEAVY/.test(c.intent),repeat=c.lastAction===type;
 c.flow=Math.max(0,Math.min(5,repeat?c.flow-1:c.flow+1));c.lastAction=type;
 const flowMult=1+c.flow*.04;
 let dmg=0,mitigation=0,evaded=false,acted=true,counter=0;
 if(type==="potion"){
  const pot=p.inventory.find(i=>i.id==="potion"&&(i.qty||0)>0);
  if(pot){pot.qty--;const heal=Math.max(28,Math.round(p.maxHp*.32));p.hp=Math.min(p.maxHp,p.hp+heal);c.lastResult="Tonic restored "+heal+" vitality, but using it leaves you exposed.";addFeed(p,"You used a Wayfarer Tonic.");}
  else {c.lastResult="No tonics remain.";acted=false;}
 } else if(type==="dodge"){
  if(c.stamina<24){c.lastResult="Not enough stamina to evade.";return;}
  c.stamina-=24;
  const chance=Math.min(.96,(heavy?.82:.58)+profile.evade);
  evaded=(hash(p.key+":"+c.turn+":"+c.name)%100)<Math.round(chance*100);
  mitigation=evaded?1:.18;c.focus=Math.min(100,c.focus+(heavy?14:8));
  if(evaded){addMastery(p,heavy?3:2);if(heavy){counter=4+p.level;c.lastResult="PERFECT EVADE — you slip the telegraph and punish the opening.";}}
  if(!c.lastResult)c.lastResult=evaded?"Evade successful — attack avoided.":"The enemy tracks your evade; the hit is softened, not avoided.";
  addFeed(p,c.lastResult);
 } else if(type==="guard"){
  mitigation=Math.min(.88,(heavy?.74:.52)+profile.guard);c.stamina=Math.min(100,c.stamina+(heavy?15:11));c.focus=Math.min(100,c.focus+(heavy?13:9)+(p.origin==="Vanguard"?3:0));
  if(heavy){counter=3+Math.ceil(p.level*.7);addMastery(p,3);c.lastResult="PERFECT GUARD — impact broken. Counter window opened.";}else{addMastery(p,1);c.lastResult="Guarded the incoming strike.";}
  addFeed(p,c.lastResult);
 } else if(type==="skill"){
  if(c.focus<profile.skillCost){c.lastResult="Build Focus before using "+p.skill+".";return;}
  if(c.stamina<12){c.lastResult="Not enough stamina to execute your skill.";return;}
  c.focus-=profile.skillCost;c.stamina-=12;dmg=Math.round(profile.skill*flowMult*(p.origin==="Arcanist"?1.1:1));addMastery(p,3);
  c.lastResult=p.skill+" breaks through for "+dmg+" damage.";addFeed(p,c.lastResult);
 } else {
  if(c.stamina<8){c.lastResult="You are exhausted. Guard to recover stamina.";return;}
  c.stamina-=8;c.focus=Math.min(100,c.focus+16);dmg=Math.round(profile.attack*flowMult);
  const crit=(hash(p.key+":crit:"+c.turn+":"+c.name)%100)<Math.round(profile.crit*100);
  if(crit){dmg=Math.round(dmg*1.45);c.lastResult="PRECISION STRIKE — "+dmg+" damage.";}else c.lastResult="Weapon strike dealt "+dmg+" damage.";
  addMastery(p,1);addFeed(p,c.lastResult);
 }
 if(!acted)return;
 if(counter)dmg+=counter;
 if(dmg)c.hp=Math.max(0,c.hp-dmg);
 if(c.hp<=Math.ceil(c.maxHp*.45)&&c.phase===1){c.phase=2;c.lastResult+=" The enemy enters a desperate second phase.";addFeed(p,c.name+" entered PHASE II.");}
 if(c.hp<=0){
  const enemy=c.name,nemesisKill=c.nemesisPower>0;p.combat=null;p.gold+=24+p.level*3+(nemesisKill?c.nemesisPower*18:0);level(p,42+(nemesisKill?20:0));p.reputation+=2+(nemesisKill?2:0);if(nemesisKill){p.region.history.unshift(p.name+" ended the Nemesis "+enemy+" after "+p.region.nemesis.victories+" recorded victory.");p.region.nemesis=null;}
  const rare=(hash(p.key+enemy+p.region.day)%100)<18;
  p.pendingLoot={id:"loot-"+Date.now(),name:enemy==="Pale Hound"?(rare?"Pale Moon Edge":"Moon-Split Fang"):(rare?"Warden's Glassheart":"Veilbound Fragment"),rarity:rare?"Epic":"Rare",source:enemy,power:4+Math.ceil(p.level*1.35)+(rare?4:0),trait:enemy==="Pale Hound"?"Predator's Tempo":enemy==="Glass Warden"?"Prism Guard":enemy==="Veil Stalker"?"Veilstep":enemy==="Hollow Marauder"?"Executioner":"Veil-Touched"};
  p.pendingChoice=null;p.region.history.unshift(p.name+" defeated "+enemy+".");journeyAction(p,"hunt",2);addFeed(p,enemy+" fell. Something remains in the Veil.");return;
 }
 let incoming=(heavy?18:9)+p.level*1.15+p.region.threat/15+(c.phase===2?3:0)+(c.nemesisPower||0)*2;
 if(/Marauder/i.test(c.name))incoming+=3;if(/Hound/i.test(c.name)&&heavy)incoming+=2;
 // Healing consumes a real turn. Skills and attacks are strongest when used outside obvious heavy telegraphs.
 if(type==="potion")mitigation=.15;
 if(evaded)incoming=0;else incoming*=1-mitigation;
 p.hp=Math.max(0,Math.round(p.hp-incoming));
 // Prevent a single unlucky normal hit from deleting a healthy player; heavy telegraphs remain dangerous.
 if(!heavy&&p.hp===0&&incoming<p.maxHp*.55)p.hp=1;
 c.stamina=Math.min(100,c.stamina+6);
 c.turn++;c.intent=enemyIntent(c);if(c.phase===2&&!/HEAVY/.test(c.intent))c.intent+=" Phase II pressure is rising.";
 if(p.hp<=0){
  const killer=c.name,n=p.region.nemesis;
  p.region.nemesis=n&&n.name===killer?{...n,power:n.power+1,victories:n.victories+1}:{name:killer,power:1,victories:1,lastDefeated:p.name};
  p.hp=Math.ceil(p.maxHp*.55);p.combat=null;p.region.threat=Math.min(100,p.region.threat+4);p.region.history.unshift(killer+" became a regional Nemesis after defeating "+p.name+".");addFeed(p,"DEATH ECHO — "+killer+" remembers you. It has grown stronger.");
 }
}
function evolveRegion(p){
 const r=p.region,old=r.stage;
 r.ecology??={predators:42,prey:61,anomalies:18};
 r.ecology.predators=Math.max(5,Math.min(95,r.ecology.predators+(r.threat>50?2:-1)));
 r.ecology.prey=Math.max(5,Math.min(95,r.ecology.prey+(r.ecology.predators>60?-2:1)));
 r.ecology.anomalies=Math.max(0,Math.min(100,r.ecology.anomalies+(r.corruption>50?2:-1)));
 r.stage=r.corruption>=65?"Veil-Touched":r.threat>=60?"Besieged":r.order>=65?"Fortified":r.prosperity>=70?"Flourishing":"Unsettled";
 if(old!==r.stage){r.history.unshift("REGION SHIFT — "+r.name+" became "+r.stage+".");addFeed(p,"WORLD SHIFT — "+r.name+" is now "+r.stage+".");}
 r.history=r.history.slice(0,40);
}
function equipItem(p,id){
 const item=p.inventory.find(i=>i.id===id&&Number.isFinite(Number(i.power)));if(!item)return;
 p.equipment.weapon=item.id;addFeed(p,"EQUIPPED — "+item.name+" · Power "+item.power+".");
}
function claimLoot(p){
 if(!p.pendingLoot)return;
 p.inventory.push(p.pendingLoot);addFeed(p,"RELIC ACQUIRED — "+p.pendingLoot.name+".");p.pendingLoot=null;p.pendingChoice="glass-shrine";
}
function shrine(p,choice){
 if(p.pendingChoice!=="glass-shrine")return;
 if(choice==="cleanse"){p.region.corruption=Math.max(0,p.region.corruption-9);p.region.order=Math.min(100,p.region.order+6);p.region.history.unshift(p.name+" cleansed the Glass Shrine.");addFeed(p,"The shrine clears. Order strengthens.");}
 else {p.region.corruption=Math.min(100,p.region.corruption+7);p.region.threat=Math.min(100,p.region.threat+5);p.gold+=40;p.region.history.unshift(p.name+" bound the Glass Shrine.");addFeed(p,"You bind the shrine and take its power.");}
 p.pendingChoice=null;p.rumor=null;evolveRegion(p);
}
function scout(p){
 if(p.combat||p.pendingChoice)return;
 p.region.discoveries??=[];
 if(p.lastScoutDay===p.region.day){addFeed(p,"SCOUTING — You have already charted what you can today.");return;}
 const sites=[["sunken-road","Sunken Road"],["veil-scar","Veil Scar"],["old-watch","Old Watch"]];
 const next=sites.find(([id])=>!p.region.discoveries.includes(id));
 if(!next){addFeed(p,"CARTOGRAPHY — Every known landmark in this region is charted.");return;}
 p.region.discoveries.push(next[0]);p.lastScoutDay=p.region.day;p.reputation+=1;level(p,12);journeyAction(p,"discover",2);
 p.region.history.unshift(p.name+" charted "+next[1]+".");addFeed(p,"DISCOVERY — "+next[1]+" added to your regional map.");
}
function advance(p){if(p.combat||p.pendingChoice)return;p.region.day++;p.region.corruption=Math.max(0,Math.min(100,p.region.corruption+(p.region.day%2?1:-1)));p.region.threat=Math.max(5,Math.min(100,p.region.threat+(p.region.day%3===0?3:-1)));if(p.region.threat>55)p.region.prosperity=Math.max(10,p.region.prosperity-2);if(p.region.order>60)p.region.prosperity=Math.min(95,p.region.prosperity+1);evolveRegion(p);newRumor(p);addFeed(p,"Day "+p.region.day+" begins. The world changed while you were away.");}
async function relocate(p,lat,lon){
 const reg=regionFrom(Number(lat),Number(lon));if(reg.source!=="coarse-location"||reg.key===p.region.key)return;
 const now=Date.now();p.travel??={mode:"explore",lastChangeAt:0,changes:0};
 const rapid=p.travel.lastChangeAt&&now-p.travel.lastChangeAt<150000;
 p.travel={mode:rapid?"transit":"explore",lastChangeAt:now,changes:(p.travel.changes||0)+1};
 p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);
 addFeed(p,(rapid?"TRAVEL MODE — rapid movement detected. Combat signals are suppressed.":"REGION CROSSED — ")+p.region.name+".");
}
function publicState(p){ensureJourney(p);const x=clone(p);x.field=fieldState(p);x.contractList=contractState(p);x.callingOptions=callings;x.ordinalRating=ordinalRating(p);x.serverNow=Date.now();return x;}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>100000)throw Error("body_too_large");}return s?JSON.parse(s):{};}
const sessions=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,name:"project-ordinal-alpha",version:"0.8.0",storage:pool?"postgres":"memory"});
  if(req.method==="POST"&&u.pathname==="/api/session"){
   const b=await body(req),key=String(b.playerKey||randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80),reg=regionFrom(b.lat,b.lon);
   let p=await load(key);
   if(!p){p=freshPlayer(key,b.playerName,b.origin,reg);newRumor(p);}
   else {
    ensureJourney(p);
    addFeed(p,"Your character returned from persistent storage.");
    if(reg.source==="coarse-location"&&reg.key!==p.region.key){p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);addFeed(p,"TRAVEL — You crossed into "+p.region.name+".");}
   }
   const shared=(await loadRegion(p.region.key))||p.region;p.region=shared;regions.set(shared.key,shared);
   const id=randomUUID();sessions.set(id,p);await save(p);return json(res,201,{sessionId:id,playerKey:key,regionKey:p.region.key,regionSource:reg.source,state:publicState(p)});
  }
  const m=u.pathname.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
  if(m){
   const p=sessions.get(m[1]),action=m[2]||"";if(!p)return json(res,404,{ok:false,error:"session_not_found"});
   if(req.method==="GET"&&!action)return json(res,200,{ok:true,state:publicState(p)});
   if(req.method==="GET"&&action==="presence")return json(res,200,{ok:true,players:[...sessions.values()].filter(x=>x!==p&&x.region.key===p.region.key).slice(0,25).map(x=>({name:x.name,origin:x.origin,level:x.level,title:x.titles[0]||null}))});
   if(req.method==="POST"){
    const b=await body(req);
    if(action==="investigate"){if(p.travel?.mode==="transit")addFeed(p,"TRAVEL MODE — arrive safely before entering combat.");else investigate(p);}
    else if(action==="combat")fight(p,b.type);
    else if(action==="loot")claimLoot(p);
    else if(action==="equip")equipItem(p,String(b.id||""));
    else if(action==="choice")shrine(p,b.choice);
    else if(action==="advance")advance(p);
    else if(action==="scout")scout(p);
    else if(action==="collect")fieldCollect(p,String(b.id||""));
    else if(action==="roam")roam(p);
    else if(action==="checkin")checkin(p);
    else if(action==="calling")chooseCalling(p,String(b.id||""));
    else if(action==="contract")claimContract(p,String(b.id||""));
    else if(action==="relocate")await relocate(p,b.lat,b.lon);
    else return json(res,404,{ok:false,error:"route_not_found"});
    await save(p);return json(res,200,{ok:true,state:publicState(p)});
   }
  }
  if(req.method==="GET"){
   const path=u.pathname==="/"?"/index.html":u.pathname;
   if(["/index.html","/manifest.webmanifest","/styles.css","/game.js","/effects.js","/ordinal-icon.svg"].includes(path)){const data=await readFile(new URL("./public"+path,import.meta.url));const type=path.endsWith(".webmanifest")?"application/manifest+json":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".js")?"text/javascript; charset=utf-8":path.endsWith(".svg")?"image/svg+xml":"text/html; charset=utf-8";res.writeHead(200,{"content-type":type,"cache-control":"no-cache"});return res.end(data);}
  }
  json(res,404,{ok:false,error:"route_not_found"});
 }catch(e){json(res,400,{ok:false,error:e.message||"bad_request"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Project Ordinal v0.8 listening on "+PORT));