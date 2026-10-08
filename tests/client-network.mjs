import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createApi, RequestError, isMissingIdentity} from '../public/client-network.js';

const ok = value => ({ok:true,status:200,json:async()=>value});
let requests = [];
const request = createApi({fetchImpl:async(path,options)=>{requests.push({path,options});return ok({state:{gold:5}})}});
assert.equal((await request('/world')).state.gold,5);
await request('/action',{method:'POST',body:{type:'attack'}});
assert.equal(requests[1].options.body,'{"type":"attack"}');
assert.ok(requests[1].options.signal instanceof AbortSignal);
const missing = new RequestError('player_not_found',{status:404,code:'player_not_found'});
assert.equal(isMissingIdentity(missing),true);
assert.equal(isMissingIdentity(new RequestError('player_not_found',{status:503,code:'player_not_found'})),false);
assert.equal(isMissingIdentity(new Error('player_not_found')),false);
let calls=0;
const disconnected=createApi({fetchImpl:async()=>{calls++;throw new TypeError('offline')}});
await assert.rejects(disconnected('/action',{method:'POST',body:{}}),error=>error.code==='connection_failed'&&/may have reached/.test(error.message));
assert.equal(calls,1,'Never automatically retry a mutation');
const badJSON=createApi({fetchImpl:async()=>({ok:false,status:502,json:async()=>{throw new SyntaxError('HTML')}})});
await assert.rejects(badJSON('/world'),error=>error.code==='invalid_response'&&error.status===502);
const slow=createApi({timeoutMs:5,fetchImpl:(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});
await assert.rejects(slow('/world'),error=>error.code==='request_timeout');

// Exercise the actual browser functions with controlled out-of-order responses.
const game=await readFile(new URL('../public/game.js',import.meta.url),'utf8');
const code=game.replace(/^import .*\n/,'').split('await restore();draw();setInterval')[0];
function client(handler, overrides = {}){
 const saved=new Map([['ordinal-session','session'],['ordinal-player','player']]);
 const context=vm.createContext({
  createApi:()=>handler,isMissingIdentity,console,setTimeout,clearTimeout,setInterval,clearInterval,
  document:{hidden:false,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}},
  localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
  navigator:{},window:{},crypto:globalThis.crypto,...overrides
 });
 vm.runInContext(code,context);
 vm.runInContext('draw=()=>{};shared=async()=>{};',context);
 return {context,saved,run:source=>vm.runInContext(source,context)};
}
const offline=client(async()=>{throw new RequestError('offline')});
await offline.run('restore()');
assert.equal(offline.saved.get('ordinal-session'),'session');
assert.equal(offline.saved.get('ordinal-player'),'player');
const gone=client(async()=>{throw missing});
await gone.run('restore()');
assert.equal(gone.saved.has('ordinal-player'),false);

let release;
const delayed=new Promise(resolve=>{release=resolve});
const world=client(async path=>path.endsWith('/presence')?{players:[]}:delayed);
world.run('onboardingStage="game";state={gold:1};');
const pending=world.run('syncWorld()');
world.run('stateEpoch++;state={gold:10};');
release({state:{gold:2}});await pending;
assert.equal(world.run('state.gold'),10,'Old refresh cannot overwrite a completed action');

let releaseGuild;
const guildWait=new Promise(resolve=>{releaseGuild=resolve});
const guild=client(async()=>guildWait);
const guildRead=guild.run('refreshGuild()');
guild.run('stateEpoch++;guildView={guild:{resources:50}};');
releaseGuild({guild:{resources:10}});await guildRead;
assert.equal(guild.run('guildView.guild.resources'),50,'Old Hall read cannot roll back a contribution');

let combatWrites=0;
const combat=client(async path=>{
 if(path.endsWith('/combat')){combatWrites++;throw new RequestError('response lost')}
 if(path.endsWith('/presence'))return {players:[]};
 return {state:{hp:8,combat:{hp:15,turn:2}}};
});
combat.run('onboardingStage="game";state={hp:10,combat:{hp:20,turn:1}};');
await assert.rejects(combat.run('act("combat",{type:"attack"})'));
assert.equal(combat.run('combatSyncLost'),true);
await assert.rejects(combat.run('act("combat",{type:"idle"})'),/paused/);
assert.equal(combatWrites,1,'Do not repeat combat writes before confirming the server state');
await combat.run('syncWorld()');
assert.equal(combat.run('combatSyncLost'),false);
assert.equal(combat.run('state.combat.turn'),2);

