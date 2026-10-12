import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {parseFloods} from './flood-parser.js';
import {escape as esc,short,UserError} from './domain.js';
const row=(...buttons)=>new ActionRowBuilder().addComponents(buttons);
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId('uptep:flood:'+id).setLabel(label).setStyle(style);
export function floodBoard(){return {embeds:[new EmbedBuilder().setColor(0xb96835).setTitle('⚔️ UPTEP · Suivi des floods').setDescription('Colle tes attaques en cours, vérifie le résultat puis confirme pour les enregistrer.\nLes destinataires associés sont avertis par MP. Les floods arrivés restent archivés et disparaissent des listes en cours.').setFooter({text:'UPTEP_FLOODS_V1'})],components:[row(button('declare','Déclarer des floods',ButtonStyle.Success),button('all','Tous les floods en cours',ButtonStyle.Primary),button('self','Floods vers moi',ButtonStyle.Primary))],allowedMentions:{parse:[]}};}
function floodLine(f){const ts=Math.floor(Date.parse(f.arrival_at)/1000);return `${f.sender_pseudo?'**'+esc(f.sender_pseudo)+'** → ':''}**${esc(f.pseudo)}** · ${esc(f.location)}\nArrivée : <t:${ts}:F> (<t:${ts}:R>)${f.troops?'\nTroupes : '+esc(short(f.troops,250)):'\nTroupes : non renseignées'}${f.warning?'\n⚠️ '+esc(f.warning):''}`;}
export function floodReplyCleanup(i,schedule=setTimeout){
 const originals={};let timer;
 for(const method of ['reply','editReply']){
  if(typeof i[method]!=='function')continue;
  originals[method]=i[method];
  i[method]=async payload=>{
   const result=await originals[method].call(i,payload);
   const content=typeof payload==='string'?payload:payload?.content??'';
   const finished=content.startsWith('✅')||content==='Déclaration abandonnée.'||content==='Ces floods ont déjà été enregistrés.';
   const advanced=finished||!!payload?.embeds?.length;
   if(advanced&&i.message?.flags?.has(MessageFlags.Ephemeral)&&i.message.author?.id===i.client?.user?.id&&i.client?.user?.id){
    await i.webhook.deleteMessage(i.message.id).catch(()=>{});
   }
   clearTimeout(timer);
   timer=schedule(()=>{if(i.deleteReply)i.deleteReply().catch(()=>{});},finished?3000:300000);timer?.unref?.();
   return result;
  };
 }
 return ()=>{for(const [method,original] of Object.entries(originals))i[method]=original;};
}
export class Floods{
 constructor({api,state,client,guildId,channelId}){Object.assign(this,{api,state,client,guildId,channelId});this.busy=new Set();this.flushing=null;this.mounting=false;}
 async mount(){
  if(!this.channelId||this.mounting)return;this.mounting=true;
  try{const c=await this.client.channels.fetch(this.channelId);if(c.guildId!==this.guildId||!c.isTextBased()||c.isDMBased())throw Error('Salon floods invalide');
   const key='floods:'+this.guildId+':'+this.channelId;const saved=this.state.board(key);let message=saved?await c.messages.fetch(saved).catch(e=>{if(e.code===10008)return null;throw e;}):null;
   if(!message){const recent=await c.messages.fetch({limit:100});message=recent.find(m=>m.author.id===this.client.user.id&&m.embeds.some(e=>e.footer?.text==='UPTEP_FLOODS_V1'));}
   if(message&&message.author.id!==this.client.user.id)throw Error('Tableau floods invalide');
   if(!message)message=await c.send(floodBoard());else if(!this.mounted)await message.edit(floodBoard());
   this.state.setBoard(key,message.id);this.mounted=true;
  }finally{this.mounting=false;}
 }
 preview(sid,s,page=0){const items=s.data.floods,pages=Math.ceil(items.length/5);page=Math.max(0,Math.min(pages-1,page));const e=new EmbedBuilder().setTitle('Confirmer les floods').setColor(0xb96835).setDescription('Rien n’est enregistré avant confirmation. Les arrivées sont figées au moment du collage.').setFooter({text:`${items.length} floods · Page ${page+1}/${pages}`});items.slice(page*5,page*5+5).forEach((f,i)=>e.addFields({name:'Flood '+(page*5+i+1),value:floodLine(f)}));if(s.data.warnings.length)e.addFields({name:'⚠️ Vérifications',value:short(s.data.warnings.join('\n'),950)});
 const buttons=[];if(page>0)buttons.push(button(`preview:${sid}:${page-1}`,'Précédent'));if(page+1<pages)buttons.push(button(`preview:${sid}:${page+1}`,'Suivant'));buttons.push(button('confirm:'+sid,`Confirmer les ${items.length} floods`,ButtonStyle.Success),button('cancel:'+sid,'Abandonner',ButtonStyle.Danger));return {embeds:[e],components:[row(...buttons)],allowedMentions:{parse:[]}};}
 async list(i,scope,page){const data=await this.api.request('/floods?'+new URLSearchParams({discord_id:i.user.id,scope,page:String(page)}));const e=new EmbedBuilder().setTitle(scope==='self'?'Floods vers moi':'Tous les floods en cours').setColor(0xb96835).setFooter({text:`${data.total} floods · Page ${data.page}/${data.pages}`});if(!data.floods.length)e.setDescription('Aucun flood en cours.');data.floods.forEach(f=>e.addFields({name:'#'+f.id,value:floodLine(f)}));const buttons=[];if(data.page>1)buttons.push(button(`list:${i.user.id}:${scope}:${data.page-1}`,'Précédent'));if(data.page<data.pages)buttons.push(button(`list:${i.user.id}:${scope}:${data.page+1}`,'Suivant'));await i.editReply({embeds:[e],components:buttons.length?[row(...buttons)]:[],allowedMentions:{parse:[]}});}
 async handle(i){const restore=floodReplyCleanup(i);try{return await this.process(i);}finally{restore();}}
 async process(i){
  if(i.guildId!==this.guildId||i.channelId!==this.channelId)return i.reply({content:'Ces boutons sont réservés au salon des floods.',flags:MessageFlags.Ephemeral});
  const [,,action,id,arg,last]=i.customId.split(':');
  try{
   if(action==='declare')return await i.showModal(new ModalBuilder().setCustomId('uptep:flood:form').setTitle('Déclarer des floods').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report').setLabel('Colle tes attaques en cours (20 maximum)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000))));
   const captured=new Date();await i.deferReply({flags:MessageFlags.Ephemeral});
   if(action==='form'){const parsed=parseFloods(i.fields.getTextInputValue('report'),captured);const resolved=await this.api.request('/floods/preview',{body:{discord_id:i.user.id,...parsed}});const sid=this.state.create(i.user.id,'flood',{...parsed,floods:resolved.floods},3600000);return await i.editReply(this.preview(sid,this.state.get(sid,i.user.id)));}
   if(action==='all'||action==='self')return await this.list(i,action,1);
   if(action==='list'){if(id!==i.user.id)throw new UserError('Cette liste appartient à un autre joueur.');return await this.list(i,arg,Number(last));}
   const s=this.state.get(id,i.user.id);if(s.type!=='flood')throw new UserError('Formulaire invalide.');
   if(s.data.cancelled)throw new UserError('Déclaration abandonnée.');if(s.data.done)return await i.editReply('Ces floods ont déjà été enregistrés.');
   if(action==='preview')return await i.editReply(this.preview(id,s,Number(arg)));
   if(action==='cancel'){if(this.busy.has(id))throw new UserError('Enregistrement en cours.');this.state.set(id,{...s.data,cancelled:true});return await i.editReply('Déclaration abandonnée.');}
   if(action!=='confirm')throw new UserError('Action inconnue.');if(this.busy.has(id))throw new UserError('Enregistrement en cours.');this.busy.add(id);
   try{const result=await this.api.request('/floods',{body:{discord_id:i.user.id,commande_id:'discord-flood:'+id,captured_at:s.data.captured_at,floods:s.data.floods}});this.enqueue(result.floods);this.state.set(id,{...s.data,done:true});await i.editReply(`✅ ${result.floods.length} floods enregistrés. Les destinataires associés seront avertis par MP si leurs paramètres le permettent.`);this.flush().catch(()=>console.error('MP floods différés.'));}
   catch(e){await i.editReply({content:e.message,components:[row(button('confirm:'+id,'Réessayer la même déclaration',ButtonStyle.Primary))]});}finally{this.busy.delete(id);}
  }catch(e){const p={content:e instanceof UserError||e.name==='ApiError'?e.message:'Suivi des floods indisponible. Réessaie.',allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:MessageFlags.Ephemeral});}
 }
 enqueue(floods){this.state.data.floodNotifications??={};for(const f of floods)if(f.target_discord&&!this.state.data.floodNotifications[f.id])this.state.data.floodNotifications[f.id]={flood:f,done:false};this.state.save();}
 flush(){if(this.flushing)return this.flushing;this.flushing=this.sendPending().finally(()=>{this.flushing=null;});return this.flushing;}
 async sendPending(){for(const [id,entry] of Object.entries(this.state.data.floodNotifications??{})){if(entry.done)continue;try{const f=entry.flood;const user=await this.client.users.fetch(f.target_discord);await user.send({embeds:[new EmbedBuilder().setTitle('⚔️ Un flood déclaré vers toi').setColor(0xb96835).setDescription(floodLine(f)).setFooter({text:`Flood #${id} · Déclaration UPTEP, pas une confirmation de combat`})],allowedMentions:{parse:[]},nonce:'flood-'+id,enforceNonce:true});entry.done=true;this.state.save();}catch(e){if([50007,50013,10013].includes(Number(e.code))){entry.done=true;this.state.save();}else console.error('MP flood différé :',e.name);}}}
}
