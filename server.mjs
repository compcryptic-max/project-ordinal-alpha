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
function freshPlayer(key,name,origin,region){
 const o=origins[origin]||origins.Rogue;
 return {key,name:String(name||"Wayfarer").slice(0,18),origin:origins[origin]?origin:"Rogue",level:1,xp:0,xpNeeded:100,gold:35,hp:o.hp,maxHp:o.hp,skill:o.skill,inventory:[{id:"starter",name:o.weapon,rarity:"Common",power:2,trait:"Wayfarer Issue"},{id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:2}],equipment:{weapon:"starter"},mastery:{rank:1,xp:0,next:25,name:"Unproven"},travel:{mode:"explore",lastChangeAt:0,changes:0},titles:[],reputation:0,region:freshRegion(region),rumor:null,combat:null,pendingLoot:null,pendingChoice:null,feed:[{text:"You entered "+region.name+". The region was already moving before you arrived."}]};
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
 const nem=p.region.nemesis?.name===boss?p.region.nemesis.power:0,hp=72+p.level*12+nem*18;
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
function fight(p,type){
 const c=p.combat;if(!c)return;
 c.stamina??=100;c.focus??=0;c.phase??=1;
 const heavy=/HEAVY/.test(c.intent),base=10+p.level*2+weaponPower(p);
 let dmg=0,mitigation=0,evaded=false;
 if(type==="potion"){
  const pot=p.inventory.find(i=>i.id==="potion"&&(i.qty||0)>0);
  if(pot){pot.qty--;p.hp=Math.min(p.maxHp,p.hp+42);c.lastResult="Tonic restored vitality.";addFeed(p,"You used a Wayfarer Tonic.");}
  else c.lastResult="No tonics remain.";
  c.stamina=Math.min(100,c.stamina+8);
 } else if(type==="dodge"){
  if(c.stamina<25){c.lastResult="Not enough stamina to evade.";return;}
  c.stamina-=25;evaded=heavy||((hash(p.key+c.turn)%100)<58);c.focus=Math.min(100,c.focus+8);if(evaded)addMastery(p,2);
  c.lastResult=evaded?"Perfect evade — attack avoided.":"You evade early; the enemy adjusts.";
  addFeed(p,c.lastResult);
 } else if(type==="guard"){
  mitigation=heavy?0.72:0.5;c.stamina=Math.min(100,c.stamina+12);c.focus=Math.min(100,c.focus+10);if(heavy)addMastery(p,2);
  c.lastResult=heavy?"Perfect guard — heavy impact broken.":"Guarded the incoming strike.";
  addFeed(p,c.lastResult);
 } else if(type==="skill"){
  if(c.focus<35){c.lastResult="Build Focus with attacks, guards, and evades.";return;}
  c.focus-=35;dmg=24+p.level*4+(p.mastery?.rank||1)*2+(heavy?8:0);c.stamina=Math.min(100,c.stamina+5);addMastery(p,3);
  c.lastResult=p.skill+" breaks through for "+dmg+" damage.";addFeed(p,c.lastResult);
 } else {
  dmg=base+(p.mastery?.rank||1);c.focus=Math.min(100,c.focus+18);c.stamina=Math.min(100,c.stamina+9);addMastery(p,1);
  c.lastResult="Weapon strike dealt "+dmg+" damage.";addFeed(p,c.lastResult);
 }
 if(dmg)c.hp=Math.max(0,c.hp-dmg);
 if(c.hp<=Math.ceil(c.maxHp*.45)&&c.phase===1){c.phase=2;c.lastResult+=" The enemy enters a desperate second phase.";addFeed(p,c.name+" entered PHASE II.");}
 if(c.hp<=0){
  const enemy=c.name,nemesisKill=c.nemesisPower>0;p.combat=null;p.gold+=24+p.level*3+(nemesisKill?c.nemesisPower*18:0);level(p,42+(nemesisKill?20:0));p.reputation+=2+(nemesisKill?2:0);if(nemesisKill){p.region.history.unshift(p.name+" ended the Nemesis "+enemy+" after "+p.region.nemesis.victories+" recorded victory.");p.region.nemesis=null;}
  const rare=(hash(p.key+enemy+p.region.day)%100)<18;
  p.pendingLoot={id:"loot-"+Date.now(),name:enemy==="Pale Hound"?(rare?"Pale Moon Edge":"Moon-Split Fang"):(rare?"Warden's Glassheart":"Veilbound Fragment"),rarity:rare?"Epic":"Rare",source:enemy,power:4+p.level*2+(rare?5:0),trait:enemy==="Pale Hound"?"Predator's Tempo":enemy==="Glass Warden"?"Prism Guard":enemy==="Veil Stalker"?"Veilstep":enemy==="Hollow Marauder"?"Executioner":"Veil-Touched"};
  p.pendingChoice=null;p.region.history.unshift(p.name+" defeated "+enemy+".");addFeed(p,enemy+" fell. Something remains in the Veil.");
  return;
 }
 if(type!=="potion"){
  let incoming=(heavy?20:10)+p.region.threat/12+(c.phase===2?4:0);if(/Marauder/i.test(c.name))incoming+=4;if(/Hound/i.test(c.name)&&heavy)incoming+=3;if(/Warden/i.test(c.name)&&type==="guard")incoming=Math.max(2,incoming-3);
  if(evaded)incoming=0;else incoming*=1-mitigation;
  p.hp=Math.max(0,Math.round(p.hp-incoming));
 }
 c.turn++;
 c.intent=enemyIntent(c);if(c.phase===2&&!/HEAVY/.test(c.intent))c.intent+=" Phase II pressure is rising.";
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
function advance(p){if(p.combat||p.pendingChoice)return;p.region.day++;p.region.corruption=Math.max(0,Math.min(100,p.region.corruption+(p.region.day%2?1:-1)));p.region.threat=Math.max(5,Math.min(100,p.region.threat+(p.region.day%3===0?3:-1)));if(p.region.threat>55)p.region.prosperity=Math.max(10,p.region.prosperity-2);if(p.region.order>60)p.region.prosperity=Math.min(95,p.region.prosperity+1);evolveRegion(p);newRumor(p);addFeed(p,"Day "+p.region.day+" begins. The world changed while you were away.");}
async function relocate(p,lat,lon){
 const reg=regionFrom(Number(lat),Number(lon));if(reg.source!=="coarse-location"||reg.key===p.region.key)return;
 const now=Date.now();p.travel??={mode:"explore",lastChangeAt:0,changes:0};
 const rapid=p.travel.lastChangeAt&&now-p.travel.lastChangeAt<150000;
 p.travel={mode:rapid?"transit":"explore",lastChangeAt:now,changes:(p.travel.changes||0)+1};
 p.region=(await loadRegion(reg.key))||freshRegion(reg);p.rumor=null;newRumor(p);
 addFeed(p,(rapid?"TRAVEL MODE — rapid movement detected. Combat signals are suppressed.":"REGION CROSSED — ")+p.region.name+".");
}
function publicState(p){return clone(p);}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>100000)throw Error("body_too_large");}return s?JSON.parse(s):{};}
const sessions=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,name:"project-ordinal-alpha",version:"0.7.0",storage:pool?"postgres":"memory"});
  if(req.method==="POST"&&u.pathname==="/api/session"){
   const b=await body(req),key=String(b.playerKey||randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80),reg=regionFrom(b.lat,b.lon);
   let p=await load(key);
   if(!p){p=freshPlayer(key,b.playerName,b.origin,reg);newRumor(p);}
   else {
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
    else if(action==="relocate")await relocate(p,b.lat,b.lon);
    else return json(res,404,{ok:false,error:"route_not_found"});
    await save(p);return json(res,200,{ok:true,state:publicState(p)});
   }
  }
  if(req.method==="GET"){
   const path=u.pathname==="/"?"/index.html":u.pathname;
   if(["/index.html","/manifest.webmanifest","/styles.css","/game.js","/effects.js"].includes(path)){const data=await readFile(new URL("./public"+path,import.meta.url));const type=path.endsWith(".webmanifest")?"application/manifest+json":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8";res.writeHead(200,{"content-type":type,"cache-control":"no-cache"});return res.end(data);}
  }
  json(res,404,{ok:false,error:"route_not_found"});
 }catch(e){json(res,400,{ok:false,error:e.message||"bad_request"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Project Ordinal v0.7 listening on "+PORT));