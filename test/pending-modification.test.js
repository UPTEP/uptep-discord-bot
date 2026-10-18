import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {State} from '../src/state.js';
import {UI} from '../src/ui.js';

test('Modification avant validation : sélection, préremplissage, confirmation et enregistrement',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-pending-'));
 try{
  const state=new State(dir);let payload,modal,saved;
  let member={player_id:'1',is_chaine:false};
  const demand={id:'8',iddemandeur:'1',pseudo_demandeur:'Joueur',valide:false,objet:'Couveuse',niveau:20,date_souhaitee:'2099-12-25',nbpomme_original:'9007199254740993',nbpomme_restant:'9007199254740993',nbmateriaux_original:'40000',nbmateriaux_restant:'40000',version_modification:'a'.repeat(64)};
  const other={...demand,id:'9',iddemandeur:'2'};
  const ui=new UI({state,api:{member:async()=>member,request:async(p,{body})=>{saved={p,body};return {demande:{id:'8'}};}},snapshot:{get:async()=>[demand,other,{...demand,id:'10',fini:true},{...demand,id:'11',annulee:true}],invalidate(){}},refresh:async()=>{}});
  const base={user:{id:'123'},deferred:true,deferReply:async()=>{},editReply:async p=>payload=p};
  await ui.handle({...base,customId:'uptep:adjust'});
  let select=payload.components[0].toJSON().components[0];assert.deepEqual(select.options.map(o=>o.value),['8']);
  await ui.handle({...base,customId:select.custom_id,values:['8'],showModal:async m=>modal=m.toJSON()});
  assert.deepEqual(modal.components.map(r=>r.components[0].value),['Couveuse','20','9007199254740993','40000','25-12-2099']);
  const editModalId=modal.custom_id;
  const fields={getTextInputValue:k=>({objet:'Laboratoire',niveau:'21',food:'9007199254740994',wood:'10k',date:''})[k]};
  await ui.handle({...base,customId:modal.custom_id,fields});
  assert.match(payload.content,/restera en attente de validation/);
  await ui.handle({...base,customId:payload.components[0].toJSON().components[0].custom_id,showModal:async m=>modal=m.toJSON()});
  assert.equal(modal.components[0].component.type,23);
  await ui.handle({...base,customId:modal.custom_id,fields:{getCheckbox:()=>true}});
  const confirm=payload.components[0].toJSON().components[0].custom_id;
  await ui.handle({...base,customId:confirm});
  assert.equal(saved.p,'/demandes/8/modification');
  assert.deepEqual({...saved.body,commande_id:undefined},{discord_id:'123',nbpomme:'9007199254740994',nbmateriaux:'10000',objet:'Laboratoire',niveau:'21',date_souhaitee:null,version_attendue:demand.version_modification,auto_production:true,commande_id:undefined});
  member={player_id:'2',is_chaine:false};
  await ui.handle({...base,customId:editModalId,fields});assert.match(payload.content,/propres demandes/);
  member={player_id:'3',is_chaine:true};
  await ui.handle({...base,customId:'uptep:adjust'});
  select=payload.components[0].toJSON().components[0];assert.deepEqual(select.options.map(o=>o.value),['8','9']);
  await ui.handle({...base,customId:'uptep:validate'});
  select=payload.components[0].toJSON().components[0];
  await ui.handle({...base,customId:select.custom_id,values:['8']});
  const job=state.get(payload.components[0].toJSON().components[0].custom_id.split(':')[2],'123').data;
  assert.equal(job.body.version_attendue,demand.version_modification);assert.match(payload.content,/Couveuse/);
 }finally{fs.rmSync(dir,{recursive:true});}
});
