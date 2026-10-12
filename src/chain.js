import {SlashCommandBuilder,EmbedBuilder,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {escape as esc,short} from './domain.js';
export const chainCommand=new SlashCommandBuilder().setName('chaine').setDescription('Publier la chaîne de l’alliance avec les liens pour flooder').toJSON();
export function chainPayloads(members){
 const chunks=[];let lines=[];
 const nameWidth=Math.max(0,...members.map(m=>[...short(m.pseudo,32)].length));
 for(const m of members){
  if(!/^[1-9][0-9]{0,18}$/.test(m.player_id))throw Error('Identifiant joueur invalide.');
  const grade=esc(m.chaine_grade??'Sans grade')+(m.sort_order==null?'':' '+m.sort_order);
  const pseudo=short(m.pseudo,32),separator='─'.repeat(Math.max(2,nameWidth-[...pseudo].length+2));
  const line=`**${esc(pseudo)}** ${separator} ${grade} · [Flooder](https://s5.fourmizzz.fr/ennemie.php?Attaquer=${m.player_id}&lieu=1)`;
  if(lines.join('\n').length+line.length+1>4000){chunks.push(lines.join('\n'));lines=[];}lines.push(line);
 }
 if(lines.length)chunks.push(lines.join('\n'));if(!chunks.length)chunks.push('Aucun membre présent dans le dernier relevé de l’alliance.');
 return chunks.map((description,index)=>({embeds:[new EmbedBuilder().setColor(0x2b638c).setTitle('UPTEP · Chaîne de l’alliance').setDescription(description).setFooter({text:`${members.length} membres · Ordre de chaîne${chunks.length>1?' · Suite '+(index+1)+'/'+chunks.length:''}`})],allowedMentions:{parse:[]}}));
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
