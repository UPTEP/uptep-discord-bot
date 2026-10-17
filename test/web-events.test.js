import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiveWebEvents} from '../src/web-events.js';
test('web events are saved before ack and retried when save fails',async()=>{
 const calls=[];let fail=true;
 const api={request:async(path,options)=>{if(!options)return {events:[{id:'1',kind:'validation',payload:{demande:{id:'8'}}},{id:'2',kind:'convoi',payload:{convoi:{id:'9'}}}]};calls.push('ack:'+options.body.id);return {ok:true};}};
 const notifications={enqueue:d=>calls.push('validation:'+d.id)};
 const convoyNotifications={enqueue:r=>{if(fail)throw Error('disk');calls.push('convoi:'+r.convoi.id);}};
 await assert.rejects(receiveWebEvents({api,notifications,convoyNotifications}));assert.deepEqual(calls,['validation:8','ack:1']);
 calls.length=0;fail=false;await receiveWebEvents({api,notifications,convoyNotifications});assert.deepEqual(calls,['validation:8','ack:1','convoi:9','ack:2']);
});
test('flood web events are persisted before acknowledgment and replay uses the durable queue',async()=>{
 const calls=[];let fail=true;const api={request:async(path,options)=>{if(!options)return {events:[{id:'3',kind:'flood',payload:{floods:[{id:'42'}]}}]};calls.push('ack');return {ok:true};}};
 const floods={enqueue:rows=>{if(fail)throw Error('disk');calls.push(rows[0].id);}};
 await assert.rejects(receiveWebEvents({api,floods}));assert.deepEqual(calls,[]);
 fail=false;await receiveWebEvents({api,floods});assert.deepEqual(calls,['42','ack']);
});
