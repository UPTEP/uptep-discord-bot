import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {launchLines,unixTime} from '../src/domain.js';import {State} from '../src/state.js';import {UI,boardPayload,actions} from '../src/ui.js';

const now=Date.parse('2026-11-11T12:00:00Z');
const previous=(end)=>({id:'581',objet:'Champignonnière',niveau:20,lancement_construction:'2026-11-11 08:00:00+00',fin_construction:end});

test('Construction précédente : en cours, terminée, en attente de validation, recherche',()=>{
 assert.equal(unixTime('2026-11-12 16:09:33.123+00'),Date.parse('2026-11-12T16:09:33Z')/1000);
 const running=previous('2026-11-12 16:09:33+00'),ended=previous('2026-11-10 16:00:00+00');
 const [line]=launchLines({valide:true,lancement_precedent:running},{now});
 assert.equal(line,`⏳ Construction précédente : Champignonnière niv. 20 · fin <t:${Date.parse('2026-11-12T16:09:33Z')/1000}:f> (<t:${Date.parse('2026-11-12T16:09:33Z')/1000}:R>)`);
 // Validated demand: a finished previous work is no longer news for deliverers.
 assert.deepEqual(launchLines({valide:true,lancement_precedent:ended},{now}),[]);
 // Awaiting validation, or a detail view: shown even once finished.
 assert.match(launchLines({valide:false,lancement_precedent:ended},{now})[0],/· terminée <t:/);
 assert.match(launchLines({valide:true,lancement_precedent:ended},{now,always:true})[0],/· terminée <t:/);
 assert.match(launchLines({valide:false,type_construction:'recherche',lancement_precedent:{...running,objet:'Vitesse d’attaque'}},{now})[0],/^⏳ Recherche précédente : Vitesse d’attaque/);
 assert.match(launchLines({fini:true,lancement_construction:'2026-11-11 08:00:00+00',fin_construction:'2026-11-12 16:09:33+00'},{now})[0],/^🏗 Construction lancée · fin <t:/);
 assert.deepEqual(launchLines({valide:false},{now}),[]);
});

test('Tableau : ligne de la construction précédente et bouton Confirmer un lancement',()=>{
 const demand={id:'616',pseudo_demandeur:'NoobEnCDI',objet:'Entrepôt',niveau:16,valide:false,fini:false,nbpomme_restant:'0',nbmateriaux_restant:'19660800',lancement_precedent:previous('2999-01-01 00:00:00+00')};
 const text=boardPayload([demand]).embeds[0].toJSON().description;
 assert.match(text,/#616 · NoobEnCDI[\s\S]*⏳ Construction précédente : Champignonnière niv\. 20 · fin <t:/);
 const ids=actions().flatMap(r=>r.toJSON().components.map(c=>c.custom_id));
 assert.ok(ids.includes('uptep:launch'));
});

test('Confirmer un lancement : liste, formulaire, durée et route API',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-launch-'));try{
 const state=new State(dir);let payload,modal,sent;
 const mine={id:'620',iddemandeur:'1',pseudo_demandeur:'Joueur',objet:'Couveuse',niveau:17,valide:true,fini:true,lancement_attendu:true,type_construction:'construction'};
 const rows=[mine,{...mine,id:'621',iddemandeur:'2'},{...mine,id:'622',lancement_attendu:false},{...mine,id:'623',fini:false,lancement_attendu:false}];
 const ui=new UI({state,api:{member:async()=>({player_id:'1',is_chaine:false}),request:async(p,{body})=>{sent={p,body};return {ok:true,demande:{...mine,lancement_attendu:false}};}},snapshot:{get:async()=>rows,invalidate(){}},refresh:async()=>{}});
 const base={user:{id:'123'},deferReply:async()=>{},editReply:async p=>payload=p,reply:async p=>payload=p};
 await ui.handle({...base,customId:'uptep:launch'});
 const select=payload.components[0].toJSON().components[0];
 assert.deepEqual(select.options.map(o=>o.value),['620'],'only my delivered demands awaiting a launch');
 // The form opens without any API call, within Discord's 3 seconds.
 await ui.handle({...base,customId:select.custom_id,values:['620'],showModal:async m=>modal=m.toJSON(),deferReply:async()=>assert.fail('A modal must be shown, not deferred')});
 assert.equal(modal.components[0].components[0].custom_id,'remaining');
 const before=Date.now();
 await ui.handle({...base,customId:modal.custom_id,fields:{getTextInputValue:()=>'12h 26m'}});
 const job=state.get(payload.components[0].toJSON().components[0].custom_id.split(':')[2],'123').data;
 assert.equal(job.path,'/demandes/620/lancement');
 const launched=Date.parse(job.body.date_lancement),ends=Date.parse(job.body.date_fin_construction);
 assert.ok(launched>=before-1000&&launched<=Date.now()+1000);assert.equal(ends-launched,(12*3600+26*60)*1000);
 assert.match(job.body.date_fin_construction,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
 assert.match(payload.content,/Confirmer le lancement de la construction \*\*Couveuse niv\. 17\*\* · demande #620/);
 await ui.handle({...base,customId:payload.components[0].toJSON().components[0].custom_id});
 assert.equal(sent.p,'/demandes/620/lancement');assert.equal(sent.body.commande_id.startsWith('discord:'),true);
 // A date or nonsense is refused with a clear message, nothing is staged.
 await ui.handle({...base,customId:modal.custom_id,fields:{getTextInputValue:()=>'2026-11-12T10:00:00Z'}});
 assert.match(payload.content,/indique une durée comme 12h 26m/);
 await ui.handle({...base,customId:modal.custom_id,fields:{getTextInputValue:()=>'bientôt'}});
 assert.match(payload.content,/indique une durée comme 12h 26m/);
 assert.throws(()=>ui.check('launch',mine,{player_id:'2',is_chaine:false}),/tes demandes/);
 assert.doesNotThrow(()=>ui.check('launch',mine,{player_id:'2',is_chaine:true}));
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('Terminer une demande propose de confirmer le lancement',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-launch-'));try{
 const state=new State(dir);let payload,modal;
 const finished={id:'630',iddemandeur:'1',pseudo_demandeur:'Joueur',objet:'Solarium',niveau:15,valide:true,fini:true,lancement_attendu:true};
 const ui=new UI({state,api:{request:async()=>({ok:true,demande:finished})},snapshot:{invalidate(){}},refresh:async()=>{}});
 const base={user:{id:'123'},deferReply:async()=>{},editReply:async p=>payload=p,reply:async p=>payload=p};
 const sid=state.create('123','job',{path:'/demandes/630/terminaison',body:{discord_id:'123',commande_id:'discord:x'},summary:'Terminer'});
 await ui.handle({...base,customId:'uptep:apply:'+sid});
 assert.match(payload.content,/^✅ Opération enregistrée sur UPTEP · demande #630\.\nConstruction ou recherche lancée/);
 const open=payload.components[0].toJSON().components[0];assert.equal(open.label,'Confirmer le lancement');
 await ui.handle({...base,customId:open.custom_id,showModal:async m=>modal=m.toJSON()});
 assert.match(modal.title,/Lancement · #630 · Solarium/);
 // Other operations keep their plain success message.
 const other=state.create('123','job',{path:'/demandes/630/validation',body:{discord_id:'123',commande_id:'discord:y'},summary:'Valider'});
 await ui.handle({...base,customId:'uptep:apply:'+other});assert.deepEqual(payload.components,[]);
 }finally{fs.rmSync(dir,{recursive:true});}
});
