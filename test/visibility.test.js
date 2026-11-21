import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {restricted,visibleTo} from '../src/domain.js';import {State} from '../src/state.js';import {UI,boardPayload} from '../src/ui.js';import {ValidationNotifications} from '../src/notifications.js';

const relay={id:'702',iddemandeur:'1338',pseudo_demandeur:'Ckiar',objet:'Relais Est - Achak',niveau:1,valide:true,fini:false,nbpomme_restant:'0',nbmateriaux_restant:'9988450000',visible_par:['1235','360','1530'],visible_par_pseudos:['Achak','Hardware','NoobEnCDI']};
const open={id:'700',iddemandeur:'9',pseudo_demandeur:'Nythrakar',objet:'Couveuse',niveau:17,valide:true,fini:false,nbpomme_restant:'0',nbmateriaux_restant:'1000',visible_par:[],visible_par_pseudos:[]};

test('Demande restreinte : visible par le demandeur et la liste seulement',()=>{
 assert.equal(restricted(relay),true);assert.equal(restricted(open),false);assert.equal(restricted({id:'1'}),false);
 assert.equal(visibleTo(relay,'1338'),true,'requester');assert.equal(visibleTo(relay,'1235'),true,'listed');assert.equal(visibleTo(relay,1530),true,'numeric id');
 assert.equal(visibleTo(relay,'9'),false);assert.equal(visibleTo(relay,undefined),false);assert.equal(visibleTo(open,'9999'),true);
});

test('Tableau partagé : les demandes restreintes n’y figurent pas, même dans les compteurs',()=>{
 const text=boardPayload([relay,open,{...relay,id:'703',fini:true}]).embeds[0].toJSON().description;
 assert.doesNotMatch(text,/Relais|#702|#703/);assert.match(text,/#700 · Nythrakar/);
 assert.match(text,/1 demande\(s\) ouverte\(s\) · 0 terminée\(s\)/);
});

test('Listes privées : chaque membre ne voit que les demandes qui lui sont ouvertes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-vis-'));try{
 const state=new State(dir);let payload;const as=player=>new UI({state,api:{member:async()=>({player_id:player,is_chaine:true})},snapshot:{get:async()=>[relay,open]}});
 const base={user:{id:'123'},deferReply:async()=>{},editReply:async p=>payload=p};
 const options=()=>payload.components[0].toJSON().components[0].options.map(o=>o.value).sort();
 await as('1235').handle({...base,customId:'uptep:browse'});assert.deepEqual(options(),['700','702'],'Achak, listed');
 await as('9').handle({...base,customId:'uptep:browse'});assert.deepEqual(options(),['700'],'Nythrakar, chain but not listed');
 // Nythrakar: #700 is his own and #702 is hidden, so nothing to deliver.
 await as('9').handle({...base,customId:'uptep:deliver'});assert.equal(payload,'Aucune demande disponible pour cette action.');
 await as('1235').handle({...base,customId:'uptep:deliver'});assert.ok(options().includes('702'));
 // The detail tells allowed members the demand is restricted.
 const detail=as('1235').detail(relay).embeds[0].toJSON().description;assert.match(detail,/^🔒 Visible par : Achak, Hardware, NoobEnCDI/);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('Pas d’annonce publique pour une demande restreinte',()=>{
 const saved=[];const state={data:{},save(){saved.push(1);}};const n=new ValidationNotifications({state,getChannel:()=>null});
 n.enqueue(relay);assert.deepEqual(state.data.validationNotifications??{},{});
 n.enqueue(open);assert.ok(state.data.validationNotifications['700']);
});
