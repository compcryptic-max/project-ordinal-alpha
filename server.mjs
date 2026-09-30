import http from "node:http";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {randomUUID,createHash} from "node:crypto";

const PORT=Number(process.env.PORT||8787);
const DB=process.env.DATABASE_URL||"";
let pool=null,dbError=null;
const memory=new Map(),regions=new Map();
if(DB){
 const candidate=new Pool({connectionString:DB,ssl:{rejectUnauthorized:false},max:5,connectionTimeoutMillis:6000});
 try{
  await candidate.query("create table if not exists ordinal_players (player_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
  await candidate.query("create table if not exists ordinal_regions (region_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
  pool=candidate;
 }catch(e){dbError=String(e?.message||"database_unavailable").slice(0,160);await candidate.end().catch(()=>{});console.error("Postgres unavailable; continuing with volatile memory storage.");}
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
 ["RESCUE","A Wayfall scout vanished while tracing a corrupted trail.","Hollow Marauder"],
 ["HUNT","A horned silhouette has been breaking wardstones along the ridge.","Mirehorn"],
 ["MYSTERY","Ash is falling upward around a figure that never casts a shadow.","Ash Revenant"],
 ["DISCOVERY","A knight with no crest is repeating a duel that ended centuries ago.","Choirless Knight"],
 ["MYSTERY","Threads of violet light are stitching two ruined paths together.","Rift Weaver"]
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
function freshRegion(region){return {key:region.key,name:region.name,day:1,stage:"Unsettled",faction:"Wayfall Compact",corruption:37,order:48,prosperity:55,threat:31,ecology:{predators:42,prey:61,anomalies:18},nemesis:null,objective:null,lastPulseAt:Date.now(),history:[],discoveries:[],discoveryRecords:{}}}
function regionRules(r){
 const stage=r.stage||regionStage(r);
 if(stage==="Besieged")return {enemyHp:1.12,incoming:1.08,rare:2,cacheGold:1,label:"HOSTILE PRESSURE",desc:"Enemies are tougher and hit harder."};
 if(stage==="Fortified")return {enemyHp:1,incoming:.94,rare:0,cacheGold:1,label:"WAYFALL WARDS",desc:"Regional defenses soften incoming damage."};
 if(stage==="Flourishing")return {enemyHp:1,incoming:1,rare:1,cacheGold:1.5,label:"OPEN TRADE",desc:"Field caches carry additional gold."};
 if(stage==="Veil-Touched")return {enemyHp:1.08,incoming:1.04,rare:8,cacheGold:1,label:"VEIL SATURATION",desc:"Danger rises, but rare relics surface more often."};
 return {enemyHp:1,incoming:1,rare:0,cacheGold:1,label:"UNSETTLED",desc:"No regional combat modifier is dominant."};
}
function regionStage(r){return r.corruption>=65?"Veil-Touched":r.threat>=60?"Besieged":r.order>=65?"Fortified":r.prosperity>=70?"Flourishing":"Unsettled"}
function simulateRegion(r){
 const now=Date.now(),pulse=1800000;r.lastPulseAt??=now;
 const ticks=Math.min(48,Math.floor((now-r.lastPulseAt)/pulse));if(ticks<=0)return r;
 const old=r.stage;r.ecology??={predators:42,prey:61,anomalies:18};
 for(let i=0;i<ticks;i++){
  const slot=Math.floor((r.lastPulseAt+i*pulse)/pulse),roll=hash(r.key+":pulse:"+slot);
  const drift=n=>((roll>>n)%3)-1;
  r.threat=Math.max(5,Math.min(100,r.threat+drift(1)));
  r.corruption=Math.max(0,Math.min(100,r.corruption+drift(4)+(r.ecology.anomalies>62?.35:0)));
  r.ecology.predators=Math.max(5,Math.min(95,r.ecology.predators+(r.threat>55?.6:-.25)+drift(7)*.25));
  r.ecology.prey=Math.max(5,Math.min(95,r.ecology.prey+(r.ecology.predators>62?-.55:.3)+drift(10)*.2));
  r.ecology.anomalies=Math.max(0,Math.min(100,r.ecology.anomalies+(r.corruption>55?.5:-.2)+drift(13)*.2));
  if(r.threat>65){r.prosperity=Math.max(10,r.prosperity-.3);r.order=Math.max(5,r.order-.15)}
  else if(r.threat<35){r.prosperity=Math.min(100,r.prosperity+.2);r.order=Math.min(100,r.order+.15)}
 }
 r.lastPulseAt+=ticks*pulse;r.stage=regionStage(r);
 r.threat=Math.round(r.threat);r.corruption=Math.round(r.corruption);r.order=Math.round(r.order);r.prosperity=Math.round(r.prosperity);
 for(const k of ["predators","prey","anomalies"])r.ecology[k]=Math.round(r.ecology[k]);
 if(old!==r.stage){r.history.unshift("WORLD PULSE — "+r.name+" shifted from "+old+" to "+r.stage+" while the region evolved.");r.history=r.history.slice(0,40)}
 return r;
}
function ensureRegionObjective(r){
 if(!r.objective||r.objective.day!==r.day){
  const spec=r.threat>=52?["Suppress the Surge","Hunt threats until the local signal stabilizes.","hunt",12]:r.corruption>=52?["Seal the Fractures","Recover Field anomalies and weaken the Veil.","field",15]:["Hold the Line","Any active Wayfarer can help stabilize this sector.","any",18];
  r.objective={day:r.day,title:spec[0],desc:spec[1],metric:spec[2],progress:0,target:spec[3],complete:false};
 }
 return r.objective;
}
function regionContribution(p,type,amount=1){
 const o=ensureRegionObjective(p.region);if(o.complete||!(o.metric===type||o.metric==="any"))return;
 o.progress=Math.min(o.target,o.progress+Math.max(1,amount));
 if(o.progress>=o.target){o.complete=true;p.region.threat=Math.max(5,p.region.threat-6);p.region.corruption=Math.max(0,p.region.corruption-4);p.region.order=Math.min(100,p.region.order+4);p.region.prosperity=Math.min(100,p.region.prosperity+3);p.region.history.unshift("REGIONAL DIRECTIVE COMPLETE — "+o.title+". Wayfarers stabilized the sector.");addFeed(p,"WORLD EVENT COMPLETE — "+o.title+". The entire region benefits.");}
}
function utcDay(){return new Date().toISOString().slice(0,10)}
function ensureActivity(p){
 const today=utcDay();
 p.activity??={date:today,streak:0,lastCheckin:null,collected:[],dailyScore:0,totalFieldActions:0,lastRoamAt:0,roams:0};
 if(p.activity.date!==today){p.activity.date=today;p.activity.collected=[];p.activity.dailyScore=0;}
 p.activity.lastRoamAt??=0;p.activity.roams??=0;
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
 a.collected.push(id);a.totalFieldActions++;a.dailyScore++;journeyAction(p,"field",1);regionContribution(p,"field",1);
 if(node.kind==="cache"){p.gold+=Math.round(6*regionRules(p.region).cacheGold);level(p,12);if((hash(p.key+id)%100)<28){let pot=p.inventory.find(i=>i.id==="potion");if(pot)pot.qty=(pot.qty||0)+1;else p.inventory.push({id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:1});addFeed(p,"CACHE BONUS — Wayfarer Tonic recovered.");}}
 else if(node.kind==="echo"){p.reputation+=1;level(p,8);}
 else if(node.kind==="event"){p.reputation+=2;level(p,10);p.region.threat=Math.max(5,p.region.threat-1);}
 else level(p,10);
 addFeed(p,"FIELD RECOVERY — "+node.label+" secured.");
}
function roam(p){
 if(p.combat||p.pendingChoice)return;
 ensureJourney(p);const a=ensureActivity(p),now=Date.now(),wait=12000-(now-(a.lastRoamAt||0));
 if(wait>0){addFeed(p,"DEEP SCAN — signal resolving. "+Math.ceil(wait/1000)+"s.");return;}
 a.lastRoamAt=now;a.roams++;a.totalFieldActions++;ensureProgress(p);p.stats.scans++;checkFeats(p);
 if(p.trail){
  p.trail.step++;level(p,5);journeyAction(p,"discover",1);
  if(p.trail.step>=3){const boss="Riftbound "+p.trail.enemy;addFeed(p,"TRAIL COMPLETE — "+boss+" has been cornered.");p.trail=null;startEncounter(p,boss,1);}
  else addFeed(p,"HIDDEN TRAIL "+p.trail.step+"/3 — "+p.trail.clues[p.trail.step-1]);
  return;
 }
 const roll=hash(p.key+":"+a.roams+":"+Math.floor(now/12000))%100;
 if(roll<55){
  if(!p.rumor)newRumor(p);startEncounter(p,p.rumor.enemy,0);addFeed(p,"DEEP SCAN — a roaming hostile answered your signal.");
 }else{
  const finds=["Veil residue","Broken waypoint","Forgotten inscription","Aether bloom","Unregistered footprint"];
  const found=finds[roll%finds.length];level(p,6);journeyAction(p,"field",1);a.dailyScore++;
  if(roll>=88){
   const enemy=rumors[hash(p.key+":"+a.roams)%rumors.length][2];
   p.trail={step:0,enemy,clues:["The signal repeats from somewhere it should not exist.","A second trace carries your own field signature.","The trail stops moving. Whatever made it is waiting."]};
   p.reputation+=1;addFeed(p,"HIDDEN TRAIL FOUND — Deep Scan detected a three-stage pursuit.");
  }else addFeed(p,"DEEP SCAN — "+found+" recovered. The trail continues.");
 }
}
function checkin(p){
 const a=ensureActivity(p),today=utcDay();
 if(a.lastCheckin===today){addFeed(p,"DAILY SYNC — already completed today.");return;}
 const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 a.streak=a.lastCheckin===yesterday?(a.streak||0)+1:1;a.lastCheckin=today;a.dailyScore++;a.totalFieldActions++;journeyAction(p,"any",1);
 p.gold+=5;level(p,10+Math.min(20,a.streak*2));addFeed(p,"DAILY SYNC — streak "+a.streak+". Field bonus received.");
}
function ensureProgress(p){
 p.stats??={kills:0,perfectGuards:0,perfectEvades:0,elites:0,scans:0,relics:0};
 p.codex??={enemies:{}};
 p.titles??=[];p.activeTitle??=p.titles[0]||null;
 return p.stats;
}
function awardTitle(p,title,reason){
 ensureProgress(p);if(p.titles.includes(title))return false;
 p.titles.push(title);p.activeTitle=title;addFeed(p,"TITLE UNLOCKED — "+title+" · "+reason);return true;
}
function checkFeats(p){
 const s=ensureProgress(p);
 if(s.kills>=1)awardTitle(p,"Veilbreaker","Defeat your first hostile.");
 if(s.kills>=25)awardTitle(p,"Field Reaper","Defeat 25 hostiles.");
 if(s.perfectGuards+s.perfectEvades>=15)awardTitle(p,"Untouchable","Perform 15 perfect reactions.");
 if(s.elites>=3)awardTitle(p,"Rift Hunter","Defeat three elite Riftbound threats.");
 if(s.scans>=50)awardTitle(p,"Signal Ghost","Complete 50 Deep Scans.");
 if((p.mastery?.rank||1)>=5)awardTitle(p,"Weapon Adept","Reach weapon mastery rank 5.");
}
function ensureJourney(p){
 if(!p.journey){
  const h=hash(p.key),omens=["The Signal That Knows Your Name","Ash Beneath the Glass","The Door Between Footsteps","A Voice Beyond the Veil","The Unmarked Frequency"],motives=["Find what is calling to you.","Learn why the Veil reacts to your presence.","Trace a disappearance no one else remembers.","Discover who altered your first memory.","Reach the source before another Wayfarer does."];
  p.journey={title:omens[h%omens.length],hook:motives[(h>>3)%motives.length],chapter:1,progress:0,next:8,beats:[],calling:null,callingProgress:0,callingTier:1};
 }
 p.contracts??={field:0,hunts:0,discoveries:0,completed:0};p.trail??=null;ensureProgress(p);
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
 if(type==="field")p.contracts.field+=1;if(type==="hunt")p.contracts.hunts+=1;if(type==="discover")p.contracts.discoveries+=1;
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
 return {key,name:String(name||"Wayfarer").slice(0,18),origin:origins[origin]?origin:"Rogue",level:1,xp:0,xpNeeded:100,gold:35,hp:o.hp,maxHp:o.hp,skill:o.skill,inventory:[{id:"starter",name:o.weapon,rarity:"Common",power:2,trait:"Wayfarer Issue"},{id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:2}],equipment:{weapon:"starter"},mastery:{rank:1,xp:0,next:25,name:"Unproven"},path:{attack:0,guard:0,evade:0,skill:0,specialization:null,revealedAt:0},travel:{mode:"explore",lastChangeAt:0,changes:0},titles:[],activeTitle:null,stats:{kills:0,perfectGuards:0,perfectEvades:0,elites:0,scans:0,relics:0},codex:{enemies:{}},knownDiscoveries:[],reputation:0,activity:{date:utcDay(),streak:0,lastCheckin:null,collected:[],dailyScore:0,totalFieldActions:0},journey:null,contracts:{field:0,hunts:0,discoveries:0,completed:0},region:freshRegion(region),rumor:null,combat:null,pendingEncounter:null,pendingLoot:null,pendingChoice:null,feed:[{text:"You entered "+region.name+". The region was already moving before you arrived."}]};
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
const enemyMods=[
 {id:"unstable",name:"UNSTABLE",desc:"Break builds faster.",breakMult:1.25},
 {id:"armored",name:"ARMORED",desc:"Reduced damage until staggered.",armor:.12},
 {id:"frenzied",name:"FRENZIED",desc:"Hits harder, but telegraphs remain readable.",damage:1.15},
 {id:"siphoning",name:"SIPHONING",desc:"Unblocked hits drain Focus.",focusDrain:6}
];
function enemyProfile(name,region){
 const lower=name.toLowerCase();
 const archetype=lower.includes("hound")?["Predator","evade"]:lower.includes("warden")?["Sentinel","guard"]:lower.includes("stalker")?["Assassin","skill"]:lower.includes("marauder")?["Brute","guard"]:lower.includes("mirehorn")?["Juggernaut","guard"]:lower.includes("revenant")?["Cinderborn","skill"]:lower.includes("knight")?["Duelist","attack"]:lower.includes("weaver")?["Trickster","evade"]:["Aberration","attack"];
 return {archetype:archetype[0],weakness:archetype[1],modifier:enemyMods[hash(name+":"+region.key+":"+region.day)%enemyMods.length]};
}
function nemesisIdentity(name,victories){
 const titles=["the Remembering","the Unbroken","Wayfarer-Bane","the Region's Grudge"],title=titles[Math.min(titles.length-1,Math.max(0,victories-1))];
 return {title,mutation:enemyMods[hash(name+":nemesis:"+victories)%enemyMods.length]};
}
function startEncounter(p,boss,elite=0){
 const nemesis=p.region.nemesis?.name===boss?p.region.nemesis:null,nem=nemesis?.power||0,profile=enemyProfile(boss,p.region),rules=regionRules(p.region),hp=Math.round((78+p.level*16+p.region.threat*.3+nem*20)*(1+elite*.22)*rules.enemyHp);
 p.combat={name:boss,nemesisTitle:nemesis?.title||null,hp,maxHp:hp,nemesisPower:nem,elite,archetype:profile.archetype,weakness:profile.weakness,modifier:nemesis?.mutation||profile.modifier,break:0,breakMax:100,exposed:0,turn:1,intent:"The enemy circles for an opening.",stamina:100,focus:0,flow:0,lastAction:"",lastResult:"Encounter started.",phase:1};
 addFeed(p,(elite?"ELITE ENCOUNTER — ":"ENCOUNTER — ")+boss+" emerged from the distortion.");
}
function ensureKnowledge(p){
 if(!Array.isArray(p.knownDiscoveries))p.knownDiscoveries=Array.isArray(p.region?.discoveries)?[...p.region.discoveries]:[];
 return p.knownDiscoveries;
}
function recordDiscovery(p,id,label){
 p.region.discoveryRecords??={};
 if(p.region.discoveryRecords[id])return false;
 p.region.discoveryRecords[id]={label,firstDiscoverer:p.name,ordinalRating:ordinalRating(p),day:p.region.day};
 p.region.history.unshift("FIRST DISCOVERER — "+p.name+" charted "+label+".");addFeed(p,"FIRST DISCOVERER — "+label+" is now tied to your name.");return true;
}
function investigate(p){
 if(p.combat||p.pendingEncounter)return;
 if(!p.rumor)newRumor(p);
 const boss=(p.region.nemesis&&p.region.day%3===0)?p.region.nemesis.name:p.rumor.enemy,known=ensureKnowledge(p),first=!known.includes("glass-shrine"),profile=enemyProfile(boss,p.region);
 if(first){known.push("glass-shrine");if(!p.region.discoveries.includes("glass-shrine"))p.region.discoveries.push("glass-shrine");recordDiscovery(p,"glass-shrine","Glass Shrine");}
 p.pendingEncounter={name:boss,elite:0,archetype:profile.archetype,weakness:profile.weakness,modifier:profile.modifier,threat:Math.max(1,Math.round(p.region.threat/20)+(p.region.nemesis?.name===boss?p.region.nemesis.power:0)),rumorTitle:p.rumor.title};
 addFeed(p,"CONTACT — "+boss+" identified. Engagement is your choice.");
}
function engageEncounter(p,choice){
 const e=p.pendingEncounter;if(!e)return;
 if(choice!=="engage"){p.pendingEncounter=null;addFeed(p,"CONTACT MARKED — You withdrew before combat. The signal remains trackable.");return;}
 p.pendingEncounter=null;startEncounter(p,e.name,e.elite||0);
}
function addMastery(p,amount){
 p.mastery??={rank:1,xp:0,next:25,name:"Unproven"};p.mastery.xp+=amount;
 while(p.mastery.xp>=p.mastery.next){p.mastery.xp-=p.mastery.next;p.mastery.rank++;p.mastery.next=Math.round(p.mastery.next*1.45);p.mastery.name=p.mastery.rank>=6?"Weapon Savant":p.mastery.rank>=4?"Adept":p.mastery.rank>=2?"Initiate":"Unproven";addFeed(p,"MASTERY RANK "+p.mastery.rank+" — "+p.mastery.name+".");checkFeats(p);}
}
function enemyIntent(c){
 const n=c.name,t=c.turn;
 if(/Pale Hound/i.test(n))return t%3===0?"HEAVY POUNCE — EVADE or time a GUARD.":"The Hound circles, testing your flank.";
 if(/Glass Warden/i.test(n))return t%4===0?"HEAVY PRISM BREAK — GUARD to shatter its rhythm.":"Glass plates rotate toward you.";
 if(/Veil Stalker/i.test(n))return t%3===0?"HEAVY VEIL STEP — EVADE before it rematerializes.":"Its outline disappears between shadows.";
 if(/Hollow Marauder/i.test(n))return t%3===0?"HEAVY EXECUTION CLEAVE — GUARD or EVADE.":"The Marauder drags its weapon into position.";
 if(/Mirehorn/i.test(n))return t%4===0?"HEAVY RIDGEBREAK CHARGE — GUARD the impact.":"The Mirehorn lowers its plated crown.";
 if(/Ash Revenant/i.test(n))return t%3===0?"HEAVY CINDER NOVA — EVADE the expanding ring.":"Embers reverse direction around the Revenant.";
 if(/Choirless Knight/i.test(n))return t%4===0?"HEAVY OATHBREAKER LUNGE — read the blade, then react.":"The Knight mirrors your stance.";
 if(/Rift Weaver/i.test(n))return t%3===0?"HEAVY THREADFALL — EVADE before the seam closes.":"Violet threads knot around your escape route.";
 return t%3===0?"HEAVY ATTACK TELEGRAPHED — GUARD OR EVADE.":"The enemy searches for an opening.";
}
function weaponPower(p){const w=p.inventory.find(i=>i.id===p.equipment?.weapon);return Number(w?.power||0)}
function ensurePath(p){p.path??={attack:0,guard:0,evade:0,skill:0,specialization:null,revealedAt:0};return p.path}
function trainPath(p,type){
 const path=ensurePath(p);if(!["attack","guard","evade","skill"].includes(type))return;
 path[type]=(path[type]||0)+1;
 if(!path.specialization){
  const total=path.attack+path.guard+path.evade+path.skill;
  if(total>=25){
   const lead=Object.entries({attack:path.attack,guard:path.guard,evade:path.evade,skill:path.skill}).sort((a,b)=>b[1]-a[1])[0][0];
   path.specialization={attack:"Duelist",guard:"Warden",evade:"Nightstalker",skill:"Hexbinder"}[lead];path.revealedAt=total;
   addFeed(p,"HIDDEN PATH REVEALED — "+path.specialization+". Your combat habits shaped this specialization.");
   awardTitle(p,path.specialization,"Reveal a hidden specialization through combat behavior.");
  }
 }
}
function combatProfile(p){
 const rank=p.mastery?.rank||1,w=Math.max(0,weaponPower(p)),item=p.inventory.find(i=>i.id===p.equipment?.weapon),trait=item?.trait||"",spec=ensurePath(p).specialization||"";
 return {
  attack:10+p.level*2+Math.round(w*.65)+rank,
  skill:22+p.level*3+Math.round(w*.8)+rank*2,
  guard:(p.origin==="Vanguard"?.08:0)+(trait==="Prism Guard"?.05:0)+(spec==="Warden"?.03:0),
  evade:(p.origin==="Rogue"?.10:0)+(trait==="Veilstep"?.06:0)+(spec==="Nightstalker"?.03:0),
  skillCost:p.origin==="Arcanist"?32:38,
  crit:(p.origin==="Ranger"?.12:0)+(trait==="Predator's Tempo"?.05:0)+(spec==="Duelist"?.03:0),
  focusGain:trait==="Predator's Tempo"?4:0,
  skillMult:(trait==="Veil-Touched"?1.08:1)*(spec==="Hexbinder"?1.05:1),
  execute:trait==="Executioner"?.12:0,
  trait
 };
}
function fight(p,type){
 const c=p.combat;if(!c)return;
 c.stamina??=100;c.focus??=0;c.phase??=1;c.flow??=0;c.lastAction??="";
 const allowed=new Set(["attack","skill","guard","dodge","potion","retreat"]);
 if(!allowed.has(type)){c.lastResult="Unknown combat command.";return;}
 if(type==="retreat"){p.combat=null;p.region.threat=Math.min(100,p.region.threat+1);addFeed(p,"WITHDRAWAL — You escaped the encounter. The threat remains in the region.");return;}
 const profile=combatProfile(p);
 if(type==="skill"&&c.focus<profile.skillCost){c.lastResult="Build Focus before using "+p.skill+".";return;}
 if(type==="skill"&&c.stamina<12){c.lastResult="Not enough stamina to execute your skill.";return;}
 if(type==="dodge"&&c.stamina<24){c.lastResult="Not enough stamina to evade.";return;}
 if(type==="attack"&&c.stamina<8){c.lastResult="You are exhausted. Guard to recover stamina.";return;}
 if(type==="potion"&&!p.inventory.some(i=>i.id==="potion"&&(i.qty||0)>0)){c.lastResult="No tonics remain.";return;}
 c.lastResult="";trainPath(p,type);
 const heavy=/HEAVY/.test(c.intent),repeat=c.lastAction===type,mod=c.modifier||{},wasExposed=(c.exposed||0)>0;
 c.flow=Math.max(0,Math.min(5,repeat?c.flow-1:c.flow+1));c.lastAction=type;
 const flowMult=1+c.flow*.04;
 let dmg=0,mitigation=0,evaded=false,acted=true,counter=0,breakGain=0;
 if(type==="potion"){
  const pot=p.inventory.find(i=>i.id==="potion"&&(i.qty||0)>0);
  pot.qty--;const heal=Math.max(28,Math.round(p.maxHp*.32));p.hp=Math.min(p.maxHp,p.hp+heal);c.lastResult="Tonic restored "+heal+" vitality, but using it leaves you exposed.";addFeed(p,"You used a Wayfarer Tonic.");
 } else if(type==="dodge"){
  c.stamina-=24;
  const chance=Math.min(.96,(heavy?.82:.58)+profile.evade);
  evaded=(hash(p.key+":"+c.turn+":"+c.name)%100)<Math.round(chance*100);
  mitigation=evaded?1:.18;c.focus=Math.min(100,c.focus+(heavy?14:8));
  if(evaded){ensureProgress(p);if(heavy)p.stats.perfectEvades++;addMastery(p,heavy?3:2);breakGain+=heavy?34:10;if(c.weakness==="evade")breakGain+=12;if(heavy){counter=4+p.level;c.lastResult="PERFECT EVADE — you slip the telegraph and punish the opening.";}}
  if(!c.lastResult)c.lastResult=evaded?"Evade successful — attack avoided.":"The enemy tracks your evade; the hit is softened, not avoided.";
  addFeed(p,c.lastResult);
 } else if(type==="guard"){
  mitigation=Math.min(.88,(heavy?.74:.52)+profile.guard);c.stamina=Math.min(100,c.stamina+(heavy?15:11));c.focus=Math.min(100,c.focus+(heavy?13:9)+(p.origin==="Vanguard"?3:0));
  if(heavy){ensureProgress(p);p.stats.perfectGuards++;counter=3+Math.ceil(p.level*.7);breakGain+=30+(c.weakness==="guard"?12:0);addMastery(p,3);c.lastResult="PERFECT GUARD — impact broken. Counter window opened.";}else{breakGain+=8;addMastery(p,1);c.lastResult="Guarded the incoming strike.";}
  addFeed(p,c.lastResult);
 } else if(type==="skill"){
  c.focus-=profile.skillCost;c.stamina-=12;dmg=Math.round(profile.skill*flowMult*(p.origin==="Arcanist"?1.1:1)*profile.skillMult);breakGain+=22+(c.weakness==="skill"?12:0);addMastery(p,3);
  c.lastResult=p.skill+" breaks through for "+dmg+" damage.";addFeed(p,c.lastResult);
 } else {
  c.stamina-=8;c.focus=Math.min(100,c.focus+16+profile.focusGain);dmg=Math.round(profile.attack*flowMult);breakGain+=10+(c.weakness==="attack"?10:0);
  const crit=(hash(p.key+":crit:"+c.turn+":"+c.name)%100)<Math.round(profile.crit*100);
  if(crit){dmg=Math.round(dmg*1.45);c.lastResult="PRECISION STRIKE — "+dmg+" damage.";}else c.lastResult="Weapon strike dealt "+dmg+" damage.";
  addMastery(p,1);addFeed(p,c.lastResult);
 }
 if(!acted)return;
 if(counter)dmg+=counter;
 if(profile.execute&&c.hp<=c.maxHp*.35&&dmg){dmg=Math.round(dmg*(1+profile.execute));c.lastResult+=" EXECUTIONER +12%.";}
 if(wasExposed&&dmg){dmg=Math.round(dmg*1.32);c.exposed=0;c.lastResult+=" EXPOSED +32%.";}
 if(mod.armor&&!wasExposed&&dmg)dmg=Math.max(1,Math.round(dmg*(1-mod.armor)));
 breakGain=Math.round(breakGain*(mod.breakMult||1));c.break=Math.min(c.breakMax||100,(c.break||0)+breakGain);
 let staggered=false;if(c.break>=100){c.break=0;c.exposed=1;staggered=true;c.lastResult+=" STAGGER — defense broken; next damaging action is empowered.";addFeed(p,c.name+" was STAGGERED.");}
 if(dmg)c.hp=Math.max(0,c.hp-dmg);
 if(c.hp<=Math.ceil(c.maxHp*.45)&&c.phase===1){c.phase=2;c.lastResult+=" The enemy enters a desperate second phase.";addFeed(p,c.name+" entered PHASE II.");}
 if(c.hp<=0){
  const enemy=c.name,nemesisKill=c.nemesisPower>0;ensureProgress(p);p.stats.kills++;if(c.elite)p.stats.elites++;p.codex.enemies[enemy]=(p.codex.enemies[enemy]||0)+1;checkFeats(p);p.combat=null;p.gold+=24+p.level*3+(nemesisKill?c.nemesisPower*18:0);level(p,42+(nemesisKill?20:0));p.reputation+=2+(nemesisKill?2:0);if(nemesisKill){p.region.history.unshift(p.name+" ended the Nemesis "+enemy+" after "+p.region.nemesis.victories+" recorded victory.");p.region.nemesis=null;}
  const rare=(hash(p.key+enemy+p.region.day)%100)<18+regionRules(p.region).rare;
  p.pendingLoot=enemyLoot(enemy,rare,p.level);
  p.pendingChoice=null;p.region.history.unshift(p.name+" defeated "+enemy+".");journeyAction(p,"hunt",2);regionContribution(p,"hunt",c.elite?2:1);addFeed(p,enemy+" fell. Something remains in the Veil.");return;
 }
 let incoming=((heavy?18:9)+p.level*1.15+p.region.threat/15+(c.phase===2?3:0)+(c.nemesisPower||0)*2)*(mod.damage||1)*regionRules(p.region).incoming;
 if(/Marauder/i.test(c.name))incoming+=3;if(/Hound/i.test(c.name)&&heavy)incoming+=2;
 // Healing consumes a real turn. Skills and attacks are strongest when used outside obvious heavy telegraphs.
 if(type==="potion")mitigation=.15;
 if(staggered||evaded)incoming=0;else incoming*=1-mitigation;
 if(incoming>0&&mod.focusDrain)c.focus=Math.max(0,c.focus-mod.focusDrain);
 p.hp=Math.max(0,Math.round(p.hp-incoming));
 // Prevent a single unlucky normal hit from deleting a healthy player; heavy telegraphs remain dangerous.
 if(!heavy&&p.hp===0&&incoming<p.maxHp*.55)p.hp=1;
 c.stamina=Math.min(100,c.stamina+6);
 c.turn++;c.intent=enemyIntent(c);if(c.phase===2&&!/HEAVY/.test(c.intent))c.intent+=" Phase II pressure is rising.";
 if(p.hp<=0){
  const killer=c.name,n=p.region.nemesis;
  const victories=n&&n.name===killer?n.victories+1:1,identity=nemesisIdentity(killer,victories);p.region.nemesis={name:killer,power:n&&n.name===killer?n.power+1:1,victories,lastDefeated:p.name,title:identity.title,mutation:identity.mutation};
  p.hp=Math.ceil(p.maxHp*.55);p.combat=null;p.region.threat=Math.min(100,p.region.threat+4);p.region.history.unshift(killer+" "+p.region.nemesis.title+" became a regional Nemesis after defeating "+p.name+" · "+p.region.nemesis.mutation.name+".");addFeed(p,"DEATH ECHO — "+killer+" remembers you. It has grown stronger.");
 }
}
function evolveRegion(p){
 const r=p.region,old=r.stage;
 r.ecology??={predators:42,prey:61,anomalies:18};
 r.ecology.predators=Math.max(5,Math.min(95,r.ecology.predators+(r.threat>50?2:-1)));
 r.ecology.prey=Math.max(5,Math.min(95,r.ecology.prey+(r.ecology.predators>60?-2:1)));
 r.ecology.anomalies=Math.max(0,Math.min(100,r.ecology.anomalies+(r.corruption>50?2:-1)));
 r.stage=regionStage(r);
 if(old!==r.stage){r.history.unshift("REGION SHIFT — "+r.name+" became "+r.stage+".");addFeed(p,"WORLD SHIFT — "+r.name+" is now "+r.stage+".");}
 r.history=r.history.slice(0,40);
}
function equipItem(p,id){
 const item=p.inventory.find(i=>i.id===id&&Number.isFinite(Number(i.power)));if(!item)return;
 p.equipment.weapon=item.id;addFeed(p,"EQUIPPED — "+item.name+" · Power "+item.power+".");
}
function enemyLoot(enemy,rare,level){
 const table={
  "Pale Hound":["Pale Moon Edge","Moon-Split Fang","Predator's Tempo"],
  "Glass Warden":["Prismatic Heart","Glassbound Shard","Prism Guard"],
  "Veil Stalker":["Veilknife Zero","Shadowglass Fang","Veilstep"],
  "Hollow Marauder":["Headsman's Oath","Hollow Iron","Executioner"],
  "Mirehorn":["Crown of the Mire","Hornplate Splinter","Prism Guard"],
  "Ash Revenant":["Cinderwake Sigil","Ashen Core","Veil-Touched"],
  "Choirless Knight":["Nameless Vow","Broken Canticle","Executioner"],
  "Rift Weaver":["Seamcutter","Violet Thread","Veilstep"]
 },x=table[enemy]||["Veil-Touched Relic","Veilbound Fragment","Veil-Touched"];
 return {id:"loot-"+Date.now(),name:rare?x[0]:x[1],rarity:rare?"Epic":"Rare",source:enemy,power:4+Math.ceil(level*1.35)+(rare?4:0),trait:x[2]};
}
function claimLoot(p){
 if(!p.pendingLoot)return;
 p.inventory.push(p.pendingLoot);ensureProgress(p);p.stats.relics++;addFeed(p,"RELIC ACQUIRED — "+p.pendingLoot.name+".");p.pendingLoot=null;p.pendingChoice="glass-shrine";
}
function shrine(p,choice){
 if(p.pendingChoice!=="glass-shrine")return;
 if(choice==="cleanse"){regionContribution(p,"field",3);p.region.corruption=Math.max(0,p.region.corruption-9);p.region.order=Math.min(100,p.region.order+6);p.region.history.unshift(p.name+" cleansed the Glass Shrine.");addFeed(p,"The shrine clears. Order strengthens.");}
 else {p.region.corruption=Math.min(100,p.region.corruption+7);p.region.threat=Math.min(100,p.region.threat+5);p.gold+=40;p.region.history.unshift(p.name+" bound the Glass Shrine.");addFeed(p,"You bind the shrine and take its power.");}
 p.pendingChoice=null;p.rumor=null;evolveRegion(p);
}
function scout(p){
 if(p.combat||p.pendingChoice)return;
 p.region.discoveries??=[];const known=ensureKnowledge(p);
 if(p.lastScoutDay===p.region.day){addFeed(p,"SCOUTING — You have already charted what you can today.");return;}
 const sites=[["sunken-road","Sunken Road"],["veil-scar","Veil Scar"],["old-watch","Old Watch"]];
 const next=sites.find(([id])=>!known.includes(id));
 if(!next){addFeed(p,"CARTOGRAPHY — Every known landmark in this region is charted.");return;}
 known.push(next[0]);if(!p.region.discoveries.includes(next[0]))p.region.discoveries.push(next[0]);p.lastScoutDay=p.region.day;p.reputation+=1;level(p,12);journeyAction(p,"discover",2);
 recordDiscovery(p,next[0],next[1]);addFeed(p,"DISCOVERY — "+next[1]+" added to your regional map.");
}
function advance(p){if(p.combat||p.pendingChoice)return;p.region.day++;p.region.corruption=Math.max(0,Math.min(100,p.region.corruption+(p.region.day%2?1:-1)));p.region.threat=Math.max(5,Math.min(100,p.region.threat+(p.region.day%3===0?3:-1)));if(p.region.threat>55)p.region.prosperity=Math.max(10,p.region.prosperity-2);if(p.region.order>60)p.region.prosperity=Math.min(95,p.region.prosperity+1);evolveRegion(p);newRumor(p);addFeed(p,"Day "+p.region.day+" begins. The world changed while you were away.");}
async function relocate(p,lat,lon){
 const reg=regionFrom(Number(lat),Number(lon)),now=Date.now();p.travel??={mode:"explore",lastChangeAt:0,changes:0};
 if(reg.source!=="coarse-location")return;
 if(reg.key===p.region.key){
  if(p.travel.mode==="transit"&&p.travel.lastChangeAt&&now-p.travel.lastChangeAt>=180000){
   p.travel.mode="explore";addFeed(p,"TRAVEL MODE ENDED — local combat signals are available again.");
  }
  return;
 }
 const rapid=p.travel.lastChangeAt&&now-p.travel.lastChangeAt<150000;
 p.travel={mode:rapid?"transit":"explore",lastChangeAt:now,changes:(p.travel.changes||0)+1};
 p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);
 addFeed(p,(rapid?"TRAVEL MODE — rapid movement detected. Combat signals are suppressed.":"REGION CROSSED — ")+p.region.name+".");
}
async function refreshSharedRegion(p){
 const latest=await loadRegion(p.region.key);
 if(latest)p.region=latest;
 simulateRegion(p.region);regions.set(p.region.key,p.region);
 return p.region;
}
function propagateRegion(region){
 regions.set(region.key,region);
 for(const other of sessions.values())if(other.region?.key===region.key)other.region=region;
}
function publicState(p){ensureJourney(p);ensureProgress(p);ensurePath(p);ensureKnowledge(p);checkFeats(p);ensureRegionObjective(p.region);const x=clone(p);x.field=fieldState(p);x.contractList=contractState(p);x.callingOptions=callings;x.ordinalRating=ordinalRating(p);x.regionRule=regionRules(p.region);x.serverNow=Date.now();return x;}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>100000)throw Error("body_too_large");}return s?JSON.parse(s):{};}
const sessions=new Map();
const regionLocks=new Map();
async function acquireRegionLock(key){
 const previous=regionLocks.get(key)||Promise.resolve();let release;
 const gate=new Promise(r=>release=r),tail=previous.then(()=>gate);regionLocks.set(key,tail);await previous;
 return ()=>{release();if(regionLocks.get(key)===tail)regionLocks.delete(key)};
}