let timerCallback,timerDelay,timerWrites=0;
const timedCombat=client(async()=>{timerWrites++;return {state:{hp:8,combat:{hp:15,turn:2,intent:'LIGHT'}}}}, {
 setTimeout:(callback,delay)=>{timerCallback=callback;timerDelay=delay;return 1},clearTimeout(){}
});
timedCombat.run('onboardingStage="game";state={hp:10,combat:{hp:20,turn:1,intent:"HEAVY"}};draw=()=>armCombatClock();armCombatClock();');
assert.equal(timerDelay,3400);await timerCallback();assert.equal(timerWrites,1);
assert.equal(timerDelay,4800,'Successful idle turn rearms using the new intent');
timedCombat.run('document.hidden=true;');await timerCallback();assert.equal(timerWrites,1,'Hidden apps do not send idle combat');

let releaseArena,arenaRequests=0;
const arenaWait=new Promise(resolve=>{releaseArena=resolve});
const arena=client(async()=>{arenaRequests++;return arenaWait});
arena.run('pvpOpen=true;pvpView={match:{status:"active",revision:5}};');
const poll=arena.run('pollArena()');
await arena.run('pollArena()');
assert.equal(arenaRequests,1,'Only one arena poll may be in flight');
arena.run('arenaEpoch++;pvpView={match:{status:"active",revision:6}};');
releaseArena({match:{status:'active',revision:4}});await poll;
assert.equal(arena.run('pvpView.match.revision'),6,'Old arena poll cannot overwrite a move');
arena.run('document.hidden=true;');await arena.run('pollArena()');
assert.equal(arenaRequests,1,'Hidden tabs do not keep polling');
// HTTP failures must never replace a working cached app shell.
const workerHandlers={};let writes=0,cached;
let workerFetch=async()=>new Response('bad gateway',{status:502});
const worker=vm.createContext({
 URL,Response,location:{origin:'https://ordinal.test'},
 self:{addEventListener:(name,handler)=>workerHandlers[name]=handler},
 fetch:request=>workerFetch(request),
 caches:{open:async()=>({put:async()=>{writes++}}),match:async()=>cached}
});
vm.runInContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),worker);
async function shellFetch(){let response;workerHandlers.fetch({request:{method:'GET',url:'https://ordinal.test/game.js'},respondWith:value=>response=value});return await response}
assert.equal((await shellFetch()).status,502);assert.equal(writes,0);
workerFetch=async()=>new Response('valid script',{status:200});
assert.equal((await shellFetch()).status,200);assert.equal(writes,1);
workerFetch=async()=>{throw new Error('offline')};
assert.equal((await shellFetch()).status,503);
cached=new Response('cached script',{status:200});assert.equal(await (await shellFetch()).text(),'cached script');

// Exercise the actual effect scheduler without relying on a display/GPU.
let nextFrame=1,frames=new Map(),clears=0;
const events={},motion={matches:false,addEventListener:(_,handler)=>events.motion=handler};
const canvas={width:0,height:0,style:{},getContext:()=>({clearRect:()=>clears++,createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})};
const host={isConnected:true,querySelector:()=>canvas,getBoundingClientRect:()=>({width:300,height:400})};
const effectsDoc={hidden:false,querySelector:selector=>selector==='.encounter'?host:null,getElementById:()=>({}),addEventListener:(name,handler)=>events[name]=handler};
vm.runInNewContext(await readFile(new URL('../public/effects.js',import.meta.url),'utf8'),{
 document:effectsDoc,window:{devicePixelRatio:2},matchMedia:()=>motion,navigator:{},
 MutationObserver:class{observe(){}},addEventListener(){},
 requestAnimationFrame:callback=>{const id=nextFrame++;frames.set(id,callback);return id},cancelAnimationFrame:id=>frames.delete(id)
});
function frame(time){const scheduled=[...frames.values()];frames.clear();for(const callback of scheduled)callback(time)}
frame(0);assert.equal(clears,1);frame(16);assert.equal(clears,1);frame(34);assert.equal(clears,2);
effectsDoc.hidden=true;events.visibilitychange();assert.equal(frames.size,0);
effectsDoc.hidden=false;motion.matches=true;events.motion();frame(100);assert.equal(frames.size,0,'Reduce Motion renders one static frame');
console.log('Client resilience passed: timeouts, identity retention, stale world/Hall/PvP protection, uncertain-combat pause/resync, cache safety, hidden-app effects and Reduce Motion.');
