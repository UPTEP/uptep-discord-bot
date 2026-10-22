import test from 'node:test';import assert from 'node:assert/strict';
import {parseHunts,huntDuration} from '../src/hunt-parser.js';import {Hunts,huntBoard} from '../src/hunts.js';
// 22/10/2026 10:00:00 Paris (UTC+2).
const now=new Date('2026-10-22T08:00:00Z');
test('durées des différents formats',()=>{
 for(const [text,s] of [['15H 59m 22s',57562],['1 minute 44 secondes',104],['3 heures 19 minutes 31 secondes',11971],['3 h 08',11280],['2J 3H',183600],['45 min',2700]])assert.equal(huntDuration(text),s,text);
 assert.equal(huntDuration('Arrivée à 09h26'),null);
});
test('rapport premium copié depuis Ressources.php : arrivée = collage + durée',()=>{
 const r=parseHunts(`Chasse en cours
- Vos chasseuses vont conquérir 1 cm² dans 15 heures 59 minutes 11 secondes - Annuler
Troupes en chasses :  1 Jeune Soldate.
Arrivée demain à 01h59`,now);
 assert.deepEqual(r.hunts,[{area:'1',arrival_at:'2026-10-22T23:59:11Z'}]);assert.deepEqual(r.warnings,[]);
});
test('plusieurs chasses, collées ou sur plusieurs lignes, et le format « retour dans »',()=>{
 const r=parseHunts('Vous avez maintenant 3 chasse(s) en cours.Vos chasseuses vont conquérir 2 205 cm² dans 1 minute 44 secondesArrivée à 10h01Vos chasseuses vont conquérir 1 516 cm² dans 3 heures 19 minutes 31 secondes\n+2 573 cm² · retour dans 3 h 08 (aujourd\'hui 13 h 08)',now);
 assert.deepEqual(r.hunts.map(h=>[h.area,h.arrival_at]),[['2205','2026-10-22T08:01:44Z'],['1516','2026-10-22T11:19:31Z'],['2573','2026-10-22T11:08:00Z']]);
 assert.deepEqual(r.warnings,[]);
});
test('un rapport copié il y a une heure : l’heure d’arrivée copiée corrige la durée',()=>{
 const r=parseHunts('Vos chasseuses vont conquérir 900 cm² dans 2 heures\nArrivée à 11h00',now);// copié à 9h00, collé à 10h00
 assert.equal(r.hunts[0].arrival_at,'2026-10-22T09:00:00Z');assert.match(r.warnings[0],/l’heure d’arrivée 11h00/);
});
test('passage de minuit : « demain » est rattaché au bon jour',()=>{
 const late=new Date('2026-10-22T21:50:00Z');// 23:50 Paris
 const r=parseHunts('Vos chasseuses vont conquérir 10 cm² dans 20 minutes\nArrivée demain à 00h10',late);
 assert.equal(r.hunts[0].arrival_at,'2026-10-22T22:10:00Z');assert.deepEqual(r.warnings,[]);
});
test('rapports refusés ou à vérifier',()=>{
 assert.throws(()=>parseHunts('',now),/1 à 4 000/);
 assert.throws(()=>parseHunts('Vous allez attaquer Hardware dans 1h',now),/Chasse en cours/);
 assert.throws(()=>parseHunts('Vos chasseuses vont conquérir 5 cm² dans bientôt',now),/Durée non reconnue/);
 assert.throws(()=>parseHunts('Vos chasseuses vont conquérir 0 cm² dans 1h',now),/Surface invalide/);
 const r=parseHunts('Vous avez maintenant 2 chasse(s) en cours. Vos chasseuses vont conquérir 5 cm² dans 1h',now);
 assert.match(r.warnings[0],/annonce 2 chasse/);
});
test('tableau, aperçu et confirmation sans appel Discord réel',async()=>{
 assert.equal(huntBoard().embeds[0].data.footer.text,'UPTEP_HUNTS_V1');
 const sessions={};let sent=null;
 const state={create:(o,t,d)=>{sessions.s1={owner:o,type:t,data:d};return 's1';},get:(id,o)=>{const s=sessions[id];if(!s||s.owner!==o)throw Error('x');return s;},set:(id,d)=>{sessions[id].data=d;}};
 const api={member:async()=>({pseudo:'NoobEnCDI'}),request:async(path,opts)=>{sent={path,body:opts?.body};return {ok:true,count:2,hunts:[{},{}]};}};
 const hunts=new Hunts({api,state,client:{},guildId:'g',channelId:'c'});
 const replies=[];const base={guildId:'g',channelId:'c',user:{id:'u1'},deferred:false,deferReply:async function(){this.deferred=true;},editReply:async p=>{replies.push(p);},reply:async p=>{replies.push(p);}};
 await hunts.process({...base,customId:'uptep:hunt:form',fields:{getTextInputValue:()=>'Vos chasseuses vont conquérir 2 205 cm² dans 1h\nVos chasseuses vont conquérir 10 cm² dans 2h'}});
 const preview=replies.at(-1);assert.match(preview.embeds[0].data.description,/2\s205 cm²/);assert.equal(preview.components[0].components.at(-2).data.label,'Confirmer les 2 chasses');
 assert.equal(sent,null);// nothing saved before confirmation
 await hunts.process({...base,customId:'uptep:hunt:confirm:s1'});
 assert.equal(sent.path,'/chasses');assert.equal(sent.body.hunts.length,2);assert.match(replies.at(-1),/^✅ 2 chasses enregistrées/);
 await hunts.process({...base,customId:'uptep:hunt:confirm:s1'});assert.equal(replies.at(-1),'Ces chasses ont déjà été enregistrées.');
 await hunts.process({...base,channelId:'autre',customId:'uptep:hunt:declare'});assert.match(replies.at(-1).content,/réservés au salon des chasses/);
 // Whole-alliance list with pagination owned by the member who opened it.
 hunts.api={request:async path=>{sent={path};return {ok:true,total:12,area:'37183',page:path.includes('page=2')?2:1,pages:2,hunts:[{pseudo:'Hard_ware',area:'2401',arrival_at:'2026-10-22T09:18:19Z'}]};}};
 await hunts.process({...base,customId:'uptep:hunt:all'});
 assert.match(sent.path,/scope=all&page=1/);const list=replies.at(-1);assert.match(list.embeds[0].data.description,/\*\*Hard\\_ware\*\* · 2\s401 cm²/);assert.equal(list.components[0].components[0].data.custom_id,'uptep:hunt:list:u1:2');
 await hunts.process({...base,customId:'uptep:hunt:list:u1:2'});assert.match(sent.path,/page=2/);
 await hunts.process({...base,user:{id:'u2'},customId:'uptep:hunt:list:u1:2'});assert.match(replies.at(-1).content,/appartient à un autre joueur/);
 assert.equal(huntBoard().components[0].components.length,3);
});
