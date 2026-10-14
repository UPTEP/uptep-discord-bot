import {MessageFlags,SlashCommandBuilder} from 'discord.js';
import {TERRAIN_USER} from './terrain.js';
export const loginCommand=new SlashCommandBuilder().setName('connexion').setDescription('Connexion privée à UPTEP (test réservé à NoobEnCDI)').toJSON();
export class SiteLogin {
 constructor({api,guildId}){Object.assign(this,{api,guildId});this.busy=false;}
 async handle(i){
  if(i.user.id!==TERRAIN_USER||i.guildId!==this.guildId)return i.reply({content:'Commande de test réservée à NoobEnCDI sur le serveur UPTEP.',flags:MessageFlags.Ephemeral});
  if(this.busy)return i.reply({content:'Création du lien en cours. Patiente un instant.',flags:MessageFlags.Ephemeral});
  this.busy=true;
  try{
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const result=await this.api.request('/connexion',{body:{discord_id:i.user.id,guild_id:i.guildId}});
   if(typeof result.url!=='string'||!/^https:\/\/uptep\.top\/discord-login\.php#[a-f0-9]{64}$/.test(result.url))throw new Error('Invalid login URL');
   await i.editReply({content:`[Ouvrir ma session UPTEP](<${result.url}>)\nLien personnel valable **2 minutes**, utilisable **une seule fois**. Confirme ton compte sur le site. Ne partage pas ce lien.`,flags:MessageFlags.SuppressEmbeds,allowedMentions:{parse:[]}});
   const timer=setTimeout(()=>i.deleteReply().catch(()=>{}),120000);timer.unref();
  }catch{
   // Never echo an API response/error containing a login token.
   if(i.deferred)await i.editReply({content:'Connexion indisponible : vérifie que ton compte UPTEP est actif et associé à ton ID Discord. Si tu as demandé plusieurs liens, patiente avant de réessayer.',allowedMentions:{parse:[]}});
  }finally{this.busy=false;}
 }
}
