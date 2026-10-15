import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {convoyReports} from '../src/domain.js';import {State} from '../src/state.js';import {UI} from '../src/ui.js';
const first='Vous allez livrer 0 nourritures et 20 000 matériaux à Peanut dans 44m 56s - Retour le 15 oct. à 16h28';
const second='Vous allez livrer 0 nourritures et 10 000 matériaux à Peanut dans 3H 6m 9s - Retour le 15 oct. à 18h49 - Annuler';
const now=new Date('2026-10-15T12:00:00Z');
test('Batch parses line breaks, compact copies, markdown, duplicates and frozen separate arrivals',()=>{
 for(const sep of ['\n','\r\n',' - ',' ','\t']){
  const rows=convoyReports('- **'+first+sep+second+'**','Peanut',now);assert.equal(rows.length,2);assert.equal(rows[0].nbmateriaux,'20000');assert.equal(rows[1].nbmateriaux,'10000');assert.equal(rows[0].date_arrivee,'2026-10-15T12:44:56Z');assert.equal(rows[1].date_arrivee,'2026-10-15T15:06:09Z');
 }
 assert.equal(convoyReports(first+'\n'+first,'Peanut',now).length,2);
 assert.equal(convoyReports(first,'Peanut',now).length,1);
 for(const bad of [second.replace('Peanut','Other'),second.replace('3H 6m 9s','bientôt')])assert.throws(()=>convoyReports(first+'\n'+bad,'Peanut',now),/Convoi 2/);
 assert.throws(()=>convoyReports('texte inconnu '+first,'Peanut',now));
 assert.throws(()=>convoyReports(Array(21).fill('Vous allez livrer 0 et 1 à Peanut dans 1h').join('\n'),'Peanut'),/20 convois/);
 assert.throws(()=>convoyReports('x'.repeat(4001),'Peanut'),/4 000/);
});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-batch-'));let payload;const state=new State(dir);const demand={id:'8',pseudo_demandeur:'Peanut',nbpomme_restant:'0',nbmateriaux_restant:'40000'};const sid=state.create('123','deliver',{demand});const i={customId:'uptep:deliverForm:'+sid,user:{id:'123'},deferred:true,deferReply:async()=>{},fields:{fields:new Map([['report',{}]]),getTextInputValue:k=>k==='report'?first+'\n'+second:''},editReply:async p=>{payload=p;}};return {dir,state,demand,i,payload:()=>payload,close:()=>fs.rmSync(dir,{recursive:true})};}
test('Preview lists each convoy and exact total; no writes before confirmation; invalid targets and totals blocked',async()=>{
 const t=setup();try{
  let writes=0;const ui=new UI({state:t.state,api:{member:async()=>({}),request:async()=>{writes++;}}});await ui.handle(t.i);const p=t.payload();assert.match(p.content,/30.000/);assert.equal(p.embeds.length,1);assert.match(p.embeds[0].toJSON().description,/1\..*\n2\./);assert.equal(writes,0);assert.equal(p.components[0].toJSON().components[0].label,'Confirmer les convois');
  for(const raw of [first+'\n'+second.replace('Peanut','Other'),Array(3).fill(first).join('\n')]){await ui.handle({...t.i,fields:{fields:new Map([['report',{}]]),getTextInputValue:k=>k==='report'?raw:''}});assert.deepEqual(t.payload().components,[]);assert.equal(writes,0);}
 }finally{t.close();}
});
test('Partial success and lost response survive restart: stable keys, independent dates, replay without duplicate writes',async()=>{
 const t=setup();try{
  const committed=new Map(),requests=[],queued=new Set();let fail=true;
  const api={member:async()=>({}),request:async(p,{body})=>{requests.push(structuredClone(body));if(!committed.has(body.commande_id))committed.set(body.commande_id,{demande:{id:'8'},convoi:{id:String(committed.size+1)}});if(fail&&body.commande_id.endsWith(':1'))throw new Error('lost response');return committed.get(body.commande_id);}};
  const deps={api,snapshot:{invalidate(){}},refresh:async()=>{},convoyNotifications:{enqueue:r=>queued.add(r.convoi.id),flush:async()=>{}}};
  let ui=new UI({...deps,state:t.state});await ui.handle(t.i);const customId=t.payload().components[0].toJSON().components[0].custom_id;
  await ui.handle({...t.i,customId});assert.match(t.payload().content,/1\/2/);assert.equal(committed.size,2);const retryBody=requests[1];
  fail=false;ui=new UI({...deps,state:new State(t.dir)});await ui.handle({...t.i,customId});assert.match(t.payload().content,/2 convois enregistrés/);assert.equal(committed.size,2);assert.deepEqual(requests[2],retryBody);assert.notEqual(requests[0].date_arrivee,requests[1].date_arrivee);assert.equal(queued.size,2);
  await ui.handle({...t.i,customId});assert.equal(requests.length,3);
  await ui.handle({...t.i,customId,user:{id:'other'}});assert.match(t.payload().content,/ne t’appartient pas/);assert.equal(requests.length,3);
 }finally{t.close();}
});
test('Concurrent confirmation performs each request once; maximum preview stays within Discord limits',async()=>{
 const t=setup();try{
  let release,calls=0;const gate=new Promise(r=>release=r);const ui=new UI({state:t.state,api:{request:async()=>{calls++;await gate;return {demande:{id:'8'},convoi:{id:String(calls)}};}},snapshot:{invalidate(){}},refresh:async()=>{}});
  const reports=convoyReports(Array(20).fill('Vous allez livrer 0 et 1 à Peanut dans 1h').join('\n'),'Peanut',now);await ui.stageConvoys(t.i,t.demand,reports);const p=t.payload();assert(p.content.length<=2000);assert(p.embeds[0].toJSON().description.length<=4096);
  const customId=p.components[0].toJSON().components[0].custom_id;const pending=ui.handle({...t.i,customId});await new Promise(setImmediate);await ui.handle({...t.i,customId});assert.equal(calls,1);release();await pending;assert.equal(calls,20);
 }finally{t.close();}
});
