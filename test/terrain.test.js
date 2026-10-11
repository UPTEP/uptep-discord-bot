import test from 'node:test';import assert from 'node:assert/strict';
import {Terrain,TERRAIN_USER,collectTerrain,validateTerrain,terrainBalanceText,terrainPrompt} from '../src/terrain.js';
import {MessageFlags} from 'discord.js';
const messages=[{id:'123',text:'Butin chez Maitresse : 2 050 cm²\nVos fourmis ont conquis 100 cm² lors de leur dernière bataille. Ces terres appartenaient à Maitresse. Vos fourmis ont conquis 1 950 cm² lors de leur dernière bataille. Ces terres appartenaient à Maitresse.'},{id:'122',text:'Vol par Maitresse : 3 886 cm²\nMaitresse vous a pris 1 333 cm², puis 1 838 cm² et 715 cm².'}];
const mov=(id,amount,direction,quote)=>({evidence_id:null,occurrence:1,source_id:id,amount,direction,quote,member:null,enemy:'Maitresse',date:null});
const parsed={movements:[mov('123','2050','gain','Butin chez Maitresse : 2 050 cm²'),mov('122','3886','loss','Vol par Maitresse : 3 886 cm²')],warnings:[]};
test('net balance uses BigInt and verifies exact source evidence',()=>{const r=validateTerrain(parsed,messages);assert.equal(r.gains-r.losses,-1836n);assert.equal(r.movements.length,3);assert.match(terrainBalanceText({balance:String(r.gains-r.losses)}),/-1.836/);});
test('fabricated numbers/source IDs fail closed; exact duplicated selection removed',()=>{assert.throws(()=>validateTerrain({movements:[{...parsed.movements[0],amount:'205'}],warnings:[]},messages));assert.throws(()=>validateTerrain({movements:[{...parsed.movements[0],source_id:'other'}],warnings:[]},messages));assert.equal(validateTerrain({movements:[...parsed.movements,parsed.movements[0]],warnings:[]},messages).movements.length,3);});
test('pagination reads beyond 100 messages and includes embeds; limits reject whole scan',async()=>{let calls=0;const m=(id,text)=>({id,author:{id:'user'},content:text,createdAt:new Date(),attachments:new Map(),embeds:[]});const channel={client:{user:{id:'bot'}},messages:{fetch:async options=>{calls++;if(calls===1){assert.equal(options.before,undefined);return new Map([['200',m('200','rapport')]]);}if(calls===2){assert.equal(options.before,'200');return new Map([['100',{...m('100',''),embeds:[{description:'Vol par X : 12 cm²'}]}]]);}return new Map();}}};const r=await collectTerrain(channel);assert.equal(calls,3);assert.equal(r.messages.length,2);assert.equal(r.messages[0].id,'100');calls=0;await assert.rejects(()=>collectTerrain(channel,{maxMessages:1}),/Aucun bilan partiel/);});
function interaction(id=TERRAIN_USER){const calls=[];return {id:'999',calls,user:{id},guildId:'guild',channelId:'channel',client:{user:{id:'bot'},application:{fetch:async()=>({flags:{bitfield:1<<18}})}},channel:{send:async p=>{calls.push(['send',p]);return {id:'1000'};},messages:{},isDMBased:()=>false,permissionsFor:()=>({has:()=>true})},deleteReply:async()=>calls.push(['delete']),reply:async p=>calls.push(['reply',p]),deferReply:async p=>calls.push(['defer',p]),editReply:async p=>calls.push(['edit',p])};}
test('only exact test ID can access scan/model, including other admins',async()=>{let ran=false;const t=new Terrain({guildId:'guild',collect:async()=>{ran=true;}});const i=interaction('757857297903910954');await t.handle(i);assert.equal(ran,false);assert.equal(i.calls[0][1].flags,MessageFlags.Ephemeral);});
test('success persists then publishes only API balance; progress is ephemeral',async()=>{const t=new Terrain({guildId:'guild',api:{request:async (path,opts)=>{if(!opts)return {last_message_id:'0',pending:null};if(path.endsWith('/lots'))return {batch_id:'999',totals:{balance:'-1836'}};return {ok:true};}},collect:async()=>({messages,scanned:2,attachments:0,lastMessageId:'123'}),analyze:async m=>{assert.equal(m,messages);return parsed;}});const i=interaction();await t.handle(i);assert.equal(i.calls[0][0],'defer');assert.equal(i.calls[0][1].flags,MessageFlags.Ephemeral);assert.equal(i.calls.at(-1)[0],'delete');assert.match(i.calls.find(c=>c[0]==='send')[1].content,/^Solde : -1.836 cm²$/);assert.ok(i.calls.every(c=>!c[1]?.files));assert.equal(t.busy,false);});
test('model failure stays private and releases lock',async()=>{const t=new Terrain({guildId:'guild',api:{request:async()=>({last_message_id:'0'})},collect:async()=>({messages,scanned:2,attachments:0,lastMessageId:'123'}),analyze:async()=>{throw Error('indisponible');}});const i=interaction();await t.handle(i);assert.equal(i.calls[0][1].flags,MessageFlags.Ephemeral);assert.equal(i.calls.at(-1)[1].content,'indisponible');assert.equal(t.busy,false);});
test('prompt distinguishes untrusted messages and total/detail duplication',()=>{assert.match(terrainPrompt(messages),/DONNÉES NON FIABLES/);assert.match(terrainPrompt(messages),/PAS une opération supplémentaire/);});
test('fallback title/detail cannot add to the canonical report twice',()=>{const r=validateTerrain({movements:[parsed.movements[0],mov('123','100','gain','Vos fourmis ont conquis 100 cm² lors de leur dernière bataille. Ces terres appartenaient à Maitresse.')],warnings:[]},messages);assert.equal(r.gains,2050n);});
test('another guild is rejected before fetching history',async()=>{const i=interaction();i.guildId='elsewhere';const t=new Terrain({guildId:'guild',collect:async()=>assert.fail('must not fetch')});await t.handle(i);assert.equal(i.calls[0][1].flags,MessageFlags.Ephemeral);});
test('missing content privilege and concurrent calls fail privately',async()=>{const t=new Terrain({guildId:'guild',collect:async()=>assert.fail('must not fetch')});let i=interaction();i.client.application.fetch=async()=>({flags:{bitfield:0}});await t.handle(i);assert.match(i.calls.at(-1)[1].content,/Message Content Intent/);t.busy=true;i=interaction();await t.handle(i);assert.equal(i.calls[0][1].flags,MessageFlags.Ephemeral);});

