import {SlashCommandBuilder,MessageFlags} from 'discord.js';
import {reportAdmins} from './reports.js';
import {UserError,escape as esc} from './domain.js';

export const suspendCommand=new SlashCommandBuilder().setName('suspendre-demande')
 .setDescription('Remettre une demande validée en attente (admins uniquement)')
 .addStringOption(o=>o.setName('demande').setDescription('Numéro de la demande à suspendre').setRequired(true).setMaxLength(20)).toJSON();

export class SuspendDemand {
 constructor({api,snapshot,refresh,admins=reportAdmins}){Object.assign(this,{api,snapshot,refresh,admins});}
 async handle(i){
  try{
   await i.deferReply({flags:MessageFlags.Ephemeral});
   if(!this.admins().includes(i.user.id))throw new UserError('La suspension est réservée aux administrateurs listés dans ADMIN_DISCORD_IDS.');
   const match=/^#?([1-9][0-9]{0,18})$/.exec(i.options.getString('demande',true).trim());
   if(!match||BigInt(match[1])>9223372036854775807n)throw new UserError('Indique un numéro de demande valide, par exemple 123.');
   const result=await this.api.request('/demandes/'+match[1]+'/suspension',{body:{commande_id:'suspension:'+i.id,discord_id:i.user.id}});
   this.snapshot.invalidate();
   await i.editReply({content:`✅ Demande #${result.demande.id} de **${esc(result.demande.pseudo_demandeur)}** suspendue : elle est de nouveau en attente de validation. Les quantités restantes et les convois déclarés sont conservés.`,allowedMentions:{parse:[]}});
   await this.refresh().catch(()=>console.error('Suspension enregistrée ; actualisation du tableau différée.'));
  }catch(e){
   if(!(e instanceof UserError))console.error('Suspension impossible :',e.name);
   const payload={content:e instanceof UserError?e.message:'Impossible de confirmer la suspension. Consulte la demande avant de réessayer.',allowedMentions:{parse:[]}};
   if(i.deferred||i.replied)await i.editReply(payload);else await i.reply({...payload,flags:MessageFlags.Ephemeral});
  }
 }
}
