import test from 'node:test';import assert from 'node:assert/strict';
import {Deliveries,deliveryCommand,deliveryPayload,deliveryDuration} from '../src/deliveries.js';
import {MessageFlags} from 'discord.js';
test('required speed, private interaction in any guild channel and exact caller identity',async()=>{
 assert.equal(deliveryCommand.options[0].required,true);
 const calls=[];const i={guildId:'guild',channelId:'another-channel',user:{id:'123'},isChatInputCommand:()=>true,options:{getInteger:()=>7},deferReply:async p=>calls.push(p),editReply:async p=>calls.push(p)};
 const api={request:async path=>{assert.match(path,/discord_id=123&vitesse=7/);return {joueur:'Test',vitesse:7,page:1,pages:1,total:0,lignes:[]};}};
 await new Deliveries({api,guildId:'guild'}).handle(i);assert.equal(calls[0].flags,MessageFlags.Ephemeral);assert.equal(calls[1].embeds.length,1);
});
test('another guild or another owner cannot query the API',async()=>{
 const d=new Deliveries({guildId:'g',api:{request:()=>assert.fail('Forbidden')}});let responses=0;
 const i={guildId:'other',user:{id:'123'},reply:async()=>responses++};await d.handle(i);
 await d.handle({...i,guildId:'g',isChatInputCommand:()=>false,customId:'uptep:delivery:456:7:2'});assert.equal(responses,2);
});
test('durations, missing coordinates and pagination preserve speed',()=>{
 assert.equal(deliveryDuration(90061),'1j 01:01:01');
 const p=deliveryPayload({joueur:'X',vitesse:4,page:1,pages:2,total:9,lignes:[{id:'9',pseudo_demandeur:'Y',nbpomme_restant:'1000',nbmateriaux_restant:'0',distance:null,seconds:null}]},'123');
 assert.match(p.embeds[0].data.fields[0].value,/Coordonnées indisponibles/);assert.equal(p.components[0].components[0].data.custom_id,'uptep:delivery:123:4:2');
});
