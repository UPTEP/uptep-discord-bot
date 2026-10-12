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
