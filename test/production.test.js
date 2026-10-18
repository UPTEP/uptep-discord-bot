import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionSummary,convoyProductionEstimate} from '../src/production.js';
import {boardPayload,UI} from '../src/ui.js';
import {deliveryPayload} from '../src/deliveries.js';
import {reportPayload} from '../src/reports.js';
const colony={own:'1000',loss:{terrain:'1000',percent:22},gains:[{terrain:'500',percent:20}],assumed_rates:false};
const demand={id:'7',pseudo_demandeur:'Joueur',objet:'Solarium',niveau:10,valide:true,fini:false,annulee:false,nbpomme_original:'3000',nbmateriaux_original:'3000',nbpomme_restant:'1000',nbmateriaux_restant:'2000',production:{tdc:'1000',colonies_included:true,capacity_per_cycle:colony,projection:{anchor_at:'2026-10-18T10:00:00Z',anchor_kind:'validation',calculated_at:'2026-10-18T11:15:00Z',elapsed_cycles:'2',history_complete:true,segments:[{cycles:'2',capacity_per_cycle:colony}]}}};
test('Estimation Discord: mêmes colonies, cycles et date que le userscript, sans modification du restant',()=>{
 const before=structuredClone(demand),e=convoyProductionEstimate(demand);assert.equal(e.capacity,880n);assert.equal(e.harvested,1760n);assert.equal(e.remaining,1240n);assert.equal(e.cycles,2n);assert.equal(e.minutes,45n);assert.equal(e.finish_at,Date.parse('2026-10-18T12:00:00Z'));
 const text=productionSummary(demand,{detail:true});assert.match(text,/2 cycles · ≈ 45 min/);assert.match(text,/Référence : validation/);assert.match(text,/colonies internes UPTEP/);assert.deepEqual(demand,before);
});
test('Pas d’estimation pour demandes en attente, terminées ou annulées',()=>{for(const change of [{valide:false},{fini:true},{annulee:true}])assert.equal(productionSummary({...demand,...change}),'');});
test('Données absentes, historique incomplet, taux inconnu et production suffisante',()=>{
 assert.match(productionSummary({...demand,production:null}),/Estimation indisponible/);
 assert.match(productionSummary({...demand,production:{...demand.production,projection:{...demand.production.projection,history_complete:false}}}),/Estimation indisponible/);
 assert.match(productionSummary({...demand,production:{...demand.production,capacity_per_cycle:{...colony,assumed_rates:true}}}),/Étable inconnue/);
 assert.match(productionSummary({...demand,nbpomme_restant:'1',nbmateriaux_restant:'1'}),/Production théorique suffisante · demande toujours ouverte/);
});
test('Affichage sur tableau, détail, livraisons et historiques, avec limites Discord',()=>{
 const board=boardPayload(Array.from({length:15},(_,i)=>({...demand,id:String(i+1)}))).embeds[0].toJSON();assert.match(board.description,/2 cycles/);assert(board.description.length<=4096);
 const detail=new UI({}).detail({...demand,convois:Array.from({length:15},()=>({pseudo_envoyeur:'x'.repeat(100),nbpomme:'1',nbmateriaux:'1'}))}).embeds[0].toJSON();assert.match(detail.description,/Référence : validation/);assert(detail.description.length<=4096);
 const deliveries=deliveryPayload({joueur:'X',vitesse:0,page:1,pages:1,total:1,lignes:[{...demand,distance:10,seconds:600}]},'123').embeds[0].toJSON();assert.match(deliveries.fields[0].value,/2 cycles/);assert(deliveries.fields[0].value.length<=1024);
 const history=reportPayload('demandes',{lignes:[demand],page:1,pages:1,total:1},'session').embeds[0].toJSON();assert.match(history.fields[0].value,/2 cycles/);
 const report=reportPayload('detail',{demande:demand,lignes:[],page:1,pages:1,total:0},'session').embeds[0].toJSON();assert.match(report.description,/Référence : validation/);
});
const sourcePath=new URL('../../site/userscript/src/convoys.js',import.meta.url);
test('Parité du calculateur avec la source userscript', {skip:!fs.existsSync(sourcePath)},()=>{
 const original=fs.readFileSync(sourcePath,'utf8'),bot=fs.readFileSync(new URL('../src/production.js',import.meta.url),'utf8');const shared=bot.split('// BEGIN SHARED CALCULATOR\n')[1].split('// END SHARED CALCULATOR')[0].replace(/^export /gm,'');assert.equal(shared,original.slice(original.indexOf('function convoyColonyCapacity('),original.indexOf('function readCommerceConvoys(')));
});
