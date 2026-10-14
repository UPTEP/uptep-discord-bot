import fs from 'node:fs';
import path from 'node:path';

// Only the root-managed Gateway client calls this guard. There is no local API.
export class InteractionGuard {
 constructor({applicationId,guildId,ownerId,file,now=Date.now}){
  Object.assign(this,{applicationId,guildId,ownerId,file,now});
  this.seen=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 }
 claim(i){
  if(!i.isChatInputCommand()||i.commandName!=='solde-terrain'||i.applicationId!==this.applicationId||i.guildId!==this.guildId||i.user.id!==this.ownerId)return false;
  if(!/^\d{17,20}$/.test(i.id))return false;
  const issued=Number((BigInt(i.id)>>22n)+1420070400000n),now=this.now();
  if(issued>now+5000||now-issued>60000||Object.hasOwn(this.seen,i.id))return false;
  this.seen=Object.fromEntries(Object.entries(this.seen).filter(([,time])=>now-time<86400000));
  this.seen[i.id]=now;
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.seen),{mode:0o600});fs.renameSync(temp,this.file);
  return true;
 }
}