const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,name:"project-ordinal-alpha",version:"0.8.1",storage:pool?"postgres":"memory",databaseConfigured:!!DB,databaseStatus:pool?"connected":DB?"degraded":"not_configured",databaseError:dbError?"unavailable":null});
  if(req.method==="POST"&&u.pathname==="/api/session"){
   const b=await body(req),key=String(b.playerKey||randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80),reg=regionFrom(b.lat,b.lon);
   let p=await load(key);
   if(!p){p=freshPlayer(key,b.playerName,b.origin,reg);newRumor(p);}
   else {
    ensureJourney(p);
    addFeed(p,"Your character returned from persistent storage.");
    if(reg.source==="coarse-location"&&reg.key!==p.region.key){p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);addFeed(p,"TRAVEL — You crossed into "+p.region.name+".");}
   }
   const shared=simulateRegion((await loadRegion(p.region.key))||p.region);p.region=shared;regions.set(shared.key,shared);
   const id=randomUUID();sessions.set(id,p);await save(p);return json(res,201,{sessionId:id,playerKey:key,regionKey:p.region.key,regionSource:reg.source,state:publicState(p)});
  }
  const m=u.pathname.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
  if(m){
   const p=sessions.get(m[1]),action=m[2]||"";if(!p)return json(res,404,{ok:false,error:"session_not_found"});
   if(req.method==="GET"&&!action){await refreshSharedRegion(p);return json(res,200,{ok:true,state:publicState(p)});}
   if(req.method==="GET"&&action==="presence")return json(res,200,{ok:true,players:[...sessions.values()].filter(x=>x!==p&&x.region.key===p.region.key).slice(0,25).map(x=>({name:x.name,origin:x.origin,level:x.level,title:x.titles[0]||null}))});
   if(req.method==="POST"){
    const b=await body(req),unlock=await acquireRegionLock(p.region.key);try{await refreshSharedRegion(p);
    if(p.travel?.mode==="transit"&&["investigate","collect","roam","scout"].includes(action))addFeed(p,"TRAVEL MODE — Field interactions are paused during rapid movement. Arrive safely to resume.");
    else if(action==="investigate")investigate(p);
    else if(action==="engage")engageEncounter(p,String(b.choice||"leave"));
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
    await save(p);propagateRegion(p.region);return json(res,200,{ok:true,state:publicState(p)});}finally{unlock();}
   }
  }
  if(req.method==="GET"){
   const path=u.pathname==="/"?"/index.html":u.pathname;
   if(["/index.html","/manifest.webmanifest","/styles.css","/game.js","/effects.js","/ordinal-icon.svg","/sw.js"].includes(path)){const data=await readFile(new URL("./public"+path,import.meta.url));const type=path.endsWith(".webmanifest")?"application/manifest+json":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".js")?"text/javascript; charset=utf-8":path.endsWith(".svg")?"image/svg+xml":"text/html; charset=utf-8";res.writeHead(200,{"content-type":type,"cache-control":"no-cache"});return res.end(data);}
  }
  json(res,404,{ok:false,error:"route_not_found"});
 }catch(e){json(res,400,{ok:false,error:e.message||"bad_request"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Project Ordinal v0.8.1 listening on "+PORT));