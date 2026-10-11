import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';import {UserError} from './domain.js';
export class State {
 constructor(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});this.file=path.join(dir,'state.json');this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{boards:{},sessions:{}};this.prune();}
 save(){const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.data),{mode:0o600});fs.renameSync(temp,this.file);}
 prune(){for(const [id,s] of Object.entries(this.data.sessions))if(s.expires<Date.now())delete this.data.sessions[id];this.save();}
 create(owner,type,data={},ttl=86400000){this.prune();if(Object.keys(this.data.sessions).length>=2000)throw new UserError('Trop de formulaires ouverts. Réessaie plus tard.');const id=randomBytes(12).toString('hex');this.data.sessions[id]={owner,type,data,expires:Date.now()+ttl};this.save();return id;}
 get(id,owner){const s=this.data.sessions[id];if(!s||s.owner!==owner||s.expires<Date.now())throw new UserError('Ce formulaire a expiré ou ne t’appartient pas. Repars du tableau.');return s;}
 set(id,data){this.data.sessions[id].data=data;this.save();}
 board(key){return this.data.boards[key]??null;}
 setBoard(key,id){this.data.boards[key]=id;this.save();}
}
