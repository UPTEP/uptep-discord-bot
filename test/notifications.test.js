import test from 'node:test';import assert from 'node:assert/strict';
import {ValidationNotifications} from '../src/notifications.js';
const d={id:'12',valide:true,pseudo_demandeur:'User',nbpomme_restant:'12',nbmateriaux_restant:'3'};
test('successful validation announces everyone only once, even concurrent flush/replay',async()=>{
 const state={data:{},save(){}};const sent=[];const channel={client:{user:{}},permissionsFor:()=>({has:()=>true}),send:async p=>{sent.push(p);return {id:'123'};}};
 const n=new ValidationNotifications({state,getChannel:()=>channel});n.enqueue({...d,valide:false});await n.flush();assert.equal(sent.length,0);
 n.enqueue(d);await Promise.all([n.flush(),n.flush()]);n.enqueue(d);await n.flush();assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions,{parse:['everyone'],users:[],roles:[]});assert.equal(state.data.validationNotifications['12'].sent,'123');
 const restored=new ValidationNotifications({state,getChannel:()=>channel});await restored.flush();assert.equal(sent.length,1);
});
test('failed send or missing mention permission remains pending for retry',async()=>{
 const state={data:{},save(){}};let allowed=false,fail=true;
 const channel={client:{user:{}},permissionsFor:()=>({has:()=>allowed}),send:async()=>{if(fail)throw Error('network');return {id:'321'};}};
 const n=new ValidationNotifications({state,getChannel:()=>channel});n.enqueue(d);await assert.rejects(n.flush(),/MentionEveryone/);allowed=true;await assert.rejects(n.flush(),/network/);assert.equal(state.data.validationNotifications['12'].sent,null);fail=false;await n.flush();assert.equal(state.data.validationNotifications['12'].sent,'321');
});
import {UI} from '../src/ui.js';import {State} from '../src/state.js';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('UI queues announcement only after successful validation, never a failed action or replay',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-notify-'));
 try{const state=new State(dir);let queued=0,fail=true;const notifications={enqueue:()=>queued++,flush:async()=>{}};
 const ui=new UI({state,notifications,api:{request:async()=>{if(fail)throw Error('refused');return {demande:d};}},snapshot:{invalidate(){}},refresh:async()=>{}});
 const id=state.create('123','job',{path:'/demandes/12/validation',body:{}});const i={customId:'uptep:apply:'+id,user:{id:'123'},deferReply:async()=>{},editReply:async()=>{}};
 await ui.handle(i);assert.equal(queued,0);fail=false;await ui.handle(i);assert.equal(queued,1);await ui.handle(i);assert.equal(queued,1);
 const other=state.create('123','job',{path:'/demandes/12/convois',body:{}});await ui.handle({...i,customId:'uptep:apply:'+other});assert.equal(queued,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});
import {ConvoyNotifications} from '../src/notifications.js';
const delivered={demande:{id:'12',discord_demandeur:'456'},convoi:{id:'99',pseudo_envoyeur:'Sender',nbpomme:'100',nbmateriaux:'20',date_arrivee:'2026-10-12T23:00:00+02:00'}};
test('convoy DM goes to requester with resources and arrival; replay/restart do not resend',async()=>{
 const state={data:{},save(){}};const sent=[];const client={users:{fetch:async id=>{assert.equal(id,'456');return {send:async p=>{sent.push(p);return {id:'789'};}};}}};
 const n=new ConvoyNotifications({state,client});n.enqueue(delivered);await n.flush();n.enqueue(delivered);await new ConvoyNotifications({state,client}).flush();assert.equal(sent.length,1);
 const f=sent[0].embeds[0].data.fields;assert.equal(f[0].value,'Sender');assert.match(f[1].value,/100 pommes/);assert.match(f[2].value,/<t:1791838800:F>/);assert.deepEqual(sent[0].allowedMentions,{parse:[]});
});
test('blocked DMs are abandoned silently; transient failure retries; missing arrival explicit',async()=>{
 const state={data:{},save(){}};let calls=0,code=50007,last;
 const client={users:{fetch:async()=>({send:async p=>{calls++;last=p;if(code)throw Object.assign(Error('send failed'),{code});return {id:'ok'};}})}};
 const n=new ConvoyNotifications({state,client});n.enqueue(delivered);await n.flush();await n.flush();assert.equal(calls,1);assert.equal(state.data.convoyNotifications['99'].skipped,true);
 n.enqueue({...delivered,convoi:{...delivered.convoi,id:'100',date_arrivee:null}});code=0;await n.flush();assert.equal(last.embeds[0].data.fields[2].value,'Non renseignée');
 n.enqueue({...delivered,convoi:{...delivered.convoi,id:'101'}});code=503;await n.flush();assert.equal(state.data.convoyNotifications['101'].sent,null);code=0;await n.flush();assert.equal(state.data.convoyNotifications['101'].sent,'ok');
});
test('convoy confirmation queues DM once only after API success',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uptep-dm-ui-'));
 try{const state=new State(dir);let fail=true,queued=0;
 const ui=new UI({state,convoyNotifications:{enqueue:r=>{assert.equal(r,delivered);queued++;},flush:async()=>{}},api:{request:async()=>{if(fail)throw Error('API failure');return delivered;}},snapshot:{invalidate(){}},refresh:async()=>{}});
 const id=state.create('123','job',{path:'/demandes/12/convois',body:{}});const i={customId:'uptep:apply:'+id,user:{id:'123'},deferReply:async()=>{},editReply:async()=>{}};
 await ui.handle(i);assert.equal(queued,0);fail=false;await ui.handle(i);await ui.handle(i);assert.equal(queued,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('closed requests delete only bot validation announcements, active and unknown preserved',async()=>{
 const state={data:{validationNotifications:{'1':{sent:'11'},'2':{sent:'22'},'3':{sent:'33'},'4':{sent:'44'}}},save(){}};const deleted=[];
 const channel={client:{user:{id:'bot'}},messages:{fetch:async id=>({author:{id:'bot'},content:'@everyone Une demande de ressources vient d’être validée !',embeds:[{title:'Demande #'+id[0]+' validée · Test'}],delete:async()=>deleted.push(id)})}};
 const n=new ValidationNotifications({state,getChannel:()=>channel,api:{request:async()=>({demandes:[{id:'1',fini:true,annulee:false},{id:'2',fini:false,annulee:true},{id:'3',fini:false,annulee:false}]})}});
 assert.equal(await n.cleanClosed(),2);assert.deepEqual(deleted,['11','22']);assert.equal(await n.cleanClosed(),0);assert.equal(state.data.validationNotifications['3'].removed,undefined);assert.equal(state.data.validationNotifications['4'].removed,undefined);
});
