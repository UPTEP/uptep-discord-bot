import {UserError} from './domain.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class ApiError extends UserError{constructor(status,message,uncertain=false){super(message);this.status=status;this.uncertain=uncertain;}}
export class Api {
 constructor(config,{fetchImpl=fetch,wait=sleep,interval=2200}={}){this.base=config.apiUrl;this.token=config.apiToken;this.fetchImpl=fetchImpl;this.wait=wait;this.interval=interval;this.tail=Promise.resolve();this.next=0;}
 request(path,{body}={}){
  if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid API path');
  const task=()=>this.run(path,body);const result=this.tail.then(task);this.tail=result.catch(()=>{});return result;
 }
 async run(path,body){
  const serialized=body===undefined?undefined:JSON.stringify(body);
  for(let attempt=0;attempt<3;attempt++){
   await this.wait(Math.max(0,this.next-Date.now()));this.next=Date.now()+this.interval;
   let response,data;
   try{response=await this.fetchImpl(this.base+path,{method:serialized===undefined?'GET':'POST',headers:{Authorization:'Bearer '+this.token,...(serialized===undefined?{}:{'Content-Type':'application/json'})},body:serialized,signal:AbortSignal.timeout(12000),redirect:'error'});data=await response.json().catch(()=>null);}
   catch{if(attempt<2){await this.wait(2000*(attempt+1));continue;}throw new ApiError(503,'UPTEP ne répond pas. Réessaie avec le bouton prévu ; la même commande sera réutilisée.',serialized!==undefined);}
   if(response.status===429||response.status>=500){if(attempt<2){const retry=Number(response.headers.get('retry-after'));await this.wait(response.status===429?Math.min(60000,Math.max(10000,(Number.isFinite(retry)?retry:10)*1000)):2000*(attempt+1));continue;}throw new ApiError(response.status,'UPTEP est momentanément indisponible ou trop sollicité. Réessaie dans quelques instants.',serialized!==undefined);}
   if(!response.ok||data?.ok!==true){
    const message=[403,404,409,422].includes(response.status)&&typeof data?.error==='string'&&!/^[a-z_]+$/.test(data.error)?data.error:response.status===401?'Le secret API du bot est invalide ou expiré. Contacte un administrateur.':'La requête a été refusée par UPTEP.';
    throw new ApiError(response.status,message);
   }
   return data;
  }
 }
 member(id){return this.request('/membres/'+id).then(r=>r.membre);}
 async cancelableConvoys(discordId){
  let after='0',all=[];const seen=new Set();
  do{if(seen.has(after))throw new Error('Invalid pagination');seen.add(after);const data=await this.request('/convois?'+new URLSearchParams({discord_id:discordId,apres:after,limite:'100'}));all.push(...data.convois);after=data.suite_apres;}while(after!==null);return all;
 }
 async demands(){
  let after='0',all=[];const seen=new Set();const since=new Date(Date.now()-7*86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
  do{if(seen.has(after))throw new Error('Invalid pagination');seen.add(after);const data=await this.request('/demandes?'+new URLSearchParams({estimation:'1',etat:'les_deux',include:'convois',terminees_depuis:since,limite:'100',apres:after}));all.push(...data.demandes);after=data.suite_apres;}while(after!==null);return all;
 }
}
export class Snapshot {
 constructor(api){this.api=api;this.value=null;this.loadedAt=0;this.pending=null;this.generation=0;}
 invalidate(){this.loadedAt=0;this.generation++;}
 async get(){
  if(this.pending){await this.pending;return this.get();}
  if(this.value&&Date.now()-this.loadedAt<15000)return this.value;
  const version=this.generation;
  this.pending=this.api.demands().then(rows=>{this.value=rows;if(this.generation===version)this.loadedAt=Date.now();return rows;});
  try{return await this.pending;}finally{this.pending=null;}
 }
}
