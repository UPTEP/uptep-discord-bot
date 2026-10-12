import test from 'node:test';import assert from 'node:assert/strict';
import {parseFloods} from '../src/flood-parser.js';import {Floods,floodBoard} from '../src/floods.js';
const now=new Date('2026-10-12T11:25:46Z');
const line='- Vous allez attaquer [**l-o-l**](https://s5.fourmizzz.fr/Membre.php?Pseudo=l-o-l)**([UPTEP](https://s5.fourmizzz.fr/classementAlliance.php?alliance=UPTEP))** (Terrain de chasse) dans **27 minutes 14 secondes**';
test('rapport compact sans lieu, avec ou sans tiret : les deux attaques sont conservées',()=>{
 for(const prefix of ['- ','','• ']){
  const r=parseFloods(`${prefix}Vous allez attaquer Hardware(UPTEP) dans 8 heures 32 minutes 28 secondes\n\n${prefix}Vous allez attaquer Hardware(UPTEP) dans 8 heures 32 minutes 33 secondes`,now);
  assert.deepEqual(r.floods.map(f=>({pseudo:f.pseudo,location:f.location,arrival:f.arrival_at})),[
   {pseudo:'Hardware',location:'Terrain de chasse',arrival:'2026-10-12T19:58:14Z'},
   {pseudo:'Hardware',location:'Terrain de chasse',arrival:'2026-10-12T19:58:19Z'}
  ]);
  assert.equal(r.warnings.length,2);assert.ok(r.warnings.every(w=>w.includes('lieu absent')));
 }
 const plain=parseFloods('Vous allez attaquer foo_bar dans 1H2m3s',now);
 assert.equal(plain.floods[0].pseudo,'foo_bar');assert.equal(plain.floods[0].arrival_at,'2026-10-12T12:27:49Z');
});
test('les lieux explicites restent prioritaires et les rapports incomplets sont refusés',()=>{
 for(const [location,expected] of [['Terrain de chasse','Terrain de chasse'],['Dôme (12)','Dôme'],['Loge Impériale (3)','Loge']]){
  const r=parseFloods(`Vous allez attaquer Hardware(UPTEP) (${location}) dans 8 heures`,now);
  assert.equal(r.floods[0].location,expected);assert.equal(r.warnings.length,0);
 }
 assert.throws(()=>parseFloods('Vous allez attaquer Hardware(UPTEP) (Lieu inconnu) dans 8 heures',now));
 assert.throws(()=>parseFloods('Vous allez attaquer Hardware(UPTEP) dans bientôt',now));
 assert.throws(()=>parseFloods('Vous allez attaquer Hardware(UPTEP) dans 8 heures 2 heures',now));
});
test('markdown and plain text, optional troops/clock, repeated attacks preserved',()=>{
 const r=parseFloods(line+'\n*Troupes en attaques : 2 213 Jeunes Soldates Naines.*\n*Arrivée à 13h53*\n'+line+'\n'+line,now);
 assert.equal(r.floods.length,3);assert.equal(r.floods[0].pseudo,'l-o-l');assert.equal(r.floods[0].arrival_at,'2026-10-12T11:53:00Z');assert.match(r.floods[0].troops,/2 213/);assert.equal(r.floods[1].troops,null);assert.equal(r.warnings.length,0);
 const plain=parseFloods('Vous allez attaquer foo_bar (Terrain de chasse) dans 1H2m3s',now);assert.equal(plain.floods[0].pseudo,'foo_bar');assert.equal(plain.floods[0].arrival_at,'2026-10-12T12:27:49Z');
});
test('mismatch is visible, malformed or missing duration rejected, midnight supported',()=>{
 assert.ok(parseFloods(line+'\nArrivée à 17h53',now).warnings.length);
 assert.throws(()=>parseFloods('Vous allez attaquer X (Terrain de chasse) dans bientôt',now));
 assert.throws(()=>parseFloods(line+'\nVous allez attaquer X',now));
 assert.equal(parseFloods('Vous allez attaquer X (Terrain de chasse) dans 2 minutes\nArrivée à 00h01',new Date('2026-10-12T21:59:00Z')).warnings.length,0);
});
test('MP blocked is not retried and repeated enqueue is harmless',async()=>{
 const state={data:{},save(){}};let sent=0;const floods=new Floods({state,client:{users:{fetch:async()=>({send:async()=>{sent++;throw Object.assign(Error(),{code:50007});}})}}});
 const item={id:'1',target_discord:'123',pseudo:'X',sender_pseudo:'Y',location:'Terrain de chasse',arrival_at:'2026-10-12T11:53:00Z'};
 floods.enqueue([item]);await floods.flush();floods.enqueue([item]);await floods.flush();assert.equal(sent,1);assert.equal(floodBoard().components[0].components.length,3);
});
test('preview renders optional data and paginates without changing frozen arrival',()=>{
 const f=new Floods({});const parsed=parseFloods(line,now);const s={data:{...parsed,floods:Array(7).fill({...parsed.floods[0],warning:'Aucun ID Discord'})}};
 const p=f.preview('sid',s,1);assert.equal(p.embeds[0].data.fields.length,2);assert.match(p.embeds[0].data.fields[0].value,/Aucun ID Discord/);assert.equal(s.data.floods[0].arrival_at,'2026-10-12T11:53:00Z');
});
import {State} from '../src/state.js';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('modal preview never creates a flood; confirm sends same frozen batch and replay does not recreate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-flood-ui-'));
 try{const state=new State(dir),calls=[];let payload;
 const api={request:async(path,opts)=>{calls.push([path,opts]);if(path.endsWith('/preview'))return {floods:opts.body.floods.map(f=>({...f,target_id:'9',target_discord:null,warning:'Aucun ID Discord'}))};return {floods:opts.body.floods.map((f,n)=>({...f,id:String(n+1)}))};}};
 const floods=new Floods({api,state,guildId:'g',channelId:'c',client:{}});
 const i={guildId:'g',channelId:'c',user:{id:'123'},customId:'uptep:flood:form',fields:{getTextInputValue:()=>line},deferReply:async()=>{},editReply:async p=>payload=p};
 await floods.handle(i);assert.equal(calls.length,1);assert.equal(calls[0][0],'/floods/preview');
 const sid=Object.keys(state.data.sessions)[0],arrival=state.get(sid,'123').data.floods[0].arrival_at;
 await floods.handle({...i,customId:'uptep:flood:confirm:'+sid});assert.equal(calls[1][1].body.floods[0].arrival_at,arrival);await floods.handle({...i,customId:'uptep:flood:confirm:'+sid});assert.equal(calls.length,2);
 }finally{fs.rmSync(dir,{recursive:true});}
});
import {floodReplyCleanup} from '../src/floods.js';
test('completed flood removes private source then success after 3 seconds, never public board',async()=>{
 const deleted=[],timers=[];const i={client:{user:{id:'bot'}},message:{id:'old',author:{id:'bot'},flags:{has:()=>true}},webhook:{deleteMessage:async id=>deleted.push(id)},editReply:async()=>{},deleteReply:async()=>deleted.push('current')};
 const restore=floodReplyCleanup(i,(fn,ms)=>{timers.push({fn,ms});return {unref(){}};});
 await i.editReply('✅ 2 floods enregistrés.');assert.deepEqual(deleted,['old']);assert.equal(timers[0].ms,3000);await timers[0].fn();assert.deepEqual(deleted,['old','current']);restore();
 deleted.length=0;i.message.flags.has=()=>false;const undo=floodReplyCleanup(i,(fn,ms)=>({unref(){}}));await i.editReply({embeds:[{}]});assert.deepEqual(deleted,[]);undo();
});
