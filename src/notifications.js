import {EmbedBuilder,PermissionFlagsBits} from 'discord.js';
import {fmt,short} from './domain.js';
export class ValidationNotifications {
 constructor({state,getChannel}){Object.assign(this,{state,getChannel});this.running=null;}
 enqueue(demand){
  if(!demand?.valide)return;
  const key=String(demand.id);this.state.data.validationNotifications??={};
  if(this.state.data.validationNotifications[key])return;
  this.state.data.validationNotifications[key]={demand,sent:null};this.state.save();
 }
 flush(){if(this.running)return this.running;this.running=this.sendPending().finally(()=>{this.running=null;});return this.running;}
 async sendPending(){
  const channel=this.getChannel();if(!channel)return;
  for(const [id,entry] of Object.entries(this.state.data.validationNotifications??{})){
   if(entry.sent)continue;
   if(!channel.permissionsFor(channel.client.user)?.has(PermissionFlagsBits.MentionEveryone))throw new Error('Permission MentionEveryone nécessaire pour annoncer les validations.');
   const d=entry.demand;
   const embed=new EmbedBuilder().setColor(0x4b9d52).setTitle(short(`Demande #${id} validée · ${d.pseudo_demandeur}`,200)).setDescription(short(d.objet||'Ressources',200)+(d.niveau?' · niveau '+d.niveau:'')).addFields({name:'Ressources restantes',value:`🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}`}).setFooter({text:'Utilise /livraisons pour estimer ton trajet, puis Déclarer un convoi pour enregistrer ton envoi.'});
   const msg=await channel.send({content:'@everyone Une demande de ressources vient d’être validée !',embeds:[embed],allowedMentions:{parse:['everyone'],users:[],roles:[]},nonce:'val-'+id,enforceNonce:true});
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
