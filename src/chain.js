import {SlashCommandBuilder,EmbedBuilder,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {escape as esc,short} from './domain.js';
export const chainCommand=new SlashCommandBuilder().setName('chaine').setDescription('Publier la chaîne de l’alliance avec les liens pour flooder').toJSON();
export function chainPayloads(members){
 const chunks=[];let rows=[];
 for(const m of members){
  if(!/^[1-9][0-9]{0,18}$/.test(m.player_id))throw Error('Identifiant joueur invalide.');
  rows.push({grade:esc(m.chaine_grade??'Sans grade')+(m.sort_order==null?'':' · '+m.sort_order),player:`**${esc(short(m.pseudo,32))}**`,link:`[⚔️ Flooder](https://s5.fourmizzz.fr/ennemie.php?Attaquer=${m.player_id}&lieu=1)`});
  if(rows.length===8){chunks.push(rows);rows=[];}
 }
 if(rows.length||!chunks.length)chunks.push(rows);
 return chunks.map((rows,index)=>{
  const embed=new EmbedBuilder().setColor(0xd4a347).setTitle('🚌 UPTEP · La chaîne');
  if(rows.length)embed.addFields({name:'Grade',value:rows.map(r=>r.grade).join('\n'),inline:true},{name:'Joueur',value:rows.map(r=>r.player).join('\n'),inline:true},{name:'Flooder',value:rows.map(r=>r.link).join('\n'),inline:true});
  else embed.setDescription('Aucun membre présent dans le dernier relevé de l’alliance.');
  embed.setFooter({text:`${members.length} membres · Page ${index+1}/${chunks.length} · Ordre de chaîne`});
  return {embeds:[embed],allowedMentions:{parse:[]}};
 });
}
export class Chain {
 constructor({api,guildId}){Object.assign(this,{api,guildId});}
 async handle(i){
  if(i.guildId!==this.guildId)return i.reply({content:'Commande disponible uniquement sur le serveur UPTEP.',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const c=i.channel;
   if(!c?.send||!c.permissionsFor(i.client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.EmbedLinks,c.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages]))throw Error('Le bot doit pouvoir écrire et intégrer des liens dans ce salon.');
   const data=await this.api.request('/chaine?'+new URLSearchParams({discord_id:i.user.id}));
   const payloads=chainPayloads(data.membres);
   for(const payload of payloads)await c.send(payload);
   await i.deleteReply();
  }catch(e){await i.editReply({content:e.message||'Publication de la chaîne indisponible.',allowedMentions:{parse:[]}});}
 }
}
