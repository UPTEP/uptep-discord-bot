import test from 'node:test';import assert from 'node:assert/strict';
import {SiteLogin,loginCommand} from '../src/login.js';
const MEMBER='222222222222222222';
const url='https://uptep.top/discord-login.php#'+'a'.repeat(64);
function interaction(overrides={}){return {user:{id:MEMBER},guildId:'guild',replies:[],reply:async function(p){this.replies.push(p);},deferReply:async function(p){this.replies.push(p);this.deferred=true;},editReply:async function(p){this.replies.push(p);},deleteReply:async()=>{},...overrides};}
test('connexion rejects other guilds and DMs before calling the API',async()=>{
 let calls=0;const command=new SiteLogin({guildId:'guild',api:{request:async()=>{calls++;return {url};}}});
 for(const overrides of [{guildId:'other'},{guildId:null}]){const i=interaction(overrides);await command.handle(i);assert.equal(i.replies[0].flags,64);assert.equal(i.deferred,undefined);}
 assert.equal(calls,0);assert.equal(loginCommand.name,'connexion');assert.equal(loginCommand.options?.length??0,0);
});
test('connexion derives identity from interaction, sends private link and suppresses previews',async()=>{
 const calls=[];const command=new SiteLogin({guildId:'guild',api:{request:async(...args)=>{calls.push(args);return {url};}}});
 const i=interaction();await command.handle(i);assert.equal(i.replies[0].flags,64);assert.deepEqual(calls,[['/connexion',{body:{discord_id:MEMBER,guild_id:'guild'}}]]);assert.ok(i.replies[1].content.includes(url));assert.equal(i.replies[1].flags,4);assert.deepEqual(i.replies[1].allowedMentions,{parse:[]});
});
test('connexion does not display untrusted URLs or errors containing secrets',async()=>{
 for(const response of ['https://evil.example/','https://uptep.top.evil.example/discord-login.php#'+'a'.repeat(64),'https://uptep.top/discord-login.php?token=secret']){
 const command=new SiteLogin({guildId:'guild',api:{request:async()=>({url:response})}});const i=interaction();await command.handle(i);assert.match(i.replies[1].content,/indisponible/);assert.ok(!i.replies[1].content.includes(response));
 }
 const command=new SiteLogin({guildId:'guild',api:{request:async()=>{throw Error('secret-token');}}});const i=interaction();await command.handle(i);assert.ok(!JSON.stringify(i.replies).includes('secret-token'));assert.equal(command.busy.size,0);
});
test('connexion prevents overlapping requests',async()=>{
 let release,calls=0;const wait=new Promise(r=>release=r);const command=new SiteLogin({guildId:'guild',api:{request:async()=>{calls++;await wait;return {url};}}});
 const pending=command.handle(interaction());await Promise.resolve();const second=interaction();await command.handle(second);assert.equal(calls,1);assert.equal(second.replies[0].flags,64);release();await pending;
});

test('connexion handles different members concurrently without mixing identities',async()=>{
 const pending=new Map(),calls=[];
 const command=new SiteLogin({guildId:'guild',api:{request:async(path,{body})=>{calls.push(body.discord_id);return new Promise(resolve=>pending.set(body.discord_id,resolve));}}});
 const first=interaction(),second=interaction({user:{id:'333333333333333333'}});
 const a=command.handle(first),b=command.handle(second);await Promise.resolve();
 assert.deepEqual(calls,[MEMBER,'333333333333333333']);
 const otherUrl='https://uptep.top/discord-login.php#'+'b'.repeat(64);
 pending.get(MEMBER)({url});pending.get('333333333333333333')({url:otherUrl});await Promise.all([a,b]);
 assert.ok(first.replies[1].content.includes(url));assert.ok(second.replies[1].content.includes(otherUrl));assert.equal(command.busy.size,0);
});
