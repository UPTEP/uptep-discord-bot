import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,MessageFlags,EmbedBuilder} from 'discord.js';
import {UserError,fmt,escape as esc,short} from './domain.js';

export function reportAdmins(file='.env'){
 try{const ids=(parseEnv(fs.readFileSync(file,'utf8')).ADMIN_DISCORD_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);return ids.every(x=>/^[1-9][0-9]{0,18}$/.test(x)&&BigInt(x)<=9223372036854775807n)?ids:[];}catch{return [];}
}
const textOption=(cmd,name,description)=>cmd.addStringOption(o=>o.setName(name).setDescription(description).setMaxLength(100));
export const reportCommands=[
 ['historique-demandes','Historique des demandes de ressources (chefs uniquement)','demandes'],
 ['historique-convois','Historique des convois déclarés (chefs uniquement)','convois'],
 ['stats-convois','Envois et réceptions déclarés par joueur (chefs uniquement)','statistiques']
].map(([name,description,kind])=>{
 const c=new SlashCommandBuilder().setName(name).setDescription(description);
 if(kind!=='convois')textOption(c,'joueur','Pseudo exact en jeu (facultatif)');
 else{for(const n of ['expediteur','destinataire'])textOption(c,n,'Pseudo exact en jeu (facultatif)');textOption(c,'demande','Numéro de la demande (facultatif)');}
 if(kind==='demandes')c.addStringOption(o=>o.setName('etat').setDescription('État des demandes').addChoices(...Object.entries({toutes:'Tous les états',attente:'À valider',en_cours:'En cours',terminee:'Terminées',annulee:'Annulées'}).map(([value,name])=>({value,name}))));
 c.addStringOption(o=>o.setName('periode').setDescription('7 jours par défaut, journée en cours incluse').addChoices({name:'7 jours',value:'7j'},{name:'30 jours',value:'30j'},{name:'Dates personnalisées',value:'personnalisee'}));
 textOption(c,'debut','Début inclus, JJ-MM-AAAA (renseigner aussi fin)');textOption(c,'fin','Fin incluse, JJ-MM-AAAA (maximum 366 jours)');
 return c.toJSON();
});
reportCommands.push(new SlashCommandBuilder().setName('recap-demandes').setDescription('Récapitulatif des demandes par joueur, même sans demande (admins uniquement)').toJSON());
const kinds={'historique-demandes':'demandes','historique-convois':'convois','stats-convois':'statistiques','recap-demandes':'recap-demandes'};
const titles={demandes:'Historique des demandes',convois:'Historique des convois',statistiques:'Statistiques des convois',detail:'Détail de la demande','recap-demandes':'Récapitulatif des demandes par joueur'};
const date=value=>value?new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}):'—';
const qty=(a,b)=>`🍎 ${fmt(a)} · 🪵 ${fmt(b)}`;
const safe=value=>esc(String(value??'—'));
export const demandStatus=d=>d.annulee?'Annulée':d.fini?(d.fin_manuelle?'Terminée manuellement':'Terminée automatiquement'):d.valide?'En cours':'À valider';
function convoyLine(c,recipient=true){return `**Convoi #${c.id} · ${safe(c.pseudo_envoyeur)}${recipient?' → '+safe(c.pseudo_demandeur):''}**${c.annule?' · ❌ Annulé':''}\n${qty(c.nbpomme,c.nbmateriaux)} · demande #${c.iddemande}\nEnvoi : ${date(c.date_convoi)} · arrivée prévue : ${date(c.date_arrivee)}${c.annule?'\nAnnulé le '+date(c.date_annulation)+' par '+safe(c.pseudo_annulateur):''}`;}
const mean=value=>{const [whole,decimal='00']=String(value).split('.');return fmt(whole)+','+decimal.padEnd(2,'0');};
export function reportPayload(kind,data,sid,params={}){
 const lines=data.lignes??[];const embed=new EmbedBuilder().setColor(0x73824a).setTitle(titles[kind]);
 let heading='';
 if(kind==='recap-demandes')heading='Tout l’historique S5 · joueurs de la chaîne et anciens demandeurs, y compris sans demande.\nEffectuées : toutes, même annulées. Validées : terminées comprises, annulées exclues. Dates en heure de Paris.';
 if(data.periode)heading=`Du ${data.periode.debut} au ${data.periode.fin} · ${data.periode.jours} jours (Paris)\n`+(kind==='demandes'?'Période basée sur la date de demande.':'Période basée sur la date d’envoi déclarée.')+'\n';
 const filters=Object.entries(params).filter(([k])=>['joueur','etat','expediteur','destinataire','demande'].includes(k)).map(([k,v])=>`${k} : ${safe(v)}`);if(filters.length)heading+=filters.join(' · ')+'\n';
 const blocks=lines.map(r=>{
  if(kind==='recap-demandes')return `**${safe(r.pseudo)}**\nEffectuées : **${fmt(r.demandes_effectuees)}** · Validées : **${fmt(r.demandes_validees)}**\nTerminées : **${fmt(r.demandes_terminees)}** · Annulées : **${fmt(r.demandes_annulees)}**\nDernière demande : ${r.derniere_demande?date(r.derniere_demande):'Aucune demande'}`;
  if(kind==='demandes')return `**#${r.id} · ${safe(r.pseudo_demandeur)} · ${demandStatus(r)}**\n${safe(r.objet)}${r.niveau?' niv. '+r.niveau:''} · ${qty(r.nbpomme_original,r.nbmateriaux_original)}\nDemande : ${date(r.date_demande)} · validation : ${date(r.date_validation)}\n${r.annulee?'Annulation : '+date(r.date_annulation):'Fin : '+date(r.date_fin)}`;
  if(kind==='statistiques')return `**${safe(r.pseudo)}**\nEnvoyé : ${qty(r.pommes_envoyees,r.materiaux_envoyes)} (${fmt(r.envois)} convois)\nReçu : ${qty(r.pommes_recues,r.materiaux_recus)} (${fmt(r.receptions)} convois)\nMoy./jour envoyé : 🍎 ${mean(r.moyenne_pommes_envoyees)} · 🪵 ${mean(r.moyenne_materiaux_envoyes)}\nMoy./jour reçu : 🍎 ${mean(r.moyenne_pommes_recues)} · 🪵 ${mean(r.moyenne_materiaux_recus)}`;
  return convoyLine(r,kind!=='detail');
 });
 if(kind==='detail'){
  const d=data.demande;embed.setTitle(`Demande #${d.id} · ${short(d.pseudo_demandeur,100)}`);
  heading=`**${demandStatus(d)} · ${safe(d.objet)}${d.niveau?' niv. '+d.niveau:''}**\nDemandé : ${qty(d.nbpomme_original,d.nbmateriaux_original)}\nRestant : ${qty(d.nbpomme_restant,d.nbmateriaux_restant)}\nCréation : ${date(d.date_demande)}\nValidation : ${date(d.date_validation)} · ${safe(d.pseudo_validateur)}\nClôture : ${date(d.date_fin)}${d.fin_manuelle?' · '+safe(d.pseudo_cloture):''}\n${d.annulee?'Annulation : '+date(d.date_annulation)+' · '+safe(d.pseudo_annulateur)+'\n':''}Date souhaitée : ${d.date_souhaitee?d.date_souhaitee.split('-').reverse().join('-'):'—'}${(d.ajustements||[]).length?'\n\n**Derniers ajustements du restant**\n'+d.ajustements.slice(0,3).map(a=>`${date(a.date_ajustement)} · ${safe(a.pseudo_acteur)} : 🍎 ${fmt(a.pommes_avant)} → ${fmt(a.pommes_apres)} · 🪵 ${fmt(a.materiaux_avant)} → ${fmt(a.materiaux_apres)}`).join('\n'):''}\n\n**Convois associés (toutes dates)**\n`;
 }
 // Eight rows can be large (long pseudos/objects). Fields preserve Discord's 4096 description limit.
 embed.setDescription(heading||'Toutes les dates sont affichées en heure de Paris.');
 if(!blocks.length)embed.addFields({name:'Résultat',value:'Aucun résultat pour ces filtres.'});
 blocks.forEach((block,n)=>embed.addFields({name:`${(data.page-1)*8+n+1}.`,value:block.slice(0,1024)}));
 // Discord limits the entire embed to 6000 characters; cap user labels before rendering if needed.
 const budget=Math.floor((5500-heading.length)/(blocks.length||1));
 for(const f of embed.data.fields??[])f.value=short(f.value,Math.min(1024,budget));
 embed.setFooter({text:`Page ${data.page}/${data.pages} · ${data.total} résultat(s) · ${kind==='recap-demandes'?'Classement par nombre de demandes':kind==='statistiques'?'Convois annulés exclus · moyenne sur tous les jours':'Déclarations enregistrées, arrivées non confirmées'}`});
 const components=[];
 if(kind==='demandes'&&lines.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`uptep:reportDetail:${sid}`).setPlaceholder('Voir une demande et ses convois').addOptions(lines.map(d=>({label:short(`#${d.id} · ${d.pseudo_demandeur} · ${demandStatus(d)}`,100),value:String(d.id)})))));
 const buttons=[];
 if(data.page>1)buttons.push(new ButtonBuilder().setCustomId(`uptep:reportPage:${sid}:${data.page-1}`).setLabel('Précédent').setStyle(ButtonStyle.Secondary));
 if(data.page<data.pages)buttons.push(new ButtonBuilder().setCustomId(`uptep:reportPage:${sid}:${data.page+1}`).setLabel('Suivant').setStyle(ButtonStyle.Secondary));
 if(params.parent)buttons.push(new ButtonBuilder().setCustomId(`uptep:reportBack:${params.parent}`).setLabel('Retour aux demandes').setStyle(ButtonStyle.Secondary));
 if(buttons.length)components.push(new ActionRowBuilder().addComponents(buttons));
 return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
