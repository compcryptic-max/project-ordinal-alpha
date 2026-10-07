import assert from 'node:assert/strict';
import {createAccountService} from '../accounts.mjs';
import {spawn} from 'node:child_process';
const service=await createAccountService(null);
const created=await service('signup',{login:'made up address',displayName:'Tester',password:'1'});
assert.equal(created.verificationRequired,false);
assert.equal(created.password,undefined);
assert.equal((await service('signin',{login:'MADE UP ADDRESS',password:'1'})).playerKey,created.playerKey);
await assert.rejects(service('signup',{login:'made up address',password:'x'}),/already exists/);
await assert.rejects(service('signin',{login:'made up address',password:'wrong'}),/not accepted/);
await assert.rejects(service('recover',{login:'made up address',password:'new',recoveryCode:'wrong'}),/not accepted/);
const recovered=await service('recover',{login:'made up address',password:'new',recoveryCode:created.recoveryCode});
assert.equal(recovered.playerKey,created.playerKey);
assert.notEqual(recovered.recoveryCode,created.recoveryCode);
await assert.rejects(service('signin',{login:'made up address',password:'1'}),/not accepted/);
await assert.rejects(service('recover',{login:'made up address',password:'other',recoveryCode:created.recoveryCode}),/not accepted/);
assert.equal((await service('signin',{login:'made up address',password:'new'})).playerKey,created.playerKey);
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8794',DATABASE_URL:''},stdio:'ignore'});
const base='http://127.0.0.1:8794';
try{
 for(let i=0;i<60;i++){try{await fetch(base+'/health');break}catch{await new Promise(r=>setTimeout(r,50))}}
 for(const [path,type] of [['/assets/monsters/pale-hound.webp','image/webp'],['/assets/characters/rogue.webp','image/webp'],['/ordinal-icon.png','image/png']]){
  const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),type);assert.ok((await response.arrayBuffer()).byteLength>1000);
 }
 const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()}};
 const signup=await post('/api/account/signup',{login:'no-real-email',password:'a',displayName:'Alpha'});assert.equal(signup.status,200);
 const player=await post('/api/session',{playerKey:signup.data.account.playerKey,playerName:'Account Hero',origin:'Ranger'});assert.equal(player.status,201);
 const signin=await post('/api/account/signin',{login:'no-real-email',password:'a'});
 const restored=await post('/api/session',{playerKey:signin.data.account.playerKey,recoverOnly:true});assert.equal(restored.data.state.name,'Account Hero');
 console.log('Accounts passed: arbitrary alpha details, hashed-password login, secret recovery rotation, character continuity, and art delivery.');
}finally{child.kill('SIGTERM')}
