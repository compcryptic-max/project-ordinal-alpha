import assert from 'node:assert/strict';
import {createGuildService} from '../guilds.mjs';

const service=createGuildService(null);
const player=(key)=>({key,name:key,inventory:[],stats:{kills:30},knownDiscoveries:['one'],contracts:{completed:2},journey:{chapter:2}});
const leader=player('leader'),ally=player('ally');
const first=await service(leader,'create',{name:'First Hall'});
const second=await service(ally,'create',{name:'Second Hall'});
await service(leader,'alliance',{code:second.guild.invitation});
assert.deepEqual((await service(ally)).guild.requests,['First Hall']);
await service(ally,'accept-alliance',{name:'First Hall'});
assert.deepEqual((await service(leader)).guild.alliances,['Second Hall']);
const contribution=await service(leader,'contribute');
assert.equal(contribution.guild.resources,37);
await assert.rejects(service(leader,'contribute'),/something new/);
assert.equal((await service(leader,'upgrade')).guild.hallLevel,2);
assert.equal((await service(leader)).guild.resources,12);
await assert.rejects(service(leader,'upgrade'),/50 supplies/);
const member=player('member');
await service(member,'join',{code:first.guild.invitation});
await assert.rejects(service(member,'upgrade'),/Only the guild leader/);
const gated=player('gated');gated.knownDiscoveries=[];
await assert.rejects(service(gated,'mystery',{choice:'echo'}),/not revealed/);
await assert.rejects(service(leader,'mystery',{choice:'stone'}),/silent/);
for(let i=0;i<101;i++){
 const p=player('solver-'+i);
 for(const choice of ['echo','mercy','memory'])await service(p,'mystery',{choice});
 const result=await service(p);
 assert.equal(result.mystery.complete,true);
 assert.equal(result.mystery.opened,true);
 assert.equal(p.inventory.length,i<100?1:0);
 await assert.rejects(service(p,'mystery',{choice:'memory'}),/already unraveled/);
}
const returned=player('solver-0');
assert.equal((await service(returned)).mystery.complete,true);
assert.equal((await service(returned)).mystery.artifact,'Remembrance of the First Door');
console.log('Community rules passed: alliances, supplies, roles, mystery gates, replay protection and finite relic supply.');
