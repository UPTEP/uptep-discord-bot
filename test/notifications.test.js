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
