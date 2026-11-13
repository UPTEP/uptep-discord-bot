import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WarAlerts,warAlertPayload,parisTime} from '../src/war-alerts.js';
const alert={tag:'-AP-',name:'Alliance',members:52,total_field:'7580000',exported_at:'2026-10-28T16:03:00Z',export_version:'202610281600',span_hours:12.02,
 pumped:[{player_id:'1',pseudo:'touptizoizu',field_before:'31836',field_now:'215396',chain_amount:'150000',donors:[{player_id:'7',pseudo:'Huntaz',amount:'100000'},{player_id:'8',pseudo:'venin_rouge',amount:'50000'}],neighbours:[{player_id:'9',pseudo:'Near',field:'50000',distance:3.2}]},
  {player_id:'2',pseudo:'CarolusRex',field_before:'36790',field_now:'117746',chain_amount:'70000',donors:[],neighbours:[]}],
 top_count:10,idle_count:6,idle:[{pseudo:'Azoxx'},{pseudo:'Titus'}],wars:[],pacts:[{tag:'-O-',name:'O',description:'Pacte défensif'},'ZZZ'],home_pact:false};
const description=p=>p.embeds[0].data.description;
test('alert message shows Paris time, chain donors, idle accounts and diplomacy without mentions',()=>{
 assert.equal(parisTime('2026-10-28T16:03:00Z'),'28/10 17h03');
 const p=warAlertPayload({kind:'nouvelle',payload:alert});
 assert.match(p.embeds[0].data.title,/^⚠️ Préparation possible : -AP- \(52 membres, 7\s580\s000 TDC\)$/u);
 const d=description(p);
 assert.match(d,/Relevé : 28\/10 17h03/);
 assert.match(d,/\*\*touptizoizu\*\* 31\s836 → 215\s396 \(×6,8\), chaîne : Huntaz \(100\s000\), venin\\_rouge \(50\s000\)/u);
 assert.match(d,/UPTEP proches : Near à 3,2/);
 assert.match(d,/6\/10 \(Azoxx, Titus\)/);
 assert.match(d,/pactes \[-O- : Pacte défensif, ZZZ\] · pacte avec UPTEP : non/);
 assert.match(d,/possible/);
 assert.deepEqual(p.allowedMentions,{parse:[]});
});
test('updates list only the new pumped accounts',()=>{
 const d=description(warAlertPayload({kind:'mise_a_jour',episode_start:'2026-10-28T16:03:00Z',payload:{...alert,new_player_ids:['2']}}));
 assert.match(d,/CarolusRex/);assert.doesNotMatch(d,/touptizoizu/);assert.match(d,/épisode commencé le 28\/10 17h03/);
});
test('long alerts stay under the Discord description limit',()=>{
 const many=Array.from({length:80},(_,i)=>({...alert.pumped[0],player_id:String(i),pseudo:'compte'+i}));
 const d=description(warAlertPayload({kind:'nouvelle',payload:{...alert,pumped:many}}));
 assert.ok(d.length<=4096);assert.match(d,/… et \d+ autre\(s\) compte\(s\)\./);assert.match(d,/Diplomatie/);
});
function harness({fail=false}={}){
 const calls=[];let n=0;
 const state={data:{},save:()=>calls.push('save')};
 const events=[{id:'5',kind:'nouvelle',episode_id:'1',episode_message_id:null,payload:alert},{id:'6',kind:'mise_a_jour',episode_id:'1',episode_message_id:null,payload:{...alert,new_player_ids:['2']}}];
 const api={request:async(path,options)=>{calls.push((options?'POST ':'GET ')+path+(options?.body?.id?':'+options.body.id+':'+options.body.message_id:''));if(path.endsWith('/evaluation'))return {status:'evaluated'};if(options)return {ok:true};return {events};}};
 const channel={isTextBased:()=>true,isDMBased:()=>false,guildId:'g',permissionsFor:()=>({has:()=>true}),send:async payload=>{if(fail&&n===1)throw Error('discord');n++;calls.push('send'+(payload.reply?':reply:'+payload.reply.messageReference:''));return {id:'99999999999999999'+n};}};
 const client={user:{},channels:{fetch:async()=>channel}};
 return {calls,state,alerts:new WarAlerts({api,state,client,guildId:'g',channelId:'c',log:{error(){},warn(){}}})};
}
test('events are published, replies thread on the first message, and acks follow the saved message id',async()=>{
 const {calls,alerts}=harness();await alerts.tick();
 assert.deepEqual(calls.filter(c=>c!=='save'),['POST /alertes-guerre/evaluation','GET /alertes-guerre','send','POST /alertes-guerre:5:999999999999999991','send:reply:999999999999999991','POST /alertes-guerre:6:999999999999999992']);
});
test('a message sent but not acknowledged is not posted twice',async()=>{
 const {state,alerts}=harness({fail:true});await assert.rejects(alerts.tick());
 assert.deepEqual(state.data.warAlerts,{},'nothing pending after a failed send');
 // Crash simulé après l'envoi de l'événement 5, avant son acquittement.
 const second=harness();second.state.data.warAlerts={'5':'777777777777777777'};await second.alerts.tick();
 assert.deepEqual(second.calls.filter(c=>c!=='save'),['POST /alertes-guerre/evaluation','GET /alertes-guerre','POST /alertes-guerre:5:777777777777777777','send:reply:777777777777777777','POST /alertes-guerre:6:999999999999999991']);
 assert.deepEqual(second.state.data.warAlerts,{});
});
