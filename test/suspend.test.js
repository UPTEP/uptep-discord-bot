import test from 'node:test';import assert from 'node:assert/strict';
import {SuspendDemand,suspendCommand} from '../src/suspend.js';
import {UserError} from '../src/domain.js';
test('Suspension réservée aux admins, privée, précise et actualisant le tableau',async()=>{
 let admins=[],payload,invalidations=0,refreshes=0;const requests=[];
 const command=new SuspendDemand({admins:()=>admins,api:{request:async(path,options)=>{requests.push({path,...options});return {demande:{id:'9007199254740993',pseudo_demandeur:'Joueur'}};}},snapshot:{invalidate:()=>invalidations++},refresh:async()=>refreshes++});
 const interaction={id:'123456789012345678',user:{id:'102'},options:{getString:()=> '#9007199254740993'},deferReply:async function(p){assert.equal(p.flags,64);this.deferred=true;},editReply:async p=>payload=p};
 await command.handle({...interaction});assert.equal(requests.length,0);assert.match(payload.content,/ADMIN_DISCORD_IDS/);
 admins=['102'];await command.handle({...interaction});assert.equal(requests[0].path,'/demandes/9007199254740993/suspension');assert.deepEqual(requests[0].body,{commande_id:'suspension:123456789012345678',discord_id:'102'});assert.equal(invalidations,1);assert.equal(refreshes,1);assert.match(payload.content,/en attente/);assert.deepEqual(payload.allowedMentions,{parse:[]});
 await command.handle({...interaction,options:{getString:()=>'-1'}});assert.equal(requests.length,1);assert.match(payload.content,/numéro/);
 command.api.request=async()=>{throw new UserError('Demande déjà terminée.');};await command.handle({...interaction});assert.equal(refreshes,1);assert.match(payload.content,/terminée/);
 assert.equal(suspendCommand.options[0].required,true);
});
