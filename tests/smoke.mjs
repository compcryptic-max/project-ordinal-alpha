import {spawn,spawnSync} from "node:child_process";
import process from "node:process";
import {readFile} from "node:fs/promises";
const gameSource=await readFile("public/game.js","utf8");
const bindingSource=gameSource.replaceAll("$$(","__ALL__("); if(bindingSource.includes('$("[data-')||gameSource.includes("$$$("))throw new Error("regression: broken selector binding");
if(!gameSource.includes('$=s=>[...document.querySelectorAll(s)]'))throw new Error("multi-selector helper missing");
if(!gameSource.includes("function nearby()")||!gameSource.includes("field-node"))throw new Error("field network UI missing");
if(!gameSource.includes('function regionMap()'))throw new Error("regional map renderer missing");
for(const file of ["server.mjs","public/game.js","public/effects.js"]){
 const c=spawnSync(process.execPath,["--check",file],{stdio:"pipe"});
 if(c.status!==0)throw new Error(file+" syntax check failed: "+c.stderr.toString());
}
const port=8791,child=spawn(process.execPath,["server.mjs"],{env:{...process.env,PORT:String(port),DATABASE_URL:""},stdio:["ignore","pipe","pipe"]});
let output="";child.stdout.on("data",d=>output+=d);child.stderr.on("data",d=>output+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(let i=0;i<40&&!output.includes("listening");i++)await sleep(100);
 if(!output.includes("listening"))throw new Error("server did not start: "+output);
 const base="http://127.0.0.1:"+port;
 const health=await fetch(base+"/health").then(r=>r.json());
 if(!health.ok)throw new Error("health failed");
 for(const asset of ["/","/styles.css","/game.js","/effects.js","/ordinal-icon.svg"]){const r=await fetch(base+asset);if(!r.ok)throw new Error(asset+" not served");}
 const created=await fetch(base+"/api/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerKey:"smoke-player",playerName:"Smoke",origin:"Rogue"})}).then(r=>r.json());
 if(!created.sessionId||created.state.origin!=="Rogue")throw new Error("session create failed");
 const sid=created.sessionId;
 if(!Array.isArray(created.state.field)||created.state.field.length<4)throw new Error("timed field nodes missing");
 if(!(created.state.ordinalRating>=100))throw new Error("ordinal rating missing");
 const checkin=await fetch(base+"/api/session/"+sid+"/checkin",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.json());
 if(checkin.state.activity.streak<1)throw new Error("daily sync failed");
 const collectable=checkin.state.field.find(n=>n.action==="collect"&&!n.collected);
 const collected=await fetch(base+"/api/session/"+sid+"/collect",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:collectable.id})}).then(r=>r.json());
 if(!collected.state.activity.collected.includes(collectable.id))throw new Error("field collection failed");
 if(!collected.state.journey?.title||!Array.isArray(collected.state.contractList))throw new Error("personal journey system missing");
 const called=await fetch(base+"/api/session/"+sid+"/calling",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"hunter"})}).then(r=>r.json());
 if(called.state.journey.calling!=="hunter")throw new Error("calling selection failed");

 const scout=await fetch(base+"/api/session/"+sid+"/scout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.json());
 if(!(scout.state.region.discoveries||[]).includes("sunken-road"))throw new Error("scouting did not reveal first map landmark");
 const inv=await fetch(base+"/api/session/"+sid+"/investigate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.json());
 if(!inv.state.combat)throw new Error("investigate did not create combat");
 const hit=await fetch(base+"/api/session/"+sid+"/combat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"attack"})}).then(r=>r.json());
 if(!(hit.state.combat?.hp<inv.state.combat.hp))throw new Error("combat attack did not deal damage");
 if(!(hit.state.mastery?.xp>0))throw new Error("mastery did not progress");
 const equipped=await fetch(base+"/api/session/"+sid+"/equip",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"starter"})}).then(r=>r.json());
 if(equipped.state.equipment.weapon!=="starter")throw new Error("equip route failed");
 console.log("Project Ordinal smoke tests passed");
}finally{child.kill("SIGTERM")}
