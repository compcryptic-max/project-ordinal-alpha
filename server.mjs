import http from "node:http";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {randomUUID,createHash} from "node:crypto";

const PORT=Number(process.env.PORT||8787);
const DB=process.env.DATABASE_URL||"";
const pool=DB?new Pool({connectionString:DB,ssl:{rejectUnauthorized:false},max:5}):null;
const memory=new Map();
if(pool) await pool.query("create table if not exists ordinal_players (player_key text primary key, payload jsonb not null, updated_at timestamptz default now())");
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
function freshPlayer(key,name,origin,region){
 const o=origins[origin]||origins.Rogue;
 return {key,name:String(name||"Wayfarer").slice(0,18),origin:origins[origin]?origin:"Rogue",level:1,xp:0,xpNeeded:100,gold:35,hp:o.hp,maxHp:o.hp,skill:o.skill,inventory:[{id:"starter",name:o.weapon,rarity:"Common"},{id:"potion",name:"Wayfarer Tonic",rarity:"Uncommon",qty:2}],equipment:{weapon:"starter"},titles:[],reputation:0,region:{key,name:region.name,day:1,stage:"Unsettled",faction:"Wayfall Compact",corruption:37,order:48,prosperity:55,threat:31,history:[],discoveries:[]},rumor:null,combat:null,pendingChoice:null,feed:[{text:"You entered "+region.name+". The region was already moving before you arrived."}]};
}
async function load(key){
 if(pool){const {rows}=await pool.query("select payload from ordinal_players where player_key=$1",[key]);return rows[0]?.payload||null;}
 return memory.get(key)||null;
}
async function save(p){
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
 const boss=p.rumor.enemy,first=!p.region.discoveries.includes("glass-shrine");
 if(first){p.region.discoveries.push("glass-shrine");p.region.history.unshift(p.name+" discovered the Glass Shrine.");addFeed(p,"FIRST DISCOVERY — Glass Shrine.");}
 const hp=72+p.level*12;
 p.combat={name:boss,hp,maxHp:hp,turn:1,intent:"The enemy circles for an opening."};
 addFeed(p,boss+" emerged from the distortion.");
}
function fight(p,type){
 const c=p.combat;if(!c)return;
 let dmg=type==="skill"?22+p.level*3:type==="attack"?12+p.level*2:0;
 if(type==="potion"){const pot=p.inventory.find(i=>i.id==="potion"&&(i.qty||0)>0);if(pot){pot.qty--;p.hp=Math.min(p.maxHp,p.hp+42);addFeed(p,"You used a Wayfarer Tonic.");}return;}
 if(type==="guard"){p.hp=Math.min(p.maxHp,p.hp+3);addFeed(p,"You brace for the impact.");}
 else {c.hp=Math.max(0,c.hp-dmg);addFeed(p,(type==="skill"?p.skill:"Attack")+" dealt "+dmg+" damage.");}
 if(c.hp<=0){
  const enemy=c.name;p.combat=null;p.gold+=24+p.level*3;level(p,42);p.reputation+=2;
  p.inventory.push({id:"loot-"+Date.now(),name:enemy==="Pale Hound"?"Moon-Split Fang":"Veilbound Fragment",rarity:p.level>=3?"Epic":"Rare"});
  p.pendingChoice="glass-shrine";p.region.history.unshift(p.name+" defeated "+enemy+".");addFeed(p,enemy+" fell. The region remembers.");
  return;
 }
 const incoming=Math.max(4,10+p.region.threat/12-(type==="guard"?7:0));p.hp=Math.max(0,Math.round(p.hp-incoming));c.turn++;c.intent=c.turn%3===0?"HEAVY ATTACK TELEGRAPHED — guard or risk the hit.":"The enemy searches for an opening.";
 if(p.hp<=0){p.hp=Math.ceil(p.maxHp*.55);p.combat=null;p.region.threat=Math.min(100,p.region.threat+4);p.region.history.unshift(p.name+" left a Death Echo.");addFeed(p,"DEATH ECHO — You awaken wounded, but permanent gear remains.");}
}
function shrine(p,choice){
 if(p.pendingChoice!=="glass-shrine")return;
 if(choice==="cleanse"){p.region.corruption=Math.max(0,p.region.corruption-9);p.region.order=Math.min(100,p.region.order+6);p.region.history.unshift(p.name+" cleansed the Glass Shrine.");addFeed(p,"The shrine clears. Order strengthens.");}
 else {p.region.corruption=Math.min(100,p.region.corruption+7);p.region.threat=Math.min(100,p.region.threat+5);p.gold+=40;p.region.history.unshift(p.name+" bound the Glass Shrine.");addFeed(p,"You bind the shrine and take its power.");}
 p.pendingChoice=null;p.rumor=null;
}
function advance(p){if(p.combat||p.pendingChoice)return;p.region.day++;p.region.corruption=Math.max(0,Math.min(100,p.region.corruption+(p.region.day%2?1:-1)));p.region.threat=Math.max(5,Math.min(100,p.region.threat+(p.region.day%3===0?3:-1)));newRumor(p);addFeed(p,"Day "+p.region.day+" begins. The world changed while you were away.");}
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
   let p=await load(key);if(!p){p=freshPlayer(key,b.playerName,b.origin,reg);newRumor(p);}else addFeed(p,"Your character returned from persistent storage.");
   const id=randomUUID();sessions.set(id,p);await save(p);return json(res,201,{sessionId:id,playerKey:key,regionKey:p.region.key,regionSource:p.region.key===reg.key?reg.source:"persistent",state:publicState(p)});
  }
  const m=u.pathname.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
  if(m){
   const p=sessions.get(m[1]),action=m[2]||"";if(!p)return json(res,404,{ok:false,error:"session_not_found"});
   if(req.method==="GET"&&!action)return json(res,200,{ok:true,state:publicState(p)});
   if(req.method==="GET"&&action==="presence")return json(res,200,{ok:true,players:[...sessions.values()].filter(x=>x!==p&&x.region.key===p.region.key).slice(0,25).map(x=>({name:x.name,origin:x.origin,level:x.level,title:x.titles[0]||null}))});
   if(req.method==="POST"){
    const b=await body(req);
    if(action==="investigate")investigate(p);
    else if(action==="combat")fight(p,b.type);
    else if(action==="choice")shrine(p,b.choice);
    else if(action==="advance")advance(p);
    else return json(res,404,{ok:false,error:"route_not_found"});
    await save(p);return json(res,200,{ok:true,state:publicState(p)});
   }
  }
  if(req.method==="GET"){
   const path=u.pathname==="/"?"/index.html":u.pathname;
   if(["/index.html","/manifest.webmanifest"].includes(path)){const data=await readFile(new URL("./public"+path,import.meta.url));res.writeHead(200,{"content-type":path.endsWith(".webmanifest")?"application/manifest+json":"text/html; charset=utf-8"});return res.end(data);}
  }
  json(res,404,{ok:false,error:"route_not_found"});
 }catch(e){json(res,400,{ok:false,error:e.message||"bad_request"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Project Ordinal v0.7 listening on "+PORT));