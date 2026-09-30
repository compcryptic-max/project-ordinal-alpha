import {spawn,spawnSync} from "node:child_process";
import process from "node:process";
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
 const inv=await fetch(base+"/api/session/"+sid+"/investigate",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.json());
 if(!inv.state.combat)throw new Error("investigate did not create combat");
 const hit=await fetch(base+"/api/session/"+sid+"/combat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"attack"})}).then(r=>r.json());
 if(!(hit.state.combat?.hp<inv.state.combat.hp))throw new Error("combat attack did not deal damage");
 if(!(hit.state.mastery?.xp>0))throw new Error("mastery did not progress");
 const equipped=await fetch(base+"/api/session/"+sid+"/equip",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"starter"})}).then(r=>r.json());
 if(equipped.state.equipment.weapon!=="starter")throw new Error("equip route failed");
 console.log("Project Ordinal smoke tests passed");
}finally{child.kill("SIGTERM")}
