import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {UI,boardPayload} from '../src/ui.js';
import {State} from '../src/state.js';
import {ApiError} from '../src/api.js';
import {reportPayload} from '../src/reports.js';
import {deliveryPayload} from '../src/deliveries.js';

function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-auto-'));const state=new State(dir);let payload,modal;const interaction={user:{id:'123'},deferred:true,deferReply:async()=>{},editReply:async p=>payload=p,showModal:async m=>modal=m.toJSON()};return {state,interaction,payload:()=>payload,modal:()=>modal,close:()=>fs.rmSync(dir,{recursive:true})};}
const demand={id:'8',iddemandeur:'2',pseudo_demandeur:'Target',valide:true,auto_production:true,objet:'Solarium',niveau:10,nbpomme_original:'100',nbmateriaux_original:'100',nbpomme_restant:'100',nbmateriaux_restant:'100',version_modification:'a'.repeat(64)};

test('Auto production is visible in the board/detail and warned before a single declaration',async()=>{
 const t=setup();try{let calls=0;const ui=new UI({state:t.state,api:{request:async()=>{calls++;return {demande:demand};}},snapshot:{get:async()=>[demand],invalidate(){}},refresh:async()=>{}});
 assert.match(boardPayload([demand]).embeds[0].toJSON().description,/Auto production/);assert.match(ui.detail(demand).embeds[0].toJSON().description,/Auto production/);
 await ui.stage(t.interaction,'deliver',{path:'/demandes/8/convois',body:{nbpomme:'10',nbmateriaux:'20'},summary:'Déclarer',demand:{...demand,auto_production:false}});
 assert.match(t.payload().content,/Souhaites-tu quand même/);assert.equal(calls,0);const customId=t.payload().components[0].toJSON().components[0].custom_id;const job=t.state.get(customId.split(':')[2],'123');assert.equal(job.data.body.auto_production_confirmed,true);
 await ui.handle({...t.interaction,customId});assert.equal(calls,1);await ui.handle({...t.interaction,customId});assert.equal(calls,1);
 }finally{t.close();}
});

test('A flag changed after preview asks for a new confirmation before retry',async()=>{
 const t=setup();try{let current={...demand,auto_production:false},calls=[];const ui=new UI({state:t.state,api:{request:async(_,{body})=>{calls.push(structuredClone(body));if(calls.length===1){current=demand;throw new ApiError(409,'Cette demande est en auto production.');}return {demande:demand};}},snapshot:{get:async()=>[current],invalidate(){}},refresh:async()=>{}});
 await ui.stage(t.interaction,'deliver',{path:'/demandes/8/convois',body:{nbpomme:'1',nbmateriaux:'2'},summary:'Convoi',demand:current});const first=t.payload().components[0].toJSON().components[0].custom_id;
 await ui.handle({...t.interaction,customId:first});assert.match(t.payload().content,/Souhaites-tu quand même/);assert.equal(calls.length,1);const next=t.payload().components[0].toJSON().components[0].custom_id;assert.notEqual(first,next);
 await ui.handle({...t.interaction,customId:next});assert.equal(calls[1].auto_production_confirmed,true);assert.notEqual(calls[0].commande_id,calls[1].commande_id);
 }finally{t.close();}
});

test('Batch warning covers every item; a later flag change preserves completed items',async()=>{
 const t=setup();try{let calls=[],fail=true;const ui=new UI({state:t.state,api:{request:async(_,{body})=>{calls.push(structuredClone(body));if(calls.length===2&&fail){fail=false;throw new ApiError(409,'Cette demande est en auto production.');}return {demande:demand,convoi:{id:body.commande_id}};}},snapshot:{get:async()=>[{...demand,auto_production:false}],invalidate(){}},refresh:async()=>{}});
 await ui.stageConvoys(t.interaction,{...demand,auto_production:false},[{nbpomme:'1',nbmateriaux:'2'},{nbpomme:'3',nbmateriaux:'4'}]);const start=t.payload().components[0].toJSON().components[0].custom_id;
 await ui.handle({...t.interaction,customId:start});assert.equal(calls.length,2);assert.match(t.payload().content,/auto production/);const confirm=t.payload().components[0].toJSON().components[0].custom_id;assert.match(confirm,/confirmAutoBatch/);
 await ui.handle({...t.interaction,customId:confirm});assert.equal(calls.length,3);assert.equal(calls[2].auto_production_confirmed,true);assert.equal(calls[1].commande_id,calls[2].commande_id);assert.notEqual(calls[0].commande_id,calls[2].commande_id);
 const autoUI=new UI({state:t.state});await autoUI.stageConvoys(t.interaction,demand,[{nbpomme:'1',nbmateriaux:'2'}]);assert.match(t.payload().content,/Souhaites-tu quand même/);const job=t.state.get(t.payload().components[0].toJSON().components[0].custom_id.split(':')[2],'123');assert.equal(job.data.items[0].body.auto_production_confirmed,true);
 }finally{t.close();}
});

test('Validated request checkbox is prefilled and changes are versioned',async()=>{
 const t=setup();try{const ui=new UI({state:t.state,api:{member:async()=>({player_id:'2'})}});const sid=t.state.create('123','adjust',{rows:[demand]});
 await ui.handle({...t.interaction,customId:'uptep:pick:'+sid,values:['8']});assert.equal(t.modal().components[2].component.default,true);
 await ui.handle({...t.interaction,customId:t.modal().custom_id,fields:{getTextInputValue:()=> '100',getCheckbox:()=>false}});const job=t.state.get(t.payload().components[0].toJSON().components[0].custom_id.split(':')[2],'123');assert.equal(job.data.body.auto_production,false);assert.equal(job.data.body.version_attendue,demand.version_modification);
 }finally{t.close();}
});

test('History reports and delivery suggestions identify auto production',()=>{
 const report=reportPayload('demandes',{lignes:[demand],page:1,pages:1,total:1},'sid');assert.match(report.embeds[0].toJSON().fields[0].value,/Auto production/);
 const delivery=deliveryPayload({joueur:'Sender',vitesse:1,lignes:[{...demand,distance:null,seconds:null}],page:1,pages:1,total:1},'123');assert.match(delivery.embeds[0].toJSON().fields[0].value,/Auto production/);
});
