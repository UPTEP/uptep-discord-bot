import {SlashCommandBuilder,MessageFlags,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {fmt,escape as esc} from './domain.js';
export const deliveryCommand=new SlashCommandBuilder().setName('livraisons').setDescription('Demandes validées classées par distance depuis ton joueur').addIntegerOption(o=>o.setName('vitesse').setDescription('Ton niveau de Vitesse d’attaque (0 si aucun)').setRequired(true).setMinValue(0).setMaxValue(999)).toJSON();
export function deliveryDuration(s){if(s===null)return 'indisponible';return (s>=86400?Math.floor(s/86400)+'j ':'')+[Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function deliveryPayload(data,owner){
 const embed=new EmbedBuilder().setTitle('Joueurs à livrer').setColor(0x3488ad).setDescription(`Depuis **${esc(data.joueur)}** · Vitesse d’attaque **${data.vitesse}**\nTrajet aller estimé, calculé avec les coordonnées du dernier relevé.`);
 for(const r of data.lignes)embed.addFields({name:`#${r.id} · ${r.pseudo_demandeur}`.slice(0,256),value:`🍎 ${fmt(r.nbpomme_restant)} · 🪵 ${fmt(r.nbmateriaux_restant)} restantes${r.auto_production?' · 🏭 Auto production':''}\n${r.distance===null?'Coordonnées indisponibles':`Distance : **${Math.ceil(r.distance)}** · Trajet : **${deliveryDuration(r.seconds)}**`}`});
 if(!data.lignes.length)embed.addFields({name:'Aucune livraison',value:'Aucune demande validée en cours à livrer à un autre joueur.'});
 embed.setFooter({text:`Page ${data.page}/${data.pages} · ${data.total} demande(s) · Distance affichée arrondie au supérieur`});
 const buttons=[];for(const [page,label] of [[data.page-1,'Précédent'],[data.page+1,'Suivant']])if(page>=1&&page<=data.pages)buttons.push(new ButtonBuilder().setCustomId(`uptep:delivery:${owner}:${data.vitesse}:${page}`).setLabel(label).setStyle(ButtonStyle.Secondary));
 return {embeds:[embed],components:buttons.length?[new ActionRowBuilder().addComponents(buttons)]:[],allowedMentions:{parse:[]}};
}
export class Deliveries{
 constructor({api,guildId}){Object.assign(this,{api,guildId});}
 async handle(i){
  if(i.guildId!==this.guildId)return i.reply({content:'Commande disponible uniquement sur le serveur UPTEP.',flags:MessageFlags.Ephemeral});
  const slash=i.isChatInputCommand();let speed,page=1;
  if(slash)speed=i.options.getInteger('vitesse',true);
  else{const m=/^uptep:delivery:([0-9]+):([0-9]{1,3}):([0-9]{1,6})$/.exec(i.customId);if(!m||m[1]!==i.user.id)return i.reply({content:'Cette liste appartient à un autre utilisateur.',flags:MessageFlags.Ephemeral});speed=Number(m[2]);page=Number(m[3]);}
  if(!Number.isInteger(speed)||speed<0||speed>999)return i.reply({content:'Niveau de vitesse invalide.',flags:MessageFlags.Ephemeral});
  if(slash)await i.deferReply({flags:MessageFlags.Ephemeral});else await i.deferUpdate();
  try{const data=await this.api.request('/livraisons?'+new URLSearchParams({discord_id:i.user.id,vitesse:String(speed),page:String(page)}));await i.editReply({content:'',...deliveryPayload(data,i.user.id)});}
  catch(e){await i.editReply({content:e.message||'Livraisons indisponibles.',embeds:[],components:[],allowedMentions:{parse:[]}});}
 }
}
