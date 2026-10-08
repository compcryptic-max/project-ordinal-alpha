import assert from 'node:assert/strict';
import {createEnvironmentService} from '../environment.mjs';
let now=1800000000000,calls=0,fail=false;
const service=createEnvironmentService({clock:()=>now,fetcher:async url=>{
 calls++; assert.equal(url.hostname,'api.open-meteo.com');assert.equal(url.searchParams.get('timeformat'),'unixtime');
 if(fail)throw Error('offline');
 return {ok:true,json:async()=>({timezone:'America/Los_Angeles',current:{time:now/1000,rain:.4,is_day:1}})};
}});
assert.equal(service.read('demo-region').status,'unavailable');assert.equal(calls,0);
assert.equal(service.read('c1200:3087:-10548').status,'unavailable');
service.read('c1200:3087:-10548');await service.settled();assert.equal(calls,1);
assert.equal(service.read('c1200:3087:-10548').rainBoost,true);
now+=21*60*1000;fail=true;assert.equal(service.read('c1200:3087:-10548').status,'stale');
await service.settled();assert.equal(service.read('c1200:3087:-10548').rainBoost,false);
assert.equal(calls,2);service.read('c1200:3087:-10548');assert.equal(calls,2);
const disabled=createEnvironmentService({enabled:false,fetcher:()=>{throw Error('must not fetch')}});
assert.equal(disabled.read('c1200:3087:-10548').status,'unavailable');
console.log('Environment passed: coarse requests, caching, single-flight, expiry, failure backoff and disable switch.');
