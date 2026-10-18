import {EmbedBuilder,PermissionFlagsBits} from 'discord.js';
import {fmt,short} from './domain.js';
import {createHash} from 'node:crypto';
export class ValidationNotifications {
 constructor({state,getChannel,api}){Object.assign(this,{state,getChannel,api});this.running=null;}
 enqueue(demand){
  if(!demand?.valide)return;
  const key=String(demand.id);this.state.data.validationNotifications??={};
  const prior=this.state.data.validationNotifications[key];
  if(prior&&!prior.removed&&prior.demand.date_validation===demand.date_validation)return;
  this.state.data.validationNotifications[key]={demand,sent:null,extraMessages:prior&&!prior.removed?[...(prior.extraMessages??[]),prior.sent].filter(Boolean):[]};this.state.save();
 }
 flush(){if(this.running)return this.running;this.running=this.sendPending().finally(()=>{this.running=null;});return this.running;}
 cleanClosed(){if(this.running)return this.running.then(()=>this.cleanClosed());this.running=this.removeClosed().finally(()=>{this.running=null;});return this.running;}
 async removeClosed(){
  if(!this.api)return 0;
  const channel=this.getChannel();if(!channel)return 0;
  const entries=Object.entries(this.state.data.validationNotifications??{}).filter(([,e])=>!e.removed);
  let count=0;
  for(let start=0;start<entries.length;start+=100){
   const group=entries.slice(start,start+100);const data=await this.api.request('/demandes/statuts?'+new URLSearchParams({ids:group.map(([id])=>id).join(',')}));
   const closed=new Set(data.demandes.filter(d=>d.fini||d.annulee||d.valide===false).map(d=>String(d.id)));
   for(const [id,entry] of group){if(!closed.has(id))continue;entry.closed=true;this.state.save();
    for(const messageId of new Set([entry.sent,...(entry.extraMessages??[])].filter(Boolean))){
     try{const message=await channel.messages.fetch(messageId);
      if(message.author.id!==channel.client.user.id||message.content!=='@everyone Une demande de ressources vient d’être validée !'||!message.embeds.some(e=>e.title?.startsWith('Demande #'+id+' validée · ')))throw Error('Annonce de validation non reconnue');
      await message.delete();count++;
     }catch(e){if(e.code!==10008)throw e;}
    }
    entry.removed=true;this.state.save();
   }
  }
  return count;
 }
 async recoverAnnouncements(){
  const channel=this.getChannel();let before,count=0;
  this.state.data.validationNotifications??={};
  for(;;){const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});if(!page.size)break;
   for(const m of page.values()){
    if(m.author.id!==channel.client.user.id||m.content!=='@everyone Une demande de ressources vient d’être validée !')continue;
    const match=/^Demande #([1-9][0-9]*) validée · /.exec(m.embeds[0]?.title??'');if(!match)continue;
    const id=match[1],entry=this.state.data.validationNotifications[id];
    if(!entry)this.state.data.validationNotifications[id]={demand:{id},sent:m.id};
    else if(entry.sent!==m.id){entry.extraMessages=[...new Set([...(entry.extraMessages??[]),m.id])];entry.removed=false;}
    count++;
   }
   before=[...page.keys()].reduce((a,b)=>BigInt(a)<BigInt(b)?a:b);this.state.save();
  }
  return count;
 }
 async sendPending(){
  const channel=this.getChannel();if(!channel)return;
  for(const [id,entry] of Object.entries(this.state.data.validationNotifications??{})){
   if(entry.sent||entry.closed)continue;
   if(!channel.permissionsFor(channel.client.user)?.has(PermissionFlagsBits.MentionEveryone))throw new Error('Permission MentionEveryone nécessaire pour annoncer les validations.');
   const d=entry.demand;
   const embed=new EmbedBuilder().setColor(0x4b9d52).setTitle(short(`Demande #${id} validée · ${d.pseudo_demandeur}`,200)).setDescription(short(d.objet||'Ressources',200)+(d.niveau?' · niveau '+d.niveau:'')+(d.auto_production?'\n🏭 **Auto production**':'')).addFields({name:'Ressources restantes',value:`🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}`}).setFooter({text:'Utilise /livraisons pour estimer ton trajet, puis Déclarer un convoi pour enregistrer ton envoi.'});
   const nonce=d.date_validation?'val-'+createHash('sha256').update(id+':'+d.date_validation).digest('hex').slice(0,20):'val-'+id;
   const msg=await channel.send({content:'@everyone Une demande de ressources vient d’être validée !',embeds:[embed],allowedMentions:{parse:['everyone'],users:[],roles:[]},nonce,enforceNonce:true});
   entry.sent=msg.id;this.state.save();
  }
 }
}

export class ConvoyNotifications {
 constructor({state,client}){Object.assign(this,{state,client});this.running=null;}
 enqueue(result){
  const c=result?.convoi,d=result?.demande;
  if(!c?.id||c.annule||!d?.discord_demandeur)return;
  this.state.data.convoyNotifications??={};const key=String(c.id);
  if(this.state.data.convoyNotifications[key])return;
  this.state.data.convoyNotifications[key]={recipient:String(d.discord_demandeur),convoy:c,demandId:String(d.id),sent:null,skipped:false};this.state.save();
 }
 flush(){if(this.running)return this.running;this.running=this.sendPending().finally(()=>{this.running=null;});return this.running;}
 async sendPending(){
  for(const [id,entry] of Object.entries(this.state.data.convoyNotifications??{})){
   if(entry.sent||entry.skipped)continue;
   try{
    const c=entry.convoy;const timestamp=c.date_arrivee?Math.floor(Date.parse(c.date_arrivee)/1000):NaN;
    const embed=new EmbedBuilder().setColor(0x3488ad).setTitle(`Un convoi pour ta demande #${entry.demandId}`).addFields(
     {name:'Expéditeur',value:short(c.pseudo_envoyeur||'Inconnu',200)},
     {name:'Ressources déclarées',value:`🍎 ${fmt(c.nbpomme)} pommes · 🪵 ${fmt(c.nbmateriaux)} matériaux`},
     {name:'Arrivée prévue',value:Number.isFinite(timestamp)?`<t:${timestamp}:F> (<t:${timestamp}:R>)`:'Non renseignée'}
    ).setFooter({text:`Convoi #${id} · Déclaration enregistrée sur UPTEP`});
    const user=await this.client.users.fetch(entry.recipient);
    const message=await user.send({embeds:[embed],allowedMentions:{parse:[]},nonce:'dm-'+id,enforceNonce:true});
    entry.sent=message.id;this.state.save();
   }catch(e){
    if([50007,50013,10013].includes(Number(e.code))){entry.skipped=true;this.state.save();}
    else console.error('MP convoi différé :',e.name);
   }
  }
 }
}
