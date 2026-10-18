import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {UI} from '../src/ui.js';import {State} from '../src/state.js';import {ApiError} from '../src/api.js';
const demand={id:'8',pseudo_demandeur:'Target',nbpomme_restant:'100',nbmateriaux_restant:'100'};
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-excess-'));let payload,modal;const state=new State(dir);const i={user:{id:'123'},deferred:true,deferReply:async()=>{},editReply:async p=>payload=p,showModal:async m=>modal=m.toJSON()};return {state,i,payload:()=>payload,modal:()=>modal,close:()=>fs.rmSync(dir,{recursive:true})};}
const button=t=>t.payload().components[0].toJSON().components[0].custom_id;
test('Any excess is warned with exact quantities; edit or confirm, immutable retry',async()=>{
 for(const [apple,wood] of [['0','101'],['9007199254740993','0'],['200','300']]){
  const t=setup();try{let calls=[],fail=true;const ui=new UI({state:t.state,snapshot:{get:async()=>[demand],invalidate(){}},refresh:async()=>{},api:{request:async(_,{body})=>{calls.push(structuredClone(body));if(fail)throw Error('lost');return {demande:demand};}}});
  await ui.stage(t.i,'deliver',{path:'/demandes/8/convois',demand,body:{nbpomme:apple,nbmateriaux:wood},summary:'Envoi'});assert.match(t.payload().content,/Attention.*dépasse/);assert.equal(calls.length,0);const customId=button(t);const job=t.state.get(customId.split(':')[2],'123');assert.equal(job.data.body.overage_confirmed.pommes,String(BigInt(apple)>100n?BigInt(apple)-100n:0n));
  await ui.handle({...t.i,customId});fail=false;await ui.handle({...t.i,customId});assert.deepEqual(calls[0],calls[1]);
 }finally{t.close();}}
});
test('A concurrent convoy changes excess and requires a fresh confirmation',async()=>{
 const t=setup();try{let current=demand,calls=[];const ui=new UI({state:t.state,snapshot:{get:async()=>[current],invalidate(){}},refresh:async()=>{},api:{request:async(_,{body})=>{calls.push(structuredClone(body));if(calls.length===1){current={...demand,nbmateriaux_restant:'50'};throw new ApiError(409,'Attention, dépassement du restant demandé : 51 matériaux.');}return {demande:demand};}}});
 await ui.stage(t.i,'deliver',{path:'/demandes/8/convois',demand,body:{nbpomme:'0',nbmateriaux:'101'},summary:'Convoi'});const first=button(t);await ui.handle({...t.i,customId:first});assert.equal(calls.length,1);assert.match(t.payload().content,/51 matériaux/);const next=button(t);assert.notEqual(first,next);await ui.handle({...t.i,customId:next});assert.equal(calls[1].overage_confirmed.materiaux,'51');
 }finally{t.close();}
});
test('Batch preview includes total excess, per-line acknowledgements and editable reports',async()=>{
 const t=setup();try{const ui=new UI({state:t.state});await ui.stageConvoys(t.i,demand,[{nbpomme:'100',nbmateriaux:'150'},{nbpomme:'10',nbmateriaux:'20'}]);assert.match(t.payload().content,/10 pommes.*70 matériaux/);const id=button(t).split(':')[2],job=t.state.get(id,'123');assert.deepEqual(job.data.items.map(item=>item.body.overage_confirmed),[{pommes:'0',materiaux:'50'},{pommes:'10',materiaux:'20'}]);
 await ui.handle({...t.i,customId:'uptep:editBatch:'+id});assert.match(t.modal().custom_id,/deliverForm/);assert.match(t.modal().components[0].components[0].value,/Vous allez livrer 100 et 150/);assert.equal(t.state.get(id,'123').data.superseded,true);
 }finally{t.close();}
});
test('Changed batch remaining rewarns for missing lines and preserves completed receipts',async()=>{
 const t=setup();try{let current=demand,calls=[];const ui=new UI({state:t.state,snapshot:{get:async()=>[current],invalidate(){}},refresh:async()=>{},api:{request:async(_,{body})=>{calls.push(structuredClone(body));if(calls.length===2){current={...demand,nbpomme_restant:'0',nbmateriaux_restant:'0'};throw new ApiError(409,'Attention, dépassement : 20 matériaux.');}return {demande:demand,convoi:{id:body.commande_id}};}}});
 await ui.stageConvoys(t.i,demand,[{nbpomme:'0',nbmateriaux:'90'},{nbpomme:'0',nbmateriaux:'20'}]);const start=button(t);await ui.handle({...t.i,customId:start});assert.equal(calls.length,2);assert.match(t.payload().content,/20 matériaux/);const ack=button(t);assert.match(ack,/confirmOverageBatch/);await ui.handle({...t.i,customId:ack});assert.equal(calls.length,3);assert.equal(calls[2].commande_id,calls[1].commande_id);assert.deepEqual(calls[2].overage_confirmed,{pommes:'0',materiaux:'20'});assert.match(t.payload().content,/2 convois enregistrés/);
 }finally{t.close();}
});
