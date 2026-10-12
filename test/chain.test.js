import test from 'node:test';import assert from 'node:assert/strict';import {Chain,chainPayloads} from '../src/chain.js';
const m={player_id:'9',pseudo:'[Test]',chaine_grade:'Passeur',sort_order:5};
test('links use player ID, escaped names, preserve chain order and split large lists',()=>{
 const rows=Array.from({length:100},(_,n)=>({...m,player_id:String(n+1)})),payloads=chainPayloads(rows);assert.ok(payloads.length>1);
 const text=payloads.map(p=>p.embeds[0].data.description).join('\n');assert.equal((text.match(/\[⚔️ Flooder\]/g)||[]).length,100);assert.match(text,/Attaquer=9&lieu=1/);assert.ok(text.includes('\\[Test\\]'));for(const p of payloads){assert.ok(p.embeds[0].data.description.length<=3500);assert.deepEqual(p.allowedMentions,{parse:[]});}
 assert.throws(()=>chainPayloads([{...m,player_id:'9&evil=1'}]));assert.equal(chainPayloads([]).length,1);
});
test('publishes publicly after identity API check, keeps errors private',async()=>{
 let sends=0,deletes=0;const i={guildId:'g',user:{id:'123'},client:{user:{}},channel:{permissionsFor:()=>({has:()=>true}),send:async()=>sends++},deferReply:async()=>{},deleteReply:async()=>deletes++,editReply:async()=>{},reply:async()=>{}};
 const chain=new Chain({guildId:'g',api:{request:async p=>{assert.match(p,/discord_id=123/);return {membres:[m]};}}});await chain.handle(i);assert.equal(sends,1);assert.equal(deletes,1);
 chain.api.request=async()=>{throw Error('NoobEnCDI');};await chain.handle(i);assert.equal(sends,1);await chain.handle({...i,guildId:'other'});assert.equal(sends,1);
});