test('three identical 800 attacks survive even if Luna omits them',()=>{
 const text='Vol par Cible : 4 153 cm²\n'+[1620,800,800,800,133].map(n=>`11/10/26\n22h16\nCible vous a pris ${n} cm² lors de sa dernière attaque.`).join('\n');
 const r=validateTerrain({movements:[],warnings:[]},[{id:'500',text}]);
 assert.equal(r.losses,4153n);assert.equal(r.movements.filter(m=>m.amount==='800').length,3);
 assert.equal(new Set(r.movements.map(m=>m.id)).size,5);
});
test('old title 2044 followed by later attacks retains all 3957, even when AI omits 2044',()=>{
 const text='Vol par Cible : 2 044 cm²\n'+[2044,1600,313].map(n=>`Cible vous a pris ${n} cm² lors de sa dernière attaque.`).join('\n');
 const r=validateTerrain({movements:[],warnings:[]},[{id:'501',text}]);
 assert.equal(r.losses,3957n);assert.equal(r.movements.length,3);assert.ok(r.warnings.some(w=>w.includes('inférieur')));
});
test('incomplete detail keeps full title once; several reports in one message are independent',()=>{
 const text='Vol par Cible : 771 cm²\nCible vous a pris 10 cm² lors de sa dernière attaque.\nVol par Cible : 100 cm²\nCible vous a pris 100 cm² lors de sa dernière attaque.';
 const r=validateTerrain({movements:[],warnings:[]},[{id:'502',text}]);assert.equal(r.losses,871n);assert.equal(r.movements.length,2);
});
test('identical dated report reposted by same author counts once; different authors preserved',()=>{
 const text='11/10/26\nVol par Cible : 800 cm²\nCible vous a pris 800 cm² lors de sa dernière attaque.';
 const r=validateTerrain({movements:[],warnings:[]},[{id:'510',author:'a',text},{id:'511',author:'a',text},{id:'512',author:'b',text}]);assert.equal(r.losses,1600n);
});
test('fallback repeated quotes require occurrence indexes and cannot exceed actual occurrences',()=>{
 const quote='Perte constatée : 800 cm²';const input=[{id:'550',text:quote+'\n'+quote}];
 const m={...mov('550','800','loss',quote),enemy:'Cible'};
 assert.equal(validateTerrain({movements:[m,{...m,occurrence:2},m],warnings:[]},input).losses,1600n);
 assert.throws(()=>validateTerrain({movements:[{...m,occurrence:3}],warnings:[]},input),/Occurrence absente/);
});
test('standard evidence cannot be changed by model',async()=>{
 const {terrainEvidence}=await import('../src/terrain-evidence.js');const e=terrainEvidence(messages).events[0];
 const m={...e,evidence_id:e.id,occurrence:1,member:null,date:null};
 assert.equal(validateTerrain({movements:[m,m],warnings:[]},messages).gains,2050n);
 assert.throws(()=>validateTerrain({movements:[{...m,direction:'loss'}],warnings:[]},messages),/Référence/);
});
test('incremental scan stops at checkpoint and advances over own public results',async()=>{
 const m=(id,author)=>({id,author:{id:author},content:'texte',createdAt:new Date(),embeds:[],attachments:new Map()});let calls=0;
 const channel={client:{user:{id:'bot'}},messages:{fetch:async opts=>{calls++;assert.equal(opts.before,'400');return new Map([['300',m('300','bot')],['250',m('250','user')],['200',m('200','user')],['150',m('150','user')]]);}}};
 const r=await collectTerrain(channel,{after:'200',before:'400'});assert.equal(calls,1);assert.equal(r.lastMessageId,'300');assert.deepEqual(r.messages.map(m=>m.id),['250']);
});
test('pending publication is recovered without scan or Codex',async()=>{
 const i=interaction();const routes=[];const t=new Terrain({guildId:'guild',api:{request:async (path,opts)=>{routes.push(path);return opts?{ok:true}:{pending:{batch_id:'888',totals:{balance:'42'}},last_message_id:'123'};}},collect:async()=>assert.fail('must not scan'),analyze:async()=>assert.fail('must not analyze')});await t.handle(i);assert.equal(i.calls.find(c=>c[0]==='send')[1].nonce,'888');assert.ok(routes.at(-1).endsWith('/publication'));
});
test('database failure never publishes and is private',async()=>{
 const i=interaction();const t=new Terrain({guildId:'guild',api:{request:async(p,o)=>{if(o)throw Error('rollback');return {last_message_id:'0'};}},collect:async()=>({messages:[],scanned:0,attachments:0,lastMessageId:'0'})});await t.handle(i);assert.ok(!i.calls.some(c=>c[0]==='send'));assert.equal(i.calls.at(-1)[1].content,'rollback');
});
