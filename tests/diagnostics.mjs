import assert from 'node:assert/strict';
import {diagnosticReport} from '../public/diagnostics.js';
const text=diagnosticReport({key:'secret-key',name:'private name',lat:34.5,account:{password:'password'},combat:{},environment:{status:'current'}},{online:false});
assert.match(text,/Combat active: true/);assert.match(text,/Network online: false/);
for(const secret of ['secret-key','private name','34.5','password'])assert.ok(!text.includes(secret));
assert.match(diagnosticReport(null),/Character loaded: false/);
console.log('Diagnostics passed: useful flags without identity, credentials or location.');
