import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {parseHunts} from './hunt-parser.js';
import {floodReplyCleanup} from './floods.js';
import {fmt,short,escape as esc,UserError} from './domain.js';
const row=(...buttons)=>new ActionRowBuilder().addComponents(buttons);
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId('uptep:hunt:'+id).setLabel(label).setStyle(style);
const PAGE=10;
export function huntBoard(){return {embeds:[new EmbedBuilder().setColor(0x5f8a3a).setTitle('🌿 UPTEP · Déclaration des chasses').setDescription('Tu n’utilises pas UPTEP+ ? Copie le bloc **Chasse en cours** de la page Chasse ou Ressources, colle-le ici, vérifie le résultat puis confirme.\nLes chasses déjà relevées par UPTEP+ ne sont pas dupliquées.').setFooter({text:'UPTEP_HUNTS_V1'})],components:[row(button('declare','Déclarer mes chasses',ButtonStyle.Success),button('mine','Mes chasses en cours',ButtonStyle.Primary),button('all','Toutes les chasses en cours',ButtonStyle.Primary))],allowedMentions:{parse:[]}};}
export function huntLine(h,n){const ts=Math.floor(Date.parse(h.arrival_at)/1000);return `**${n}.** ${fmt(h.area)} cm² · arrivée <t:${ts}:F> (<t:${ts}:R>)`;}
export class Hunts{
 constructor({api,state,client,guildId,channelId}){Object.assign(this,{api,state,client,guildId,channelId});this.busy=new Set();this.mounting=false;}
 async mount(){
  if(!this.channelId||this.mounting)return;this.mounting=true;
  try{const c=await this.client.channels.fetch(this.channelId);if(c.guildId!==this.guildId||!c.isTextBased()||c.isDMBased())throw Error('Salon chasses invalide');
   const key='hunts:'+this.guildId+':'+this.channelId;const saved=this.state.board(key);let message=saved?await c.messages.fetch(saved).catch(e=>{if(e.code===10008)return null;throw e;}):null;
   if(!message){const recent=await c.messages.fetch({limit:100});message=recent.find(m=>m.author.id===this.client.user.id&&m.embeds.some(e=>e.footer?.text==='UPTEP_HUNTS_V1'));}
   if(message&&message.author.id!==this.client.user.id)throw Error('Tableau chasses invalide');
   if(!message)message=await c.send(huntBoard());else if(!this.mounted)await message.edit(huntBoard());
   this.state.setBoard(key,message.id);this.mounted=true;
  }finally{this.mounting=false;}
 }
 preview(sid,s,page=0){
  const items=s.data.hunts,pages=Math.ceil(items.length/PAGE);page=Math.max(0,Math.min(pages-1,page));
  const total=items.reduce((sum,h)=>sum+BigInt(h.area),0n);
  const e=new EmbedBuilder().setTitle('Confirmer mes chasses').setColor(0x5f8a3a).setDescription(`Joueur : **${s.data.pseudo}**\nRien n’est enregistré avant confirmation. Vérifie les surfaces et les arrivées.\n\n`+items.slice(page*PAGE,page*PAGE+PAGE).map((h,i)=>huntLine(h,page*PAGE+i+1)).join('\n')).setFooter({text:`${items.length} chasse${items.length>1?'s':''} · ${fmt(total)} cm² au total · Page ${page+1}/${pages}`});
  if(s.data.warnings.length)e.addFields({name:'⚠️ Vérifications',value:short(s.data.warnings.join('\n'),1000)});
  const buttons=[];if(page>0)buttons.push(button(`preview:${sid}:${page-1}`,'Précédent'));if(page+1<pages)buttons.push(button(`preview:${sid}:${page+1}`,'Suivant'));
  buttons.push(button('confirm:'+sid,items.length>1?`Confirmer les ${items.length} chasses`:'Confirmer la chasse',ButtonStyle.Success),button('cancel:'+sid,'Abandonner',ButtonStyle.Danger));
  return {embeds:[e],components:[row(...buttons)],allowedMentions:{parse:[]}};
 }
 async mine(i){
  const data=await this.api.request('/chasses?'+new URLSearchParams({discord_id:i.user.id}));
  const e=new EmbedBuilder().setTitle('Mes chasses en cours · '+data.pseudo).setColor(0x5f8a3a);
  if(!data.hunts.length)e.setDescription('Aucune chasse en cours enregistrée.');
  else{const total=data.hunts.reduce((sum,h)=>sum+BigInt(h.area),0n);e.setDescription(data.hunts.slice(0,25).map((h,n)=>huntLine(h,n+1)+(h.source==='discord'?' · Discord':' · UPTEP+')).join('\n')).setFooter({text:`${data.hunts.length} chasse${data.hunts.length>1?'s':''} · ${fmt(total)} cm² à venir`});}
  await i.editReply({embeds:[e],allowedMentions:{parse:[]}});
 }
 // Whole alliance, 10 per page; the pagination buttons belong to the member who opened the list.
 async all(i,page){
  const data=await this.api.request('/chasses?'+new URLSearchParams({discord_id:i.user.id,scope:'all',page:String(page)}));
  const e=new EmbedBuilder().setTitle('Toutes les chasses en cours').setColor(0x5f8a3a).setFooter({text:`${data.total} chasse${data.total>1?'s':''} · ${fmt(data.area)} cm² à venir · Page ${data.page}/${data.pages}`});
  e.setDescription(data.hunts.length?data.hunts.map((h,n)=>{const ts=Math.floor(Date.parse(h.arrival_at)/1000);return `**${(data.page-1)*10+n+1}.** **${esc(h.pseudo)}** · ${fmt(h.area)} cm² · <t:${ts}:t> (<t:${ts}:R>)`;}).join('\n'):'Aucune chasse en cours enregistrée.');
  const buttons=[];if(data.page>1)buttons.push(button(`list:${i.user.id}:${data.page-1}`,'Précédent'));if(data.page<data.pages)buttons.push(button(`list:${i.user.id}:${data.page+1}`,'Suivant'));
  await i.editReply({embeds:[e],components:buttons.length?[row(...buttons)]:[],allowedMentions:{parse:[]}});
 }
 async handle(i){const restore=floodReplyCleanup(i);try{return await this.process(i);}finally{restore();}}
 async process(i){
  if(i.guildId!==this.guildId||i.channelId!==this.channelId)return i.reply({content:'Ces boutons sont réservés au salon des chasses.',flags:MessageFlags.Ephemeral});
  const [,,action,id,arg]=i.customId.split(':');
  try{
   if(action==='declare')return await i.showModal(new ModalBuilder().setCustomId('uptep:hunt:form').setTitle('Déclarer mes chasses').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report').setLabel('Colle le bloc « Chasse en cours »').setPlaceholder('Vos chasseuses vont conquérir 2 205 cm² dans 3 heures 19 minutes…').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000))));
   const captured=new Date();await i.deferReply({flags:MessageFlags.Ephemeral});
   if(action==='form'){
    const parsed=parseHunts(i.fields.getTextInputValue('report'),captured);
    const member=await this.api.member(i.user.id);// Refuses unassociated Discord accounts before any confirmation.
    const sid=this.state.create(i.user.id,'hunt',{...parsed,pseudo:member.pseudo},3600000);
    return await i.editReply(this.preview(sid,this.state.get(sid,i.user.id)));
   }
   if(action==='mine')return await this.mine(i);
   if(action==='all')return await this.all(i,1);
   if(action==='list'){if(id!==i.user.id)throw new UserError('Cette liste appartient à un autre joueur.');return await this.all(i,Number(arg));}
   const s=this.state.get(id,i.user.id);if(s.type!=='hunt')throw new UserError('Formulaire invalide.');
   if(s.data.cancelled)throw new UserError('Déclaration abandonnée.');if(s.data.done)return await i.editReply('Ces chasses ont déjà été enregistrées.');
   if(action==='preview')return await i.editReply(this.preview(id,s,Number(arg)));
   if(action==='cancel'){if(this.busy.has(id))throw new UserError('Enregistrement en cours.');this.state.set(id,{...s.data,cancelled:true});return await i.editReply('Déclaration abandonnée.');}
   if(action!=='confirm')throw new UserError('Action inconnue.');if(this.busy.has(id))throw new UserError('Enregistrement en cours.');this.busy.add(id);
   // Saving again is harmless: the same area and arrival refresh the existing hunt instead of adding one.
   try{const result=await this.api.request('/chasses',{body:{discord_id:i.user.id,captured_at:s.data.captured_at,hunts:s.data.hunts}});this.state.set(id,{...s.data,done:true});await i.editReply(`✅ ${result.count} chasse${result.count>1?'s':''} enregistrée${result.count>1?'s':''} sur UPTEP. Tu as maintenant ${result.hunts.length} chasse${result.hunts.length>1?'s':''} en cours enregistrée${result.hunts.length>1?'s':''}.`);}
   catch(e){await i.editReply({content:e.message,embeds:[],components:[row(button('confirm:'+id,'Réessayer la même déclaration',ButtonStyle.Primary))]});}finally{this.busy.delete(id);}
  }catch(e){const p={content:e instanceof UserError||e.name==='ApiError'?e.message:'Déclaration des chasses indisponible. Réessaie.',embeds:[],components:[],allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:MessageFlags.Ephemeral});}
 }
}
