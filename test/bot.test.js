import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {quantity,amounts,dueDate,arrival,convoyReport,progress} from '../src/domain.js';import {State} from '../src/state.js';import {Api,Snapshot} from '../src/api.js';import {UI,boardPayload} from '../src/ui.js';
test('Quantités exactes et dates',()=>{assert.equal(quantity('9 007 199 254 740 993'),'9007199254740993');assert.equal(quantity('1,5m'),'1500000');assert.throws(()=>quantity('0.5'));assert.throws(()=>quantity('-1'));assert.throws(()=>quantity('9223372036854775808'));assert.throws(()=>amounts('',''));assert.throws(()=>dueDate('31-02-2099'));assert.equal(arrival('2h 30m',new Date('2026-01-01T00:00:00Z')),'2026-01-01T02:30:00Z');});
test('Le même contenu et la même commande sont conservés lors des retries',async()=>{const calls=[];const api=new Api({apiUrl:'https://example.invalid',apiToken:'test'},{interval:0,wait:async()=>{},fetchImpl:async(url,options)=>{calls.push(options.body);if(calls.length===1)throw Error('timeout');return new Response(JSON.stringify({ok:true}),{status:200});}});await api.request('/demandes',{body:{commande_id:'fixed',nbpomme:'9007199254740993'}});assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);});
test('Cache partagé pour les lectures simultanées',async()=>{let calls=0;const s=new Snapshot({demands:async()=>{calls++;return [];}});await Promise.all([s.get(),s.get(),s.get()]);assert.equal(calls,1);s.invalidate();await s.get();assert.equal(calls,2);});
test('Confirmation privée persistée et nouvelle tentative identique après redémarrage',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-bot-'));try{let state=new State(dir);const sid=state.create('123','job',{path:'/demandes',body:{commande_id:'fixed'},summary:'Test'});assert.throws(()=>state.get(sid,'456'));state=new State(dir);assert.equal(state.get(sid,'123').data.body.commande_id,'fixed');const calls=[];let response;const ui=new UI({state,api:{request:async(p,{body})=>{calls.push(body);return {demande:{id:'1'}};}},snapshot:{invalidate(){}},refresh:async()=>{}});const interaction=()=>({customId:'uptep:apply:'+sid,user:{id:'123'},deferReply:async()=>{},editReply:async p=>{response=p;}});await ui.handle(interaction());await ui.handle(interaction());assert.equal(calls.length,1);assert.match(response.content,/enregistrée/);}finally{fs.rmSync(dir,{recursive:true});}});
test('Affichage Discord et pagination des demandes',()=>{const ds=Array.from({length:60},(_,n)=>({id:String(n+1),pseudo_demandeur:'Joueur',nbpomme_restant:'100',nbmateriaux_restant:'200',valide:true}));const board=boardPayload(ds);assert.ok(board.embeds[0].toJSON().description.length<4096);assert.deepEqual(board.components.map(r=>r.toJSON().components.length),[3,3,1]);const ui=new UI({});assert.equal(ui.selection('session',{data:{rows:ds}},0).components[0].toJSON().components[0].options.length,25);assert.equal(ui.selection('session',{data:{rows:ds}},2).components[0].toJSON().components[0].options.length,10);assert.throws(()=>ui.check('validate',{}, {is_chaine:false}));});
test('Formulaires Discord et confirmation de demande',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-ui-'));try{const state=new State(dir);const ui=new UI({state,api:{member:async()=>({player_id:'1'})}});let modal,payload;await ui.handle({customId:'uptep:request',user:{id:'123'},showModal:async m=>{modal=m.toJSON();}});assert.equal(modal.components.length,5);await ui.handle({customId:modal.custom_id,user:{id:'123'},deferReply:async()=>{},fields:{getTextInputValue:k=>({objet:'Couveuse',niveau:'20',food:'100k',wood:'1,5m',date:''})[k]},editReply:async p=>{payload=p;}});const id=payload.components[0].toJSON().components[0].custom_id.split(':')[2];const job=state.get(id,'123');assert.equal(job.data.body.nbmateriaux,'1500000');assert.equal(job.data.body.niveau,'20');assert.equal(job.data.path,'/demandes');assert.ok(job.data.body.commande_id);}finally{fs.rmSync(dir,{recursive:true});}});

test('Arrivée sans millisecondes compatible API',()=>{assert.equal(arrival('3h',new Date('2026-10-11T09:28:00.847Z')),'2026-10-11T12:28:00Z');assert.equal(arrival('2026-10-11T14:28:00+02:00'),'2026-10-11T12:28:00Z');});

test('Rapports Fourmizzz : quantités, destinataire et arrivée, jamais le retour',()=>{
 const now=new Date('2026-10-11T09:00:00.123Z');
 assert.deepEqual(convoyReport('Vous allez livrer 0 nourritures et 15 000 materiaux à SSovietsky dans 11H 52m 36s - Retour le 11 oct. à 21h14','SSovietsky',now),{nbpomme:'0',nbmateriaux:'15000',date_arrivee:'2026-10-11T20:52:36Z'});
 assert.deepEqual(convoyReport('Vous allez livrer 40 000 nourritures et 0 materiaux à Justixon dans 6H 55m 57s - Retour le 11 oct. à 03h33 - Annuler','Justixon',now),{nbpomme:'40000',nbmateriaux:'0',date_arrivee:'2026-10-11T15:55:57Z'});
 assert.throws(()=>convoyReport('Vous allez livrer 1 nourritures et 0 materiaux à Justixon dans 1H','Achak',now),/Justixon/);
 assert.throws(()=>convoyReport('rapport invalide','Achak',now));
});
test('Rapport importé puis champs préremplis ; ancienne confirmation invalidée',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-report-'));try{
 const state=new State(dir),sid=state.create('123','deliver',{demand:{id:'8',pseudo_demandeur:'Achak'}});let payload,modal;
 const ui=new UI({state,api:{member:async()=>({player_id:'1'})}});
 await ui.handle({customId:'uptep:deliverForm:'+sid,user:{id:'123'},deferReply:async()=>{},fields:{fields:new Map([['report',{}]]),getTextInputValue:k=>({report:'Vous allez livrer 2 nourritures et 1 materiaux à Achak dans 3H',food:'',wood:'',arrival:''})[k]},editReply:async p=>payload=p});
 const buttons=payload.components[0].toJSON().components;assert.equal(buttons.length,2);
 await ui.handle({customId:buttons[1].custom_id,user:{id:'123'},showModal:async m=>modal=m.toJSON()});
 assert.equal(modal.components[0].components[0].value,'2');assert.equal(modal.components[1].components[0].value,'1');
 await ui.handle({customId:buttons[0].custom_id,user:{id:'123'},deferred:true,deferReply:async()=>{},editReply:async p=>payload=p});assert.match(payload.content,/remplacée/);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('Bouton annuler un convoi relié à une confirmation privée',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-cancel-'));try{
 const state=new State(dir);let payload;const ui=new UI({state,api:{cancelableConvoys:async()=>[{id:'9',iddemande:'8',idenvoyeur:'1',pseudo_envoyeur:'Noob',pseudo_demandeur:'Achak',nbpomme:'2',nbmateriaux:'1',date_convoi:'2026-10-11'}],member:async()=>({player_id:'1',is_chaine:false})}});
 const i={user:{id:'123'},deferReply:async()=>{},editReply:async p=>payload=p};await ui.handle({...i,customId:'uptep:cancelConvoy'});
 const select=payload.components[0].toJSON().components[0];assert.equal(select.options[0].value,'9');await ui.handle({...i,customId:select.custom_id,values:['9']});
 const jobId=payload.components[0].toJSON().components[0].custom_id.split(':')[2];assert.equal(state.get(jobId,'123').data.path,'/convois/9/annulation');assert.match(payload.content,/Cela n’annule aucun envoi/);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('Progression exacte des ressources déclarées, indépendante de la clôture manuelle',()=>{
 const d={nbpomme_original:'100',nbmateriaux_original:'100',nbpomme_restant:'50',nbmateriaux_restant:'50'};
 assert.equal(progress(d),'`█████░░░░░` **50 %**');
 assert.match(progress({...d,nbpomme_restant:'100',nbmateriaux_restant:'100'}),/0 %/);
 assert.equal(progress({...d,nbpomme_restant:'0',nbmateriaux_restant:'0'}),'`██████████` **100 %**');
 assert.equal(progress({...d,fini:true,fin_manuelle:true}),progress(d));
 assert.match(progress({nbpomme_original:'9223372036854775807',nbmateriaux_original:'0',nbpomme_restant:'1',nbmateriaux_restant:'0'}),/99,9 %/);
});

test('Date française convertie pour API, avec calendrier et limite Paris',()=>{
 const now=new Date('2026-10-11T12:00:00Z');
 assert.equal(dueDate('12-10-2026',now),'2026-10-12');
 assert.equal(dueDate('11-10-2026',now),'2026-10-11');
 assert.equal(dueDate('',now),undefined);
 assert.throws(()=>dueDate('10-10-2026',now));
 assert.throws(()=>dueDate('31-02-2027',now));
 assert.throws(()=>dueDate('2026-10-12',now));
 assert.equal(dueDate('29-02-2028',now),'2028-02-29');
});

test('Ajustement du restant : sélection autorisée, modal préremplie et confirmation avec contrôle de concurrence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-adjust-'));try{
 const state=new State(dir);let payload,modal;
 const demand={id:'8',iddemandeur:'1',pseudo_demandeur:'Joueur',valide:true,nbpomme_restant:'80000',nbmateriaux_restant:'40000'};
 const ui=new UI({state,api:{member:async()=>({player_id:'1',is_chaine:false})},snapshot:{get:async()=>[demand,{...demand,id:'9',iddemandeur:'2'},{...demand,id:'10',valide:false}]}});
 const base={user:{id:'123'},deferReply:async()=>{},editReply:async p=>payload=p};
 await ui.handle({...base,customId:'uptep:adjust'});
 const select=payload.components[0].toJSON().components[0];assert.deepEqual(select.options.map(o=>o.value),['8']);
 await ui.handle({...base,customId:select.custom_id,values:['8'],showModal:async m=>modal=m.toJSON()});
 assert.equal(modal.components[0].components[0].value,'80000');assert.equal(modal.components[1].components[0].value,'40000');
 await ui.handle({...base,customId:modal.custom_id,fields:{getTextInputValue:k=>k==='food'?'50k':'0'}});
 const job=state.get(payload.components[0].toJSON().components[0].custom_id.split(':')[2],'123').data;
 assert.equal(job.path,'/demandes/8/ajustement');assert.equal(job.body.nbpomme_restant,'50000');assert.equal(job.body.nbpomme_attendu,'80000');assert.equal(job.body.nbmateriaux_attendu,'40000');
 assert.throws(()=>ui.check('adjust',demand,{player_id:'2',is_chaine:false}));
 }finally{fs.rmSync(dir,{recursive:true});}
});
