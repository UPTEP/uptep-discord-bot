import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Reports,reportCommands,reportAdmins,reportPayload,demandStatus} from '../src/reports.js';import {State} from '../src/state.js';
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'uptep-stats-'));
const demand={id:'9007199254740993',pseudo_demandeur:'Joueur',nbpomme_original:'9223372036854775807',nbmateriaux_original:'10',nbpomme_restant:'10',nbmateriaux_restant:'0',valide:true,objet:'Labo',niveau:9,date_demande:'2026-10-11T10:00:00Z'};
test('Les commandes restent indépendantes des boutons et fournissent périodes et filtres',()=>{assert.deepEqual(reportCommands.map(c=>c.name),['historique-demandes','historique-convois','stats-convois','recap-demandes']);for(const c of reportCommands.filter(c=>c.name!=='recap-demandes'))assert.ok(c.options.some(o=>o.name==='debut'));});
test('Allowlist privée relue, retrait immédiat, configuration invalide fermée',()=>{const d=dir(),file=path.join(d,'.env');try{fs.writeFileSync(file,'ADMIN_DISCORD_IDS=123,456\n');assert.deepEqual(reportAdmins(file),['123','456']);fs.writeFileSync(file,'ADMIN_DISCORD_IDS=456\n');assert.deepEqual(reportAdmins(file),['456']);fs.writeFileSync(file,'ADMIN_DISCORD_IDS=456,not-id\n');assert.deepEqual(reportAdmins(file),[]);}finally{fs.rmSync(d,{recursive:true});}});
test('Rapports : refus sans droit, identité issue de Discord, pages privées et propriétaire vérifié',async()=>{
 const d=dir();try{
 const state=new State(d);let payload,requests=[],allowed=[];const reports=new Reports({state,admins:()=>allowed,api:{request:async p=>{requests.push(p);if(p.includes('/demandes/'))return {demande:demand,lignes:[],page:1,pages:1,total:0};return {lignes:[demand],page:1,pages:2,total:9,periode:{debut:'05-10-2026',fin:'11-10-2026',jours:7}};}}});
 const base={user:{id:'123'},deferReply:async function(p){this.deferred=true;assert.equal(p.flags,64);},editReply:async p=>payload=p,reply:async p=>payload=p,isChatInputCommand:()=>true,commandName:'historique-demandes',options:{getString:k=>k==='joueur'?'Joueur':null}};
 await reports.handle({...base});assert.equal(requests.length,0);assert.match(payload.content,/chefs/);
 allowed=['123'];await reports.handle({...base});assert.match(requests[0],/discord_id=123/);assert.ok(payload.embeds.length);
 const sid=payload.components[0].toJSON().components[0].custom_id.split(':')[2];assert.equal(state.get(sid,'123').data.params.debut,'05-10-2026');
 await reports.handle({...base,isChatInputCommand:()=>false,customId:`uptep:reportDetail:${sid}`,values:[demand.id]});assert.match(requests[1],/demandes\/9007199254740993\?/);;assert.match(payload.embeds[0].toJSON().title,/Demande #9007199254740993/)
 allowed=['123','456'];await reports.handle({...base,user:{id:'456'},isChatInputCommand:()=>false,customId:`uptep:reportPage:${sid}:2`});assert.equal(requests.length,2);assert.match(payload.content,/appartient/);
 allowed=[];await reports.handle({...base,isChatInputCommand:()=>false,customId:`uptep:reportPage:${sid}:2`});assert.equal(requests.length,2);
 }finally{fs.rmSync(d,{recursive:true});}
});
test('Affichage exact des grandes quantités et limites Discord avec libellés longs',()=>{
 const rows=Array.from({length:8},(_,i)=>({...demand,id:String(i+1),pseudo_demandeur:'p'.repeat(100),objet:'o'.repeat(160)}));
 const p=reportPayload('demandes',{lignes:rows,page:1,pages:1,total:8},'session');const e=p.embeds[0].toJSON();
 const length=(e.title?.length??0)+(e.description?.length??0)+(e.footer?.text.length??0)+e.fields.reduce((s,f)=>s+f.name.length+f.value.length,0);assert.ok(length<=6000);assert.ok(e.fields.every(f=>f.value.length<=1024));assert.match(e.fields[0].value,/9.223.372.036.854.775.807/);
 assert.equal(demandStatus({...demand,fini:true,fin_manuelle:true}),'Terminée manuellement');assert.equal(demandStatus({...demand,annulee:true}),'Annulée');
});
test('Récapitulatif sans période, zéros, date Paris, pagination privée et contrôle admin répété',async()=>{
 const d=dir();try{
  let allowed=['123'],payload;const requests=[],state=new State(d);
  const data={page:1,pages:2,total:9,lignes:[{pseudo:'Sans demande',demandes_effectuees:'0',demandes_validees:'0',demandes_terminees:'0',demandes_annulees:'0',derniere_demande:null},{pseudo:'Actif',demandes_effectuees:'3',demandes_validees:'2',demandes_terminees:'1',demandes_annulees:'1',derniere_demande:'2026-10-14T10:30:00Z'}]};
  const reports=new Reports({state,admins:()=>allowed,api:{request:async route=>{requests.push(route);return data;}}});
  const base={user:{id:'123'},isChatInputCommand:()=>true,commandName:'recap-demandes',deferReply:async function(p){this.deferred=true;assert.equal(p.flags,64);},editReply:async p=>payload=p};
  await reports.handle({...base});assert.equal(requests[0],'/rapports/recap-demandes?discord_id=123&page=1');
  const embed=payload.embeds[0].toJSON();assert.match(embed.description,/Tout l’historique/);assert.match(embed.fields[0].value,/Aucune demande/);assert.match(embed.fields[1].value,/12:30/);assert.deepEqual(payload.allowedMentions,{parse:[]});
  const customId=payload.components[0].toJSON().components[0].custom_id;
  await reports.handle({...base,isChatInputCommand:()=>false,customId});assert.match(requests[1],/page=2/);
  allowed=[];await reports.handle({...base,isChatInputCommand:()=>false,customId});assert.equal(requests.length,2);assert.match(payload.content,/ADMIN_DISCORD_IDS/);
 }finally{fs.rmSync(d,{recursive:true});}
});
