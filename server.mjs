import http from "node:http";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {createGuildService} from "./guilds.mjs";
import {createArenaService} from "./pvp.mjs";
import {createAccountService} from "./accounts.mjs";

const PORT=Number(process.env.PORT||8787);
const DB=process.env.DATABASE_URL||"";
let pool=null,dbError=null,persistenceProbe=null;
const memory=new Map(),regions=new Map();
if(DB){
 const candidate=new Pool({connectionString:DB,ssl:{rejectUnauthorized:false},max:5,connectionTimeoutMillis:6000});
 try{
  await candidate.query("create table if not exists ordinal_players (player_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
  await candidate.query("create table if not exists ordinal_regions (region_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
  await candidate.query("create table if not exists ordinal_meta (meta_key text primary key, meta_value text not null, updated_at timestamptz default now())");
  await candidate.query("create table if not exists ordinal_recovery (token_hash text primary key, player_key text not null, created_at timestamptz default now())");
  const marker="db-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
  const probe=await candidate.query("insert into ordinal_meta(meta_key,meta_value) values('persistence_probe',$1) on conflict(meta_key) do update set meta_key=excluded.meta_key returning meta_value", [marker]);
  persistenceProbe=probe.rows[0]?.meta_value||null;pool=candidate;
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
function ensureApex(r){
 const day=utcDay();if(!r.apex||r.apex.date!==day){const pool=["Crowned Rift Weaver","Sovereign Mirehorn","Ascendant Glass Warden","Ash Revenant Prime"],name=pool[hash(r.key+":"+day+":apex")%pool.length];r.apex={date:day,name,seals:0,target:5,complete:false,contributors:[]};}
 return r.apex;
}
function enterApex(p){
 if(p.combat||p.pendingEncounter)return;const a=ensureApex(p.region);
 if(a.complete){addFeed(p,"APEX INCURSION — this region has already sealed "+a.name+" today.");return;}
 startEncounter(p,a.name,2);p.combat.apex=true;p.combat.lastResult="APEX INCURSION — shared regional target engaged.";addFeed(p,"APEX ENGAGED — your victory will damage the shared incursion.");
}
function apexVictory(p,name){
 const a=ensureApex(p.region);if(a.complete||a.name!==name)return;
 a.seals=Math.min(a.target,a.seals+1);if(!a.contributors.includes(p.name))a.contributors.push(p.name);p.gold+=12;p.reputation+=1;
 if(a.seals>=a.target){a.complete=true;p.region.threat=Math.max(5,p.region.threat-8);p.region.order=Math.min(100,p.region.order+5);p.region.history.unshift("APEX SEALED — "+a.name+" was defeated by "+a.contributors.join(", ")+".");addFeed(p,"APEX SEALED — the entire region stabilizes.");}
 else addFeed(p,"APEX DAMAGE — "+a.seals+"/"+a.target+" seals broken across the region.");
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
 p.activity??={date:today,streak:0,lastCheckin:null,collected:[],dailyScore:0,totalFieldActions:0,lastRoamAt:0,roams:0,momentum:0,restedCharges:0};
 p.activity.momentum??=0;p.activity.restedCharges??=0;
 if(p.activity.date!==today){
  const gap=Math.max(1,Math.round((Date.parse(today+"T00:00:00Z")-Date.parse(p.activity.date+"T00:00:00Z"))/86400000));
  p.activity.restedCharges=Math.min(6,p.activity.restedCharges+Math.max(0,gap-1));
  p.activity.date=today;p.activity.collected=[];p.activity.dailyScore=0;p.activity.momentum=0;p.activity.roams=0;
 }
 p.activity.lastRoamAt??=0;p.activity.roams??=0;
 return p.activity;
}
function fieldMomentum(p,amount=1){const a=ensureActivity(p);a.momentum=Math.min(50,(a.momentum||0)+amount);return a.momentum}
function fieldXp(p,base){
 const a=ensureActivity(p);let xp=base;
 if(a.restedCharges>0){const bonus=Math.ceil(base*.5);xp+=bonus;a.restedCharges--;addFeed(p,"RESTED RESONANCE — +"+bonus+" catch-up XP.");}
 level(p,xp);return xp;
}
function ordinalRating(p){const actions=Math.max(0,p.activity?.totalFieldActions||0),feats=Object.keys(p.feats||{}).length;return Math.max(100,Math.round(100+(p.level-1)*85+p.reputation*14+(p.mastery?.rank||1)*28+Math.sqrt(actions)*18+feats*22))}
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
 return types.map((n,i)=>{const id="f:"+p.region.key+":"+slot+":"+i,sx=(seed>>>((i*4)%24)),sy=(seed>>>((i*3+2)%24)),sd=(seed>>>((i*5)%24));return {...n,id,x:Math.max(12,Math.min(88,pos[i][0]+(sx%9)-4)),y:Math.max(15,Math.min(82,pos[i][1]+(sy%9)-4)),distance:90+(sd%620),collected:a.collected.includes(id),expiresIn:1200-(Math.floor(Date.now()/1000)%1200)}});
}
function fieldCollect(p,id){
 const a=ensureActivity(p),node=fieldState(p).find(n=>n.id===id);
 if(!node||node.action!=="collect"||node.collected)return;
 a.collected.push(id);a.totalFieldActions++;a.dailyScore++;fieldMomentum(p);journeyAction(p,"field",1);regionContribution(p,"field",1);
 if(node.kind==="cache"){p.gold+=Math.round(6*regionRules(p.region).cacheGold);fieldXp(p,12);if((hash(p.key+id)%100)<28){let pot=p.inventory.find(i=>i.id==="potion");if(pot)pot.qty=(pot.qty||0)+1;else p.inventory.push({id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:1});addFeed(p,"CACHE BONUS — Wayfarer Tonic recovered.");}}
 else if(node.kind==="echo"){p.reputation+=1;fieldXp(p,8);}
 else if(node.kind==="event"){p.reputation+=2;fieldXp(p,10);p.region.threat=Math.max(5,p.region.threat-1);}
 else fieldXp(p,10);
 addFeed(p,"FIELD RECOVERY — "+node.label+" secured.");
}
function roam(p){
 if(p.combat||p.pendingChoice)return;
 ensureJourney(p);const a=ensureActivity(p),now=Date.now(),wait=12000-(now-(a.lastRoamAt||0));
 if(wait>0){addFeed(p,"DEEP SCAN — signal resolving. "+Math.ceil(wait/1000)+"s.");return;}
 a.lastRoamAt=now;a.roams++;a.totalFieldActions++;fieldMomentum(p);ensureProgress(p);p.stats.scans++;checkFeats(p);
 if(p.trail){
  p.trail.step++;fieldXp(p,5);journeyAction(p,"discover",1);
  if(p.trail.step>=3){const boss="Riftbound "+p.trail.enemy;addFeed(p,"TRAIL COMPLETE — "+boss+" has been cornered.");p.trail=null;startEncounter(p,boss,1);}
  else addFeed(p,"HIDDEN TRAIL "+p.trail.step+"/3 — "+p.trail.clues[p.trail.step-1]);
  return;
 }
 const roll=hash(p.key+":"+a.roams+":"+Math.floor(now/12000))%100;
 if(roll<55){
  if(!p.rumor)newRumor(p);startEncounter(p,p.rumor.enemy,0);addFeed(p,"DEEP SCAN — a roaming hostile answered your signal.");
 }else{
  const finds=["Veil residue","Broken waypoint","Forgotten inscription","Aether bloom","Unregistered footprint"];
  const found=finds[roll%finds.length];fieldXp(p,6);journeyAction(p,"field",1);a.dailyScore++;
  if(roll>=88-Math.min(8,Math.floor((a.momentum||0)/5))){
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
  p.journey={title:omens[h%omens.length],hook:motives[(h>>3)%motives.length],chapter:1,progress:0,next:8,beats:[],calling:null,callingProgress:0,callingTier:1,choices:[],affinity:{mercy:0,defiance:0,curiosity:0,secrecy:0}};
 }
 p.journey.choices??=[];p.journey.affinity??={mercy:0,defiance:0,curiosity:0,secrecy:0};p.journey.callingProgressById??={};p.journey.callingTierById??={};if(p.journey.calling){p.journey.callingProgressById[p.journey.calling]??=p.journey.callingProgress||0;p.journey.callingTierById[p.journey.calling]??=p.journey.callingTier||1;}p.storyDecision??=null;
 p.contracts??={field:0,hunts:0,discoveries:0,completed:0};p.trail??=null;ensureProgress(p);
 return p.journey;
}
const storyDecisions=[
 {kind:"voice",title:"THE VOICE KNOWS YOUR NAME",prompt:"A buried frequency addresses you with a name no other Wayfarer should know.",options:[{id:"answer",label:"ANSWER THE VOICE",affinity:"curiosity"},{id:"silence",label:"CUT THE SIGNAL",affinity:"secrecy"}]},
 {kind:"scout",title:"THE WOUNDED SCOUT",prompt:"A Wayfall scout asks you to surrender a recovered fragment before the Veil takes them.",options:[{id:"give",label:"GIVE THE FRAGMENT",affinity:"mercy"},{id:"keep",label:"KEEP IT",affinity:"defiance"}]},
 {kind:"gate",title:"THE UNMAPPED GATE",prompt:"A sealed threshold reacts only to your Ordinal signature. No regional record says what is behind it.",options:[{id:"open",label:"OPEN THE GATE",affinity:"curiosity"},{id:"mark",label:"MARK & LEAVE",affinity:"secrecy"}]},
 {kind:"oath",title:"THE BROKEN OATH",prompt:"A hostile lowers its weapon and offers a regional secret in exchange for being spared.",options:[{id:"spare",label:"SPARE IT",affinity:"mercy"},{id:"finish",label:"END IT",affinity:"defiance"}]}
];
function makeStoryDecision(p){
 const j=ensureJourney(p);if(p.storyDecision)return p.storyDecision;
 const last=j.choices.at(-1)?.choice||"",seed=hash(p.key+":"+j.chapter+":"+last),template=storyDecisions[seed%storyDecisions.length];
 p.storyDecision={id:"story:"+j.chapter+":"+template.kind,chapter:j.chapter,kind:template.kind,title:template.title,prompt:template.prompt,options:template.options.map(({id,label})=>({id,label}))};
 addFeed(p,"STORY FRACTURE — a decision is waiting inside "+j.title+".");return p.storyDecision;
}
function chooseStoryDecision(p,choice){
 const j=ensureJourney(p),d=p.storyDecision;if(!d)return;
 const template=storyDecisions.find(x=>x.kind===d.kind),option=template?.options.find(x=>x.id===choice);if(!option){addFeed(p,"STORY THREAD — that decision is no longer available.");return;}
 j.affinity[option.affinity]=(j.affinity[option.affinity]||0)+1;j.choices.push({chapter:d.chapter,kind:d.kind,choice:option.id,affinity:option.affinity});j.choices=j.choices.slice(-12);
 const effects={
  answer:()=>{p.reputation+=1;p.region.corruption=Math.min(100,p.region.corruption+2)},
  silence:()=>{p.region.order=Math.min(100,p.region.order+2)},
  give:()=>{p.reputation+=3;p.gold=Math.max(0,p.gold-8);p.region.order=Math.min(100,p.region.order+1)},
  keep:()=>{p.gold+=18;p.region.corruption=Math.min(100,p.region.corruption+1)},
  open:()=>{p.reputation+=1;p.region.threat=Math.min(100,p.region.threat+3);level(p,18)},
  mark:()=>{p.region.order=Math.min(100,p.region.order+2);p.reputation+=1},
  spare:()=>{p.reputation+=2;p.region.threat=Math.max(5,p.region.threat-2)},
  finish:()=>{p.gold+=14;p.region.threat=Math.min(100,p.region.threat+1)}
 };effects[option.id]?.();
 const echoes={
  answer:"You answered. The voice now knows you answered willingly.",
  silence:"You severed the frequency. Something noticed the silence.",
  give:"The scout survived with your fragment. Wayfall remembers the debt.",
  keep:"You kept the fragment. Its signal has begun changing around you.",
  open:"You opened the unmapped gate. The region registered a new disturbance.",
  mark:"You left the gate sealed and marked its existence for later.",
  spare:"You accepted the secret and let the hostile disappear into the region.",
  finish:"You ended the offer before the secret could leave the hostile."
 };
 j.beats.unshift("CHOICE — "+echoes[option.id]);j.beats=j.beats.slice(0,8);p.region.history.unshift(p.name+" altered a hidden Story Thread: "+echoes[option.id]);p.storyDecision=null;addFeed(p,"STORY CHOICE — "+echoes[option.id]);
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
 if(c&&(c.metric===type||c.metric==="any"||(c.metric==="protect"&&["hunt","field"].includes(type)))){j.callingProgress+=amount;j.callingProgressById[j.calling]=j.callingProgress;}
 if(type==="field")p.contracts.field+=1;if(type==="hunt")p.contracts.hunts+=1;if(type==="discover")p.contracts.discoveries+=1;
 if(j.progress>=j.next){
  j.progress-=j.next;j.chapter++;j.next=Math.min(30,8+j.chapter*3);
  const beats=["A fragment addressed you by name.","Your signal appeared in a record older than your arrival.","A second presence answered your frequency.","The trail split toward something the region refuses to map.","Someone else has begun following your trail."];
  const branchBeats={
   mercy:["Someone you spared left a ward where you were expected to die.","A Wayfall distress call names you as the person most likely to answer."],
   defiance:["A hostile faction has started marking your victories on abandoned walls.","The Veil pushes back harder whenever your signature enters the region."],
   curiosity:["The unmapped signal now opens only when your frequency is nearby.","A hidden route appears in places your previous choices disturbed."],
   secrecy:["Another Wayfarer is searching for a trail only you know exists.","A record of your movements has a deliberate blank where your last choice should be."]
  };
  const dominant=Object.entries(j.affinity||{}).sort((a,b)=>b[1]-a[1])[0],pool=dominant&&dominant[1]>0?branchBeats[dominant[0]]:beats;
  const beat=pool[(hash(p.key+":"+j.chapter+":"+(dominant?.[0]||"base")))%pool.length];j.beats.unshift("CHAPTER "+j.chapter+" — "+beat);j.beats=j.beats.slice(0,8);p.reputation+=2;level(p,20+j.chapter*2);addFeed(p,"STORY THREAD — "+beat);if(j.chapter%2===0)makeStoryDecision(p);
 }
 if(c){
  const target=8+j.callingTier*7;
  if(j.callingProgress>=target){j.callingProgress-=target;j.callingTier++;j.callingProgressById[j.calling]=j.callingProgress;j.callingTierById[j.calling]=j.callingTier;p.reputation+=3;p.gold+=20+j.callingTier*5;level(p,25);addFeed(p,c.name.toUpperCase()+" GOAL — Tier "+j.callingTier+" reached.");}
 }
}
function chooseCalling(p,id){
 ensureJourney(p);if(!callings[id])return;
 const j=p.journey;if(j.calling){j.callingProgressById[j.calling]=j.callingProgress||0;j.callingTierById[j.calling]=j.callingTier||1;}j.calling=id;j.callingProgress=j.callingProgressById[id]||0;j.callingTier=j.callingTierById[id]||1;addFeed(p,"CALLING CHOSEN — "+callings[id].name+". Your progress in every Calling is remembered.");
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
const directiveTemplates={
 hunt:{title:"Contain the Rising Threat",desc:"Wayfall predicts a hostile surge in this region. Defeat threats before they settle into the world.",target:3,xp:32,gold:16,effect:"Threat -2"},
 discover:{title:"Map What the Region Hid",desc:"A route has vanished from every regional record. Follow discoveries and restore the missing path.",target:2,xp:28,gold:14,effect:"Prosperity +2"},
 field:{title:"Stabilize the Veil",desc:"The local Veil is shedding recoverable traces. Secure them before the pattern collapses.",target:5,xp:25,gold:12,effect:"Order +2"}
};
function directiveMetric(p,kind){ensureJourney(p);return kind==="hunt"?(p.contracts.hunts||0):kind==="discover"?(p.contracts.discoveries||0):(p.contracts.field||0)}
function chooseDirectiveKind(p,exclude=""){
 const j=ensureJourney(p),priorities=[];
 if(p.region.threat>=55)priorities.push("hunt");
 if(p.region.corruption>=55)priorities.push("field");
 if(j.calling==="hunter")priorities.push("hunt");
 if(j.calling==="seeker")priorities.push("discover");
 if(j.calling==="warden")priorities.push(p.region.threat>=40?"hunt":"field");
 priorities.push(["field","hunt","discover"][hash(p.key+":"+p.region.key+":"+utcDay()+":"+(p.directiveSerial||0))%3],"field","hunt","discover");
 return priorities.find(kind=>kind!==exclude)||"field";
}
function ensureDirective(p,force=false,exclude=""){
 ensureJourney(p);
 if(!force&&p.directive?.regionKey===p.region.key)return p.directive;
 const kind=chooseDirectiveKind(p,exclude),template=directiveTemplates[kind];p.directiveSerial=(p.directiveSerial||0)+1;
 p.directive={id:"directive:"+p.directiveSerial,kind,title:template.title,desc:template.desc,target:template.target,baseline:directiveMetric(p,kind),xp:template.xp,gold:template.gold,effect:template.effect,regionKey:p.region.key,regionName:p.region.name,createdAt:Date.now()};
 addFeed(p,"ORDINAL DIRECTIVE — "+template.title+" adapted to "+p.region.name+".");return p.directive;
}
function directiveState(p){
 const d=ensureDirective(p),progress=Math.min(d.target,Math.max(0,directiveMetric(p,d.kind)-d.baseline));
 return {...d,progress,reward:d.xp+" XP · "+d.gold+"G · "+d.effect,canReroute:p.directiveRerouteDay!==utcDay()};
}
function handleDirective(p,choice){
 const d=ensureDirective(p);
 if(choice==="reroute"){
  if(p.directiveRerouteDay===utcDay())throw Error("The Quest Director can reroute once per day.");
  p.directiveRerouteDay=utcDay();ensureDirective(p,true,d.kind);return;
 }
 if(choice!=="claim")throw Error("Choose claim or reroute.");
 const progress=directiveMetric(p,d.kind)-d.baseline;if(progress<d.target)throw Error("Complete the current Ordinal Directive before claiming it.");
 level(p,d.xp);p.gold+=d.gold;p.reputation+=2;
 if(d.kind==="hunt")p.region.threat=Math.max(5,p.region.threat-2);
 else if(d.kind==="discover")p.region.prosperity=Math.min(100,p.region.prosperity+2);
 else p.region.order=Math.min(100,p.region.order+2);
 const memory="DIRECTIVE — "+d.title+" completed in "+d.regionName+".";p.journey.beats.unshift(memory);p.journey.beats=p.journey.beats.slice(0,8);p.region.history.unshift(p.name+" completed an Ordinal Directive: "+d.title+".");
 addFeed(p,memory+" The Quest Director has adapted again.");p.directive=null;ensureDirective(p,true,d.kind);
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
function riftEnemy(p,wave){const pool=rumors.map(x=>x[2]),seed=p.riftRun?.seed||hash(p.key+":"+utcDay()+":rift");return pool[(seed+wave*5)%pool.length]}
function startRift(p){
 if(p.combat||p.pendingEncounter||p.pendingChoice||p.pendingLoot)return;
 p.riftRun={wave:1,total:3,seed:hash(p.key+":"+Date.now()+":"+p.region.key),startedAt:Date.now()};
 const enemy=riftEnemy(p,1);startEncounter(p,enemy,1);p.combat.rift=true;p.combat.riftWave=1;p.combat.lastResult="RIFT RUN 1/3 — survive the breach.";addFeed(p,"RIFT BREACH — three hostile layers detected. Withdrawal forfeits the run.");
}
function nextRiftWave(p){
 const run=p.riftRun;if(!run)return false;run.wave++;
 if(run.wave>run.total)return false;
 p.hp=Math.min(p.maxHp,p.hp+Math.ceil(p.maxHp*.12));const enemy=riftEnemy(p,run.wave);startEncounter(p,enemy,run.wave===run.total?2:1);p.combat.rift=true;p.combat.riftWave=run.wave;p.combat.lastResult="RIFT RUN "+run.wave+"/"+run.total+" — breach depth increasing.";addFeed(p,"RIFT WAVE "+run.wave+"/"+run.total+" — "+enemy+" entered the breach.");return true;
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
 const allowed=new Set(["attack","skill","guard","dodge","potion","retreat","idle"]);
 if(!allowed.has(type)){c.lastResult="Unknown combat command.";return;}
 if(type==="retreat"&&c.bountyId){p.hp=c.returnHp;p.failedBounty=c.bountyId;p.combat=null;addFeed(p,"ECHO ARENA — you withdrew without a world penalty.");return;}
 if(type==="retreat"){const rift=!!c.rift;p.combat=null;if(rift)p.riftRun=null;p.region.threat=Math.min(100,p.region.threat+1);addFeed(p,rift?"RIFT RUN FAILED — you escaped before the breach closed.":"WITHDRAWAL — You escaped the encounter. The threat remains in the region.");return;}
 const profile=combatProfile(p);
 if(type==="skill"&&c.focus<profile.skillCost){c.lastResult="Build Focus before using "+p.skill+".";return;}
 if(type==="skill"&&c.stamina<12){c.lastResult="Not enough stamina to execute your skill.";return;}
 if(type==="dodge"&&c.stamina<24){c.lastResult="Not enough stamina to evade.";return;}
 if(type==="attack"&&c.stamina<8){c.lastResult="You are exhausted. Guard to recover stamina.";return;}
 if(type==="potion"&&!p.inventory.some(i=>i.id==="potion"&&(i.qty||0)>0)){c.lastResult="No tonics remain.";return;}
 c.lastResult="";const idle=type==="idle";if(!idle)trainPath(p,type);
 const heavy=/HEAVY/.test(c.intent),repeat=c.lastAction===type,mod=c.modifier||{},wasExposed=(c.exposed||0)>0;
 if(!idle){c.flow=Math.max(0,Math.min(5,repeat?c.flow-1:c.flow+1));c.lastAction=type;}
 const flowMult=1+c.flow*.04;
 let dmg=0,mitigation=0,evaded=false,acted=true,counter=0,breakGain=0;
 if(type==="idle"){c.lastResult=heavy?"REACTION MISSED — the heavy telegraph connects.":"REACTION MISSED — the hostile closes the opening.";addFeed(p,c.lastResult);
 } else if(type==="potion"){
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
 if(c.hp<=0&&c.bountyId){p.hp=c.returnHp;p.bountyVictory=c.bountyId;p.combat=null;addFeed(p,"ECHO ARENA — verified victory. Bounty secured.");return;}
 if(c.hp<=0){
  const enemy=c.name,nemesisKill=c.nemesisPower>0,apexKill=!!c.apex,riftKill=!!c.rift,riftWave=c.riftWave||0;ensureProgress(p);p.stats.kills++;if(c.elite)p.stats.elites++;p.codex.enemies[enemy]=(p.codex.enemies[enemy]||0)+1;checkFeats(p);p.combat=null;p.gold+=24+p.level*3+(nemesisKill?c.nemesisPower*18:0);level(p,42+(nemesisKill?20:0));p.reputation+=2+(nemesisKill?2:0);if(nemesisKill){p.region.history.unshift(p.name+" ended the Nemesis "+enemy+" after "+p.region.nemesis.victories+" recorded victory.");p.region.nemesis=null;}
  const relic=p.inventory.find(i=>i.id===p.equipment.weapon);if(relic){relic.history??=[];relic.history.unshift("Carried by "+p.name+" in victory against "+enemy+".");relic.history=relic.history.slice(0,12);}
  let rare=(hash(p.key+enemy+p.region.day)%100)<18+regionRules(p.region).rare+Math.min(5,Math.floor((ensureActivity(p).momentum||0)/10));
  if(apexKill)apexVictory(p,enemy);
  p.pendingChoice=null;p.region.history.unshift(p.name+" defeated "+enemy+".");journeyAction(p,"hunt",2);regionContribution(p,"hunt",c.elite?2:1);
  if(riftKill&&p.riftRun&&riftWave<p.riftRun.total){addFeed(p,enemy+" fell inside the breach. No time to loot — the next layer is opening.");nextRiftWave(p);return;}
  if(riftKill&&p.riftRun){rare=true;p.gold+=45;p.reputation+=3;p.riftRun=null;awardTitle(p,"Rift Runner","Clear a complete three-wave Rift Run.");addFeed(p,"RIFT CLEARED — final-layer relic secured.");}
  p.pendingLoot=enemyLoot(enemy,rare,p.level);addFeed(p,enemy+" fell. Something remains in the Veil.");return;
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
 if(p.hp<=0&&c.bountyId){p.hp=c.returnHp;p.failedBounty=c.bountyId;p.combat=null;addFeed(p,"ECHO ARENA — defeat. Your field character returns unharmed.");return;}
 if(p.hp<=0){
  const killer=c.name,n=p.region.nemesis;
  const victories=n&&n.name===killer?n.victories+1:1,identity=nemesisIdentity(killer,victories);p.region.nemesis={name:killer,power:n&&n.name===killer?n.power+1:1,victories,lastDefeated:p.name,title:identity.title,mutation:identity.mutation};
  p.hp=Math.ceil(p.maxHp*.55);if(c.rift){p.riftRun=null;addFeed(p,"RIFT RUN FAILED — the breach rejected you.")}p.combat=null;p.region.threat=Math.min(100,p.region.threat+4);p.region.history.unshift(killer+" "+p.region.nemesis.title+" became a regional Nemesis after defeating "+p.name+" · "+p.region.nemesis.mutation.name+".");addFeed(p,"DEATH ECHO — "+killer+" remembers you. It has grown stronger.");
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
 return {id:"loot-"+randomUUID(),name:rare?x[0]:x[1],rarity:rare?"Epic":"Rare",source:enemy,power:4+Math.ceil(level*1.35)+(rare?4:0),trait:x[2]};
}
function claimLoot(p){
 if(!p.pendingLoot)return;
 p.pendingLoot.history=["Recovered by "+p.name+" from "+p.pendingLoot.source+" in "+p.region.name+"."];
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
function ensureHome(p){
 p.home??={investigations:0,nextInvestigationAt:0,npc:{name:"Sera, the Wayfall Keeper",trust:0,lastVisitDay:null,memories:[]}};
 return p.home;
}
function homeAction(p,type){
 if(p.combat||p.pendingEncounter||p.pendingLoot||p.pendingChoice)throw Error("Resolve your encounter before returning home.");
 const h=ensureHome(p);
 if(type==="rest"){
  if(p.hp>=p.maxHp)throw Error("You are already fully rested.");
  if(p.gold<10)throw Error("Rest costs 10 gold.");p.gold-=10;p.hp=p.maxHp;addFeed(p,"SANCTUARY — your wounds have healed.");
 }else if(type==="craft"){
  if(p.gold<15)throw Error("Crafting a tonic costs 15 gold.");
  let tonic=p.inventory.find(i=>i.id==="potion");if((tonic?.qty||0)>=20)throw Error("Your tonic supplies are full.");
  p.gold-=15;if(tonic)tonic.qty++;else p.inventory.push({id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:1});addFeed(p,"WORKBENCH — crafted a Wayfarer Tonic.");
 }else if(type==="investigate"){
  if(Date.now()<h.nextInvestigationAt)throw Error("The archive is still tracing your last signal.");
  h.nextInvestigationAt=Date.now()+120000;h.investigations++;level(p,6);journeyAction(p,"discover",1);addFeed(p,"REMOTE INVESTIGATION — a home archive signal advanced your personal thread. Field discoveries carry greater rewards.");
 }else throw Error("Unknown home activity.");
}
function visitKeeper(p,choice){
 if(p.combat||p.pendingEncounter||p.pendingLoot||p.pendingChoice)throw Error("Resolve your encounter before visiting the Keeper.");
 const npc=ensureHome(p).npc;if(npc.lastVisitDay===utcDay())throw Error("Sera remembers today's conversation. Return tomorrow for another request.");
 if(!["help","refuse","threaten"].includes(choice))throw Error("Choose how to respond to Sera.");
 if(choice==="help"){
  if(p.gold<10)throw Error("Helping repair the sanctuary requires 10 gold.");p.gold-=10;npc.trust=Math.min(10,npc.trust+1);p.reputation+=1;
 }else npc.trust=Math.max(-10,npc.trust-(choice==="threaten"?2:1));
 npc.lastVisitDay=utcDay();npc.memories.unshift(choice==="help"?"You helped repair the sanctuary.":choice==="threaten"?"You threatened the Keeper when she asked for help.":"You declined the Keeper's request.");npc.memories=npc.memories.slice(0,12);
 addFeed(p,"SERA — "+(npc.trust>0?"I remember what you did for us. The Wayfall doors remain open.":npc.trust<0?"I remember your answer. Trust is earned here.":"We will see what kind of Wayfarer you become."));
}
function publicState(p){ensureHome(p);ensureJourney(p);ensureProgress(p);ensurePath(p);ensureKnowledge(p);checkFeats(p);ensureRegionObjective(p.region);ensureApex(p.region);const x=clone(p);x.field=fieldState(p);x.contractList=contractState(p);x.callingOptions=callings;x.directive=directiveState(p);x.ordinalRating=ordinalRating(p);x.regionRule=regionRules(p.region);x.playBalance={momentum:ensureActivity(p).momentum||0,restedCharges:ensureActivity(p).restedCharges||0};x.storyDecision=p.storyDecision||null;x.serverNow=Date.now();return x;}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
function recoveryHash(code){return createHash("sha256").update(String(code).replace(/[^a-zA-Z0-9]/g,"").toUpperCase()).digest("hex")}
function newRecoveryCode(){return randomBytes(16).toString("hex").toUpperCase().match(/.{1,4}/g).join("-")}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>100000)throw Error("body_too_large");}return s?JSON.parse(s):{};}
const sessions=new Map();
const accountRequest=await createAccountService(pool);
const arenaRequest=createArenaService(pool);
function syncEconomy(p){
 if(!pool)memory.set(p.key,clone(p));
 for(const live of sessions.values())if(live.key===p.key){live.gold=p.gold;live.inventory=clone(p.inventory);live.equipment=clone(p.equipment);}
}
const guildRequest=createGuildService(pool,{loadPlayer:load,syncPlayer:syncEconomy,startDuel:(p,bounty)=>{
 const returnHp=p.hp;startEncounter(p,bounty.name+"’s Wayfarer Echo");
 p.combat.bountyId=bounty.id;p.combat.returnHp=returnHp;
 p.combat.hp=p.combat.maxHp=Math.max(60,Math.min(250,bounty.maxHp));
 p.combat.lastResult="VOLUNTARY ECHO ARENA — an asynchronous duel against a consenting Wayfarer's recorded echo.";
}});
const regionLocks=new Map();
async function acquireRegionLock(key){
 const previous=regionLocks.get(key)||Promise.resolve();let release;
 const gate=new Promise(r=>release=r),tail=previous.then(()=>gate);regionLocks.set(key,tail);await previous;
 return ()=>{release();if(regionLocks.get(key)===tail)regionLocks.delete(key)};
}

const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://localhost");
  if(req.method==='GET'&&(/^\/assets\/(characters|monsters)\/[a-z-]+\.webp$/.test(u.pathname)||u.pathname==='/ordinal-icon.png')){
   const data=await readFile(new URL('./public'+u.pathname,import.meta.url));res.writeHead(200,{'content-type':u.pathname.endsWith('.webp')?'image/webp':'image/png','cache-control':'no-cache'});return res.end(data);
  }
  if(req.method==="POST"&&/^\/api\/account\/(signup|signin|recover)$/.test(u.pathname)){
   const unlock=await acquireRegionLock("account-mutations");try{
    const account=await accountRequest(u.pathname.split('/').pop(),await body(req));
    return json(res,200,{ok:true,account});
   }finally{unlock();}
  }
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,name:"project-ordinal-alpha",version:"0.18.0",storage:pool?"postgres":"memory",databaseConfigured:!!DB,databaseStatus:pool?"connected":DB?"degraded":"not_configured",databaseError:dbError?"unavailable":null,persistenceProbe:pool?persistenceProbe:null});
  if(req.method==="POST"&&u.pathname==="/api/recovery/create"){
   if(!pool)return json(res,503,{ok:false,error:"persistent_storage_required"});
   const b=await body(req),p=sessions.get(String(b.sessionId||""));if(!p)return json(res,404,{ok:false,error:"session_not_found"});
   const code=newRecoveryCode(),tokenHash=recoveryHash(code);await pool.query("delete from ordinal_recovery where player_key=$1",[p.key]);await pool.query("insert into ordinal_recovery(token_hash,player_key) values($1,$2)",[tokenHash,p.key]);
   return json(res,201,{ok:true,code});
  }
  if(req.method==="POST"&&u.pathname==="/api/recovery/use"){
   const unlock=await acquireRegionLock("world-mutations");try{
   if(!pool)return json(res,503,{ok:false,error:"persistent_storage_required"});
   const b=await body(req),tokenHash=recoveryHash(b.code||"");if(!b.code||tokenHash.length!==64)return json(res,400,{ok:false,error:"invalid_recovery_code"});
   const hit=await pool.query("select player_key from ordinal_recovery where token_hash=$1 limit 1",[tokenHash]);if(!hit.rows[0])return json(res,404,{ok:false,error:"recovery_code_not_found"});
   const p=[...sessions.values()].find(x=>x.key===hit.rows[0].player_key)||await load(hit.rows[0].player_key);if(!p)return json(res,404,{ok:false,error:"player_not_found"});
   const id=randomUUID();sessions.set(id,p);addFeed(p,"DEVICE RECOVERY — persistent character linked to a new browser.");await save(p);return json(res,200,{ok:true,sessionId:id,playerKey:p.key,state:publicState(p)});
   }finally{unlock();}
  }
  if(req.method==="POST"&&u.pathname==="/api/session"){
   const unlock=await acquireRegionLock("world-mutations");try{
   const b=await body(req),key=String(b.playerKey||randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80),reg=regionFrom(b.lat,b.lon);
   let p=[...sessions.values()].find(x=>x.key===key)||await load(key);
   if(!p&&b.recoverOnly)return json(res,404,{ok:false,error:"player_not_found"});
   if(!p){p=freshPlayer(key,b.playerName,b.origin,reg);newRumor(p);}
   else {
    ensureJourney(p);
    addFeed(p,"Your character returned from persistent storage.");
    if(reg.source==="coarse-location"&&reg.key!==p.region.key){p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);addFeed(p,"TRAVEL — You crossed into "+p.region.name+".");}
   }
   const shared=simulateRegion((await loadRegion(p.region.key))||p.region);p.region=shared;regions.set(shared.key,shared);
   const id=randomUUID();sessions.set(id,p);await save(p);return json(res,201,{sessionId:id,playerKey:key,regionKey:p.region.key,regionSource:reg.source,state:publicState(p)});
   }finally{unlock();}
  }
  const m=u.pathname.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
  if(m){
   const p=sessions.get(m[1]),action=m[2]||"";if(!p)return json(res,404,{ok:false,error:"session_not_found"});
   if(action==="pvp"&&req.method==="GET")return json(res,200,{ok:true,...await arenaRequest(p)});
   if(action==="pvp"&&req.method==="POST"){const b=await body(req),unlock=await acquireRegionLock("world-mutations");try{return json(res,200,{ok:true,...await arenaRequest(p,String(b.action||""),b)});}finally{unlock();}}
   if(action==="guild"&&req.method==="GET")return json(res,200,{ok:true,...await guildRequest(p)});
   if(action==="guild"&&req.method==="POST"){const b=await body(req),unlock=await acquireRegionLock("world-mutations");try{await refreshSharedRegion(p);const arena=await arenaRequest(p);if(["active","waiting"].includes(arena.match?.status))throw Error("Finish or cancel your live arena session first.");const result=await guildRequest(p,String(b.action||""),b);if(["mystery","hunt-bounty","claim-bounty","list-item","cancel-listing","buy-item","post-contract","claim-contract","cancel-contract"].includes(b.action))await save(p);return json(res,200,{ok:true,...result,state:publicState(p)});}finally{unlock();}}
   if(req.method==="GET"&&!action){await refreshSharedRegion(p);return json(res,200,{ok:true,state:publicState(p)});}
   if(req.method==="GET"&&action==="presence")return json(res,200,{ok:true,players:[...sessions.values()].filter(x=>x!==p&&x.region.key===p.region.key).slice(0,25).map(x=>({name:x.name,origin:x.origin,level:x.level,rating:ordinalRating(x),title:x.titles[0]||null}))});
   if(req.method==="GET"&&action==="leaderboard"){
    let roster;
    if(pool){const q=await pool.query("select payload from ordinal_players order by updated_at desc limit 2000");roster=q.rows.map(x=>x.payload);}
    else roster=[...new Map([...sessions.values()].map(x=>[x.key,x])).values()];
    const ranked=roster.map(x=>({key:x.key,name:x.name||"Wayfarer",origin:x.origin||"Unknown",level:x.level||1,rating:ordinalRating(x),title:x.titles?.[0]||null})).sort((a,b)=>b.rating-a.rating||b.level-a.level);
    const rank=Math.max(1,ranked.findIndex(x=>x.key===p.key)+1);return json(res,200,{ok:true,rank,total:ranked.length,leaders:ranked.slice(0,20).map(({key,...x},i)=>({...x,rank:i+1}))});
   }
   if(req.method==="POST"){
    const b=await body(req),unlock=await acquireRegionLock("world-mutations");try{await refreshSharedRegion(p);const arena=await arenaRequest(p);if(["active","waiting"].includes(arena.match?.status))throw Error("Finish or cancel your live arena session first.");
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
    else if(action==="apex")enterApex(p);
    else if(action==="rift")startRift(p);
    else if(action==="checkin")checkin(p);
    else if(action==="calling")chooseCalling(p,String(b.id||""));
    else if(action==="contract")claimContract(p,String(b.id||""));
    else if(action==="directive")handleDirective(p,String(b.choice||"claim"));
    else if(action==="story")chooseStoryDecision(p,String(b.choice||""));
    else if(action==="home")homeAction(p,String(b.type||""));
    else if(action==="keeper")visitKeeper(p,String(b.choice||""));
    else if(action==="relocate")await relocate(p,b.lat,b.lon);
    else return json(res,404,{ok:false,error:"route_not_found"});
    if(p.bountyVictory)await guildRequest(p,"claim-bounty");
    if(p.failedBounty){await guildRequest(p,"fail-bounty",{bounty:p.failedBounty});p.failedBounty=null;}
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
server.listen(PORT,"0.0.0.0",()=>console.log("Project Ordinal v0.18 listening on "+PORT));
