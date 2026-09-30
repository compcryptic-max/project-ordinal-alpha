// Project Ordinal procedural presentation layer.
// Canvas is decorative only: gameplay remains server-authoritative.
const DPR=()=>Math.min(2,window.devicePixelRatio||1);
let worldRAF=0,fieldRAF=0,combatRAF=0,worldSeed=1337;
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const rng=seed=>()=>((seed=Math.imul(seed^seed>>>15,1|seed),seed^=seed+Math.imul(seed^seed>>>7,61|seed),((seed^seed>>>14)>>>0)/4294967296));
function canvasFor(host,cls){
 let c=host.querySelector("canvas."+cls);if(!c){c=document.createElement("canvas");c.className=cls;c.setAttribute("aria-hidden","true");host.prepend(c)}
 const r=host.getBoundingClientRect(),d=DPR(),w=Math.max(1,Math.floor(r.width*d)),h=Math.max(1,Math.floor(r.height*d));
 if(c.width!==w||c.height!==h){c.width=w;c.height=h;c.style.width=r.width+"px";c.style.height=r.height+"px"}
 return {c,ctx:c.getContext("2d"),w,h,d};
}
function palette(){
 const g=document.querySelector(".game"),status=document.querySelector(".field-status")?.textContent||document.querySelector(".world-intel")?.textContent||"";
 let p={sky:"#10191d",far:"#18262a",near:"#0b1212",accent:"#8fe8e0",weather:"mist"};
 if(g?.classList.contains("biome-ember-vale"))p={sky:"#24120d",far:"#382019",near:"#100907",accent:"#ef8b54",weather:"ash"};
 else if(g?.classList.contains("biome-glassward"))p={sky:"#171225",far:"#28203d",near:"#0d0914",accent:"#b59cff",weather:"shards"};
 else if(g?.classList.contains("biome-dusk-march"))p={sky:"#0b1d17",far:"#173127",near:"#07100c",accent:"#80d3a1",weather:"fireflies"};
 else if(g?.classList.contains("biome-hollow-meridian"))p={sky:"#0c1820",far:"#172d36",near:"#071016",accent:"#9bcbd7",weather:"rain"};
 else if(g)p={sky:"#21150f",far:"#38261a",near:"#100b08",accent:"#e3b36d",weather:"dust"};
 if(/ARC (INTERFERENCE|STORM)/i.test(status))p.weather="arc";
 else if(/VEIL HAZE|DRIFTING MIST/i.test(status))p.weather="haze";
 return p;
}
function ridge(ctx,w,h,y,amp,steps,color,seed){
 const r=rng(seed);ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(0,y);
 for(let i=0;i<=steps;i++){const x=w*i/steps,yy=y-(r()*.75+.15)*amp;ctx.lineTo(x,yy)}
 ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function drawWorld(){
 cancelAnimationFrame(worldRAF);
 const host=document.querySelector(".viewport");if(!host)return;
 const region=document.querySelector(".region")?.textContent||"Ordinal";
 worldSeed=hash(region);
 const P=palette(),particles=Array.from({length:42},(_,i)=>({x:(hash(region+i)%1000)/1000,y:(hash(i+region)%997)/997,s:1+(i%3),v:.08+(i%5)*.025,p:i*.77}));
 const loop=t=>{
  if(!host.isConnected)return;
  const {ctx,w,h,d}=canvasFor(host,"world-canvas");ctx.clearRect(0,0,w,h);
  const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,P.sky);grad.addColorStop(.72,"rgba(0,0,0,0)");ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  ridge(ctx,w,h,h*.56,h*.23,12,P.far,worldSeed+7);ridge(ctx,w,h,h*.68,h*.16,18,P.near,worldSeed+19);
  // winding path into the scene
  ctx.beginPath();ctx.moveTo(w*.42,h);ctx.bezierCurveTo(w*.46,h*.76,w*.63,h*.69,w*.57,h*.53);ctx.lineTo(w*.60,h*.52);ctx.bezierCurveTo(w*.68,h*.70,w*.54,h*.78,w*.56,h);ctx.closePath();ctx.fillStyle="rgba(178,172,145,.10)";ctx.fill();
  for(const q of particles){
   let x=(q.x*w+(t*.012*q.v*w))%w,y=(q.y*h+Math.sin(t*.001+q.p)*h*.025)%h;
   if(P.weather==="rain"){ctx.strokeStyle="rgba(174,210,220,.16)";ctx.lineWidth=d;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5*d,y+18*d);ctx.stroke()}
   else if(P.weather==="shards"){ctx.save();ctx.translate(x,y);ctx.rotate(t*.001+q.p);ctx.fillStyle="rgba(181,156,255,.16)";ctx.fillRect(-q.s*d,-5*d,q.s*d,10*d);ctx.restore()}
   else if(P.weather==="arc"){ctx.strokeStyle=P.accent+"2e";ctx.lineWidth=(q.s*.6+1)*d;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(q.p+t*.004)*12*d,y+10*d);ctx.lineTo(x-6*d,y+24*d);ctx.stroke();if((Math.floor(t/700)+q.p|0)%17===0){ctx.fillStyle=P.accent+"08";ctx.fillRect(0,0,w,h)}}
   else if(P.weather==="haze"){ctx.save();ctx.globalAlpha=.045;ctx.fillStyle=P.accent;ctx.beginPath();ctx.ellipse(x,y,24*q.s*d,7*q.s*d,0,0,Math.PI*2);ctx.fill();ctx.restore()}
   else {const glow=P.weather==="fireflies"?.55:.18;ctx.beginPath();ctx.arc(x,y,q.s*d,0,Math.PI*2);ctx.fillStyle=P.accent+Math.round(glow*255).toString(16).padStart(2,"0");ctx.fill()}
  }
  // moving veil scan around the active signal
  const sig=host.querySelector(".worldnode.signal");if(sig){const sr=sig.getBoundingClientRect(),hr=host.getBoundingClientRect(),x=(sr.left-hr.left+sr.width/2)*d,y=(sr.top-hr.top+sr.height/2)*d,r=(34+((t*.035)%36))*d;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle=P.accent+"35";ctx.lineWidth=d;ctx.stroke()}
  worldRAF=requestAnimationFrame(loop);
 };worldRAF=requestAnimationFrame(loop);
}
function drawFieldStage(){
 cancelAnimationFrame(fieldRAF);const host=document.querySelector(".world-stage");if(!host)return;
 const P=palette(),seed=hash(document.querySelector(".world-identity b")?.textContent||"Ordinal"),r=rng(seed),pts=Array.from({length:55},(_,i)=>({x:r(),y:r(),s:.5+r()*1.8,p:r()*6.28,v:.3+r()}));
 const loop=t=>{if(!host.isConnected)return;const {ctx,w,h,d}=canvasFor(host,"field-canvas");ctx.clearRect(0,0,w,h);
  for(let i=0;i<pts.length;i++){const q=pts[i],x=(q.x*w+Math.sin(t*.0003*q.v+q.p)*18*d),y=(q.y*h+t*.015*q.v)%(h*1.08);ctx.beginPath();ctx.arc(x,y,q.s*d,0,Math.PI*2);ctx.fillStyle=P.accent+(i%7===0?"65":"28");ctx.fill()}
  const sweep=(t*.06)%(w*1.5)-w*.25;ctx.save();ctx.globalAlpha=.08;const g=ctx.createLinearGradient(sweep-70*d,0,sweep+70*d,0);g.addColorStop(0,"transparent");g.addColorStop(.5,P.accent);g.addColorStop(1,"transparent");ctx.fillStyle=g;ctx.fillRect(0,h*.42,w,h*.58);ctx.restore();
  fieldRAF=requestAnimationFrame(loop);
 };fieldRAF=requestAnimationFrame(loop);
}
let bursts=[];
function burst(kind,x,y){
 const n=kind==="skill"?34:kind==="attack"?20:kind==="guard"?16:12;
 for(let i=0;i<n;i++){const a=Math.PI*2*i/n+(Math.random()-.5)*.4,sp=1.5+Math.random()*4;bursts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,size:1+Math.random()*3,kind})}
}
function drawCombat(){
 cancelAnimationFrame(combatRAF);const host=document.querySelector(".encounter");if(!host)return;
 const loop=()=>{
  if(!host.isConnected)return;
  const {ctx,w,h,d}=canvasFor(host,"combat-fx");ctx.clearRect(0,0,w,h);
  // subtle floor haze
  const g=ctx.createRadialGradient(w*.5,h*.72,0,w*.5,h*.72,w*.42);g.addColorStop(0,"rgba(126,190,177,.10)");g.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  bursts=bursts.filter(p=>p.life>0);
  for(const p of bursts){p.x+=p.vx*d;p.y+=p.vy*d;p.vy+=.035;p.life-=.025;ctx.globalAlpha=Math.max(0,p.life);ctx.beginPath();ctx.arc(p.x,p.y,p.size*d,0,Math.PI*2);ctx.fillStyle=p.kind==="skill"?"#9ff8ef":p.kind==="guard"?"#d6e5ef":p.kind==="potion"?"#dc83a2":"#f1d7aa";ctx.fill()}
  ctx.globalAlpha=1;combatRAF=requestAnimationFrame(loop);
 };combatRAF=requestAnimationFrame(loop);
}
function applyLayout(){
 const host=document.querySelector(".viewport"),name=document.querySelector(".region")?.textContent;if(!host||!name)return;
 const r=rng(hash(name+"layout"));
 const nodes=[[".worldnode.town",24,58],[".worldnode.signal",58,28],[".worldnode.shrine",66,55]];
 nodes.forEach(([sel,minX,minY],i)=>{const n=host.querySelector(sel);if(!n)return;n.style.left=(minX+r()*18)+"%";n.style.top=(minY+r()*14)+"%";});
}
function applyTime(){
 const g=document.querySelector(".game");if(!g)return;
 g.classList.remove("time-dawn","time-day","time-dusk","time-night");
 const h=new Date().getHours(),mode=h<6||h>=21?"night":h<9?"dawn":h<18?"day":"dusk";
 g.classList.add("time-"+mode);
 const moon=g.querySelector(".moon");if(moon)moon.setAttribute("data-time",mode.toUpperCase());
}
function refresh(){applyTime();applyLayout();if(document.querySelector(".viewport"))drawWorld();else cancelAnimationFrame(worldRAF);if(document.querySelector(".world-stage"))drawFieldStage();else cancelAnimationFrame(fieldRAF);if(document.querySelector(".encounter"))drawCombat();else cancelAnimationFrame(combatRAF)}
let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh()})}).observe(document.getElementById("app"),{childList:true,subtree:true});
addEventListener("resize",refresh,{passive:true});
document.addEventListener("pointerdown",e=>{
 const b=e.target.closest(".skill");if(!b)return;const host=document.querySelector(".encounter");if(!host)return;
 const r=host.getBoundingClientRect(),enemy=host.querySelector(".enemy-art")?.getBoundingClientRect(),kind=b.dataset.type||"attack";
 const x=((enemy?.left??r.width*.5)-r.left+(enemy?.width??0)/2)*DPR(),y=((enemy?.top??r.height*.42)-r.top+(enemy?.height??0)/2)*DPR();
 burst(kind,x,y);if(navigator.vibrate)navigator.vibrate(kind==="skill"?35:15);
 host.classList.remove("impact");void host.offsetWidth;host.classList.add("impact");
},{passive:true});
refresh();