export class Reports {
 constructor({api,state,admins=reportAdmins}){Object.assign(this,{api,state,admins});}
 async handle(i){
  try{
   await i.deferReply({flags:MessageFlags.Ephemeral});
   if(!this.admins().includes(i.user.id))throw new UserError('Ces commandes sont réservées aux chefs listés dans ADMIN_DISCORD_IDS.');
   let sid,session,page=1;
   if(i.isChatInputCommand()){
    const kind=kinds[i.commandName];if(!kind)throw new UserError('Commande inconnue.');
    const params={};for(const key of kind==='recap-demandes'?[]:['joueur','etat','periode','debut','fin','expediteur','destinataire','demande']){const v=i.options.getString(key);if(v!==null)params[key]=v;}
    sid=this.state.create(i.user.id,'report',{kind,params,page},15*60*1000);session=this.state.get(sid,i.user.id);
   }else{
    const [,action,id,arg]=i.customId.split(':');sid=id;session=this.state.get(sid,i.user.id);
    if(session.type!=='report')throw new UserError('Historique invalide.');
    page=session.data.page??1;
    if(action==='reportPage'){if(!/^[1-9]\d{0,4}$/.test(arg??''))throw new UserError('Page invalide.');page=Number(arg);}
    else if(action==='reportDetail'){
     const demand=i.values[0];if(!session.data.ids?.includes(demand))throw new UserError('Demande invalide.');
     sid=this.state.create(i.user.id,'report',{kind:'detail',params:{demande:demand,parent:id},page:1},15*60*1000);session=this.state.get(sid,i.user.id);page=1;
    }else if(action!=='reportBack')throw new UserError('Action inconnue.');
   }
   const {kind,params}=session.data;
   const query={...params,discord_id:i.user.id,page:String(page)};delete query.parent;
   let route=kind;
   if(kind==='detail'){route='demandes/'+params.demande;delete query.demande;}
   const data=await this.api.request('/rapports/'+route+'?'+new URLSearchParams(query));
   const frozenParams=data.periode?{...params,periode:'personnalisee',debut:data.periode.debut,fin:data.periode.fin}:params;
   this.state.set(sid,{...session.data,params:frozenParams,page,ids:kind==='demandes'?data.lignes.map(d=>String(d.id)):[]});
   await i.editReply(reportPayload(kind,data,sid,params));
  }catch(e){if(!(e instanceof UserError))console.error('Rapport Discord impossible :',e.name);const payload={content:e instanceof UserError?e.message:'Impossible de charger ce rapport. Réessaie dans quelques instants.',embeds:[],components:[]};if(i.deferred||i.replied)await i.editReply(payload);else await i.reply({...payload,flags:MessageFlags.Ephemeral});}
 }
}
