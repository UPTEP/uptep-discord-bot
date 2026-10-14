import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {InteractionGuard} from '../protected-terrain/guard.js';
import {runTerrainCodex} from '../src/terrain.js';
const now=Date.now();
const snowflake=(time,sequence=0)=>String((BigInt(time)-1420070400000n)<<22n|BigInt(sequence));
const interaction=(overrides={})=>({isChatInputCommand:()=>true,commandName:'solde-terrain',applicationId:'app',guildId:'guild',user:{id:'owner'},id:snowflake(now),...overrides});
test('protected gateway guard rejects another user, guild, application, command and stale interaction',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terrain-guard-'));
 try{
  const guard=new InteractionGuard({applicationId:'app',guildId:'guild',ownerId:'owner',file:path.join(dir,'seen.json'),now:()=>now});
  for(const change of [{user:{id:'other'}},{guildId:'other'},{applicationId:'other'},{commandName:'another'},{isChatInputCommand:()=>false},{id:snowflake(now-61000)},{id:snowflake(now+6000)},{id:'invalid'}])assert.equal(guard.claim(interaction(change)),false);
  assert.equal(fs.existsSync(path.join(dir,'seen.json')),false);
  assert.equal(guard.claim(interaction()),true);
  assert.equal(guard.claim(interaction()),false);
  const restarted=new InteractionGuard({applicationId:'app',guildId:'guild',ownerId:'owner',file:path.join(dir,'seen.json'),now:()=>now});
  assert.equal(restarted.claim(interaction()),false);
  assert.equal(restarted.claim(interaction({id:snowflake(now,1)})),true);
  assert.equal(fs.statSync(path.join(dir,'seen.json')).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('the development bot has no Codex runner entry point',async()=>{
 await assert.rejects(runTerrainCodex(),/service terrain protégé/);
});
