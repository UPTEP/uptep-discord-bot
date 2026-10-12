import {SlashCommandBuilder,EmbedBuilder,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {escape as esc,short} from './domain.js';
export const chainCommand=new SlashCommandBuilder().setName('chaine').setDescription('Publier la chaîne de l’alliance avec les liens pour flooder').toJSON();
export function chainPayloads(members){
 const chunks=[];let description='',previous=null;
 const labels={Grenier:'🌾 Greniers',Passeur:'🔵 Passeurs',Chasseur:'🏹 Chasseurs','A flooder':'⚔️ À flooder','Ne pas toucher':'🛡️ Ne pas toucher','Hors chaîne':'▫️ Hors chaîne'};
 for(const m of members){
  if(!/^[1-9][0-9]{0,18}$/.test(m.player_id))throw Error('Identifiant joueur invalide.');
  const key=JSON.stringify([m.chaine_grade,m.sort_order]);
  const heading=`**${labels[m.chaine_grade]??'▫️ Sans grade'}${m.sort_order==null?'':' · '+m.sort_order}**`;
  const line=`**${esc(short(m.pseudo,100))}**　[⚔️ Flooder](https://s5.fourmizzz.fr/ennemie.php?Attaquer=${m.player_id}&lieu=1)`;
  let addition=(key!==previous?(description?'\n\n':'')+heading+'\n':'\n')+line;
  if(description.length+addition.length>3500){chunks.push(description);description='';addition=heading+'\n'+line;}
  description+=addition;previous=key;
 }
 if(description)chunks.push(description);if(!chunks.length)chunks.push('Aucun membre présent dans le dernier relevé de l’alliance.');
 return chunks.map((description,index)=>({embeds:[new EmbedBuilder().setColor(0xd4a347).setTitle('🚌 UPTEP · La chaîne').setDescription(description).setFooter({text:`${members.length} membres${chunks.length>1?' · Page '+(index+1)+'/'+chunks.length:''} · Ordre de chaîne`})],allowedMentions:{parse:[]}}));
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
