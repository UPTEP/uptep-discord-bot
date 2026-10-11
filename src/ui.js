import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder,MessageFlags,EmbedBuilder} from 'discord.js';
import {UserError,quantity,amounts,dueDate,arrival,level,cleanText,fmt,escape,short,convoyReport,progress,frenchDate} from './domain.js';
const row=(...components)=>new ActionRowBuilder().addComponents(components);
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId('uptep:'+id).setLabel(label).setStyle(style);
const field=(id,label,required=true,placeholder='')=>row(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(160).setPlaceholder(placeholder));
export const actions=()=>[row(button('request','Demander des ressources',ButtonStyle.Success),button('deliver','Déclarer un convoi',ButtonStyle.Success),button('browse','Consulter',ButtonStyle.Primary)),row(button('validate','Valider une demande (droit admin requis)',ButtonStyle.Primary),button('cancel','Annuler / Terminer une demande',ButtonStyle.Danger),button('cancelConvoy','Annuler un convoi déclaré',ButtonStyle.Danger)),row(button('adjust','Modifier une demande',ButtonStyle.Primary))];
export function boardPayload(demands){
 const open=demands.filter(d=>!d.fini);const done=demands.filter(d=>d.fini);
 const lines=open.slice(0,15).map(d=>`${d.valide?'🟢':'🟠'} **#${d.id} · ${escape(short(d.pseudo_demandeur,30))}** — ${escape(short(d.objet||'Ressources',40))}${d.niveau?' niv. '+d.niveau:''}\n🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}${d.valide&&!d.fini&&!d.annulee&&/^[1-9]\d*$/.test(String(d.iddemandeur))?' · [Livrer sur Fourmizzz](https://s5.fourmizzz.fr/commerce.php?ID='+d.iddemandeur+')':''}${d.date_souhaitee?' · souhaité le '+frenchDate(d.date_souhaitee):''}${d.valide?'\n'+progress(d):''}`);
 while(lines.join('\n\n').length>3700)lines.pop();
 return {embeds:[new EmbedBuilder().setColor(0x657645).setTitle('UPTEP · Gestion des convois').setDescription((lines.join('\n\n')||'Aucune demande en attente ou en cours.')+`\n\n🟠 À valider · 🟢 En cours\n${open.length} demande(s) ouverte(s) · ${done.length} terminée(s) sur 7 jours.`).setFooter({text:'UPTEP_CONVOYS_V1 · Actualisation automatique'}).setTimestamp()],components:actions(),allowedMentions:{parse:[]}};
}
export class UI {
 constructor({api,snapshot,state,refresh}){Object.assign(this,{api,snapshot,state,refresh});this.busy=new Set();}
 async handle(i){
  const [,action,id,arg]=i.customId.split(':');
  try{
   if(action==='request'){
    const sid=this.state.create(i.user.id,'request');
    return await i.showModal(new ModalBuilder().setCustomId('uptep:requestForm:'+sid).setTitle('Demander des ressources').addComponents(field('objet','Bâtiment ou recherche'),field('niveau','Niveau visé',true,'Exemple : 20'),field('food','Pommes',false,'Exemple : 100k'),field('wood','Matériaux',false,'Exemple : 1,5m'),field('date','Date souhaitée (facultatif)',false,'JJ-MM-AAAA')));
   }
   if(action==='edit'){
    const job=this.state.get(id,i.user.id);if(job.type!=='job'||!job.data.path.endsWith('/convois')||job.data.result||job.data.attempted||job.data.superseded)throw new UserError('Ce formulaire ne peut plus être modifié.');
    const d=job.data;this.state.set(id,{...d,superseded:true});const sid=this.state.create(i.user.id,'deliver',{demand:d.demand});
    const filled=(key,label,value)=>{const f=field(key,label,false);if(value)f.components[0].setValue(value);return f;};
    return await i.showModal(new ModalBuilder().setCustomId('uptep:deliverForm:'+sid).setTitle('Vérifier les données du convoi').addComponents(filled('food','Pommes envoyées',d.body.nbpomme),filled('wood','Matériaux envoyés',d.body.nbmateriaux),filled('arrival','Arrivée (ISO avec fuseau)',d.body.date_arrivee)));
   }
   if(action==='pick'){
    const s=this.state.get(id,i.user.id);const demand=s.data.rows.find(d=>d.id===i.values[0]);if(!demand)throw new UserError('Demande inconnue.');
    if(s.type==='adjust'){
     const sid=this.state.create(i.user.id,'adjust',{demand});
     const food=field('food','Pommes encore nécessaires',true),wood=field('wood','Matériaux encore nécessaires',true);
     food.components[0].setValue(String(demand.nbpomme_restant));wood.components[0].setValue(String(demand.nbmateriaux_restant));
     return await i.showModal(new ModalBuilder().setCustomId('uptep:adjustForm:'+sid).setTitle(short('Modifier une demande · #'+demand.id,45)).addComponents(food,wood));
    }
    if(s.type==='deliver'){
     const sid=this.state.create(i.user.id,'deliver',{demand});
     return await i.showModal(new ModalBuilder().setCustomId('uptep:deliverForm:'+sid).setTitle(short('Convoi #'+demand.id+' · '+demand.pseudo_demandeur,45)).addComponents(row(new TextInputBuilder().setCustomId('report').setLabel('Rapport du jeu (ou saisie manuelle dessous)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setPlaceholder('Vous allez livrer …')),field('food','Pommes envoyées',false),field('wood','Matériaux envoyés',false),field('arrival','Arrivée (facultatif)',false,'Durée : 2h 30m')));
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(s.type==='cancelConvoy'){
     const member=await this.api.member(i.user.id);if(!member.is_chaine&&member.player_id!==demand.idenvoyeur)throw new UserError('Tu peux uniquement annuler tes propres convois.');
     return await this.stage(i,'cancelConvoy',{path:'/convois/'+demand.id+'/annulation',body:{discord_id:i.user.id},summary:`Annuler la déclaration du convoi #${demand.id} de **${escape(demand.pseudo_envoyeur)}** vers **${escape(demand.pseudo_demandeur)}**, demande #${demand.iddemande} ?\n🍎 ${fmt(demand.nbpomme)} · 🪵 ${fmt(demand.nbmateriaux)}\nCes quantités seront remises dans le restant de la demande. Une demande soldée automatiquement sera rouverte ; une demande annulée ou terminée manuellement restera fermée.\nCela n’annule aucun envoi dans Fourmizzz.`});
    }
    if(s.type==='cancel'){
     const member=await this.api.member(i.user.id);this.check('cancel',demand,member);const sid=this.state.create(i.user.id,'closeDemand',{demand});
     return await i.editReply({content:`Demande #${demand.id} de **${escape(demand.pseudo_demandeur)}** : choisis l’action.\nAnnuler : abandonner la demande. Terminer : fermer une demande validée même si des ressources restent attendues, sans inventer de convoi.`,components:[row(button('closeDemand:'+sid+':cancel','Annuler la demande',ButtonStyle.Danger),button('closeDemand:'+sid+':finish','Terminer la demande',ButtonStyle.Primary).setDisabled(!demand.valide))],allowedMentions:{parse:[]}});
    }
    if(s.type==='browse')return await i.editReply(this.detail(demand));
    const member=await this.api.member(i.user.id);this.check(s.type,demand,member);
    return await this.stage(i,s.type,{path:'/demandes/'+demand.id+'/'+(s.type==='validate'?'validation':'annulation'),body:{discord_id:i.user.id},summary:`${s.type==='validate'?'Valider':'Annuler'} la demande #${demand.id} de ${escape(demand.pseudo_demandeur)} ?`});
   }
   await i.deferReply({flags:MessageFlags.Ephemeral});
   if(action==='cancelConvoy'){
    const rows=await this.api.cancelableConvoys(i.user.id);if(!rows.length)return await i.editReply('Aucun convoi déclaré que tu peux annuler.');
    const sid=this.state.create(i.user.id,'cancelConvoy',{rows});return await i.editReply(this.selection(sid,this.state.get(sid,i.user.id),0));
   }
   if(action==='closeDemand'){
    const s=this.state.get(id,i.user.id);if(s.type!=='closeDemand'||!['cancel','finish'].includes(arg))throw new UserError('Action invalide.');
    const d=s.data.demand;this.check('cancel',d,await this.api.member(i.user.id));
    return await this.stage(i,'cancel',{path:'/demandes/'+d.id+'/'+(arg==='finish'?'terminaison':'annulation'),body:{discord_id:i.user.id},summary:`${arg==='finish'?'Terminer':'Annuler'} la demande #${d.id} de **${escape(d.pseudo_demandeur)}** ?\nLes convois restent dans l’historique.${arg==='finish'?' Les quantités encore attendues sont conservées, mais la demande sera fermée.':''}`});
   }
   if(action==='adjustForm'){
    const s=this.state.get(id,i.user.id);if(s.type!=='adjust')throw new UserError('Formulaire invalide.');
    const d=s.data.demand,member=await this.api.member(i.user.id);this.check('adjust',d,member);
    const food=quantity(i.fields.getTextInputValue('food')),wood=quantity(i.fields.getTextInputValue('wood'));
    const body={discord_id:i.user.id,nbpomme_restant:food,nbmateriaux_restant:wood,nbpomme_attendu:d.nbpomme_restant,nbmateriaux_attendu:d.nbmateriaux_restant};
    return await this.stage(i,'adjust',{path:'/demandes/'+d.id+'/ajustement',body,summary:`Ajuster le restant de la demande #${d.id} de **${escape(d.pseudo_demandeur)}**
🍎 ${fmt(d.nbpomme_restant)} → **${fmt(food)}**
🪵 ${fmt(d.nbmateriaux_restant)} → **${fmt(wood)}**
Saisis le nouveau total encore nécessaire, pas la quantité produite. Les convois et les statistiques d’envoi restent inchangés.${food==='0'&&wood==='0'?'\nLa demande sera terminée manuellement.':''}`});
   }
   if(action==='requestForm'||action==='deliverForm'){
    const s=this.state.get(id,i.user.id);if(s.type!==(action==='requestForm'?'request':'deliver'))throw new UserError('Formulaire invalide.');
    await this.api.member(i.user.id);
    const get=k=>i.fields.getTextInputValue(k);const report=action==='deliverForm'&&i.fields.fields?.has('report')?get('report').trim():'';const parsed=report?convoyReport(report,s.data.demand.pseudo_demandeur):null;if(parsed&&(get('food').trim()||get('wood').trim()||get('arrival').trim()))throw new UserError('Colle uniquement le rapport ou remplis les champs manuels, pour éviter des quantités contradictoires.');const quantities=parsed?{nbpomme:parsed.nbpomme,nbmateriaux:parsed.nbmateriaux}:amounts(get('food'),get('wood'));let body={discord_id:i.user.id,...quantities},path,summary;
    if(action==='requestForm'){
     body={...body,objet:cleanText(get('objet')),niveau:level(get('niveau').trim()),date_souhaitee:dueDate(get('date'))};path='/demandes';summary=`Demander **${escape(body.objet)} niveau ${body.niveau}**`;
    }else{body.date_arrivee=parsed?parsed.date_arrivee:arrival(get('arrival'));body.date_convoi=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');path='/demandes/'+s.data.demand.id+'/convois';summary=`Déclarer un convoi pour **${escape(s.data.demand.pseudo_demandeur)}**, demande #${s.data.demand.id}`;}
    summary+=`\n🍎 ${fmt(body.nbpomme)} · 🪵 ${fmt(body.nbmateriaux)}`;
    if(body.date_souhaitee)summary+='\nDate souhaitée : '+frenchDate(body.date_souhaitee);
    if(body.date_arrivee)summary+='\nArrivée : <t:'+Math.floor(new Date(body.date_arrivee).getTime()/1000)+':f>';
    return await this.stage(i,s.type,{path,body,summary,...(action==='deliverForm'?{demand:s.data.demand}:{})});
   }
   if(action==='apply'){
    const s=this.state.get(id,i.user.id);if(s.type!=='job')throw new UserError('Confirmation invalide.');
    if(s.data.superseded)throw new UserError('Cette confirmation a été remplacée par le formulaire de modification.');
    if(s.data.result)return await i.editReply({content:s.data.result,components:[]});
    if(this.busy.has(id))throw new UserError('Cette opération est déjà en cours.');this.busy.add(id);this.state.set(id,{...s.data,attempted:true});
    try{
     const result=await this.api.request(s.data.path,{body:s.data.body});const content=`✅ Opération enregistrée sur UPTEP · demande #${result.demande.id}.`;
     this.state.set(id,{...s.data,result:content});await i.editReply({content,components:[]});
     this.snapshot.invalidate();this.refresh().catch(()=>console.error('Actualisation du tableau différée.'));
    }catch(e){await i.editReply({content:this.error(e),components:[row(button('apply:'+id,'Réessayer la même opération',ButtonStyle.Primary))]});}
    finally{this.busy.delete(id);}return;
   }
   if(action==='page'){const s=this.state.get(id,i.user.id);return await i.editReply(this.selection(id,s,Number(arg)));}
   if(['deliver','validate','cancel','browse','adjust'].includes(action)){
    const member=await this.api.member(i.user.id);const all=await this.snapshot.get();
    const rows=all.filter(d=>action==='browse'||(!d.fini&&!d.annulee&&(action==='deliver'?d.valide&&d.iddemandeur!==member.player_id:action==='validate'?!d.valide&&member.is_chaine:action==='adjust'?d.valide&&(member.is_chaine||d.iddemandeur===member.player_id):member.is_chaine||d.iddemandeur===member.player_id)));
    if(action==='validate'&&!member.is_chaine)throw new UserError('Il faut être administrateur du bot ou avoir le droit chaîne sur UPTEP pour valider les demandes.');
    if(!rows.length)return await i.editReply('Aucune demande disponible pour cette action.');
    const sid=this.state.create(i.user.id,action,{rows});return await i.editReply(this.selection(sid,this.state.get(sid,i.user.id),0));
   }
   throw new UserError('Action inconnue.');
  }catch(e){const payload={content:this.error(e),components:[],allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(payload);else await i.reply({...payload,flags:MessageFlags.Ephemeral});}
 }
 error(e){if(e instanceof UserError)return e.message;console.error('Erreur interaction :',e.name);return 'Une erreur est survenue. Réessaie depuis le tableau.';}
 check(type,d,m){if(type==='adjust'&&!m.is_chaine&&m.player_id!==d.iddemandeur)throw new UserError('Tu peux uniquement ajuster tes propres demandes.');if(type==='validate'&&!m.is_chaine)throw new UserError('Un droit administrateur du bot ou le droit chaîne est nécessaire.');if(type==='cancel'&&!m.is_chaine&&m.player_id!==d.iddemandeur)throw new UserError('Tu peux uniquement annuler tes demandes.');}
 async stage(i,type,data){const sid=this.state.create(i.user.id,'job',{});data.body.commande_id='discord:'+sid;this.state.set(sid,data);return i.editReply({content:data.summary+'\n\nConfirme pour enregistrer cette action.',components:[row(button('apply:'+sid,'Confirmer',['cancel','cancelConvoy'].includes(type)?ButtonStyle.Danger:ButtonStyle.Success),...(type==='deliver'?[button('edit:'+sid,'Vérifier / modifier les champs')]:[]))],allowedMentions:{parse:[]}});}
 selection(id,s,page){
  const pages=Math.ceil(s.data.rows.length/25);page=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
  const select=new StringSelectMenuBuilder().setCustomId('uptep:pick:'+id).setPlaceholder(s.type==='cancelConvoy'?'Choisir un convoi':'Choisir une demande').addOptions(s.data.rows.slice(page*25,(page+1)*25).map(d=>s.type==='cancelConvoy'?{label:short(`Convoi #${d.id} · ${d.pseudo_envoyeur} → ${d.pseudo_demandeur}`,100),value:d.id,description:short(`Demande #${d.iddemande} · ${fmt(d.nbpomme)} pommes · ${fmt(d.nbmateriaux)} matériaux · ${d.date_convoi}`,100)}:({label:short(`#${d.id} · ${d.pseudo_demandeur} · ${d.objet||'Ressources'}`,100),value:d.id,description:short(`${d.fini?'Terminée':d.valide?'En cours':'À valider'} · Pommes ${fmt(d.nbpomme_restant)} · Matériaux ${fmt(d.nbmateriaux_restant)}`,100)})));
  const components=[row(select)];if(pages>1)components.push(row(button(`page:${id}:${page-1}`,'Précédent').setDisabled(page===0),button(`page:${id}:${page+1}`,'Suivant').setDisabled(page===pages-1)));
  return {content:`Choisis ${s.type==='cancelConvoy'?'un convoi':'une demande'} · page ${page+1}/${pages}`,components,allowedMentions:{parse:[]}};
 }
 detail(d){
  const lines=(d.convois||[]).slice(-15).reverse().map(c=>`• ${c.annule?'❌ Annulé · ':''}${escape(short(c.pseudo_envoyeur,30))} : 🍎 ${fmt(c.nbpomme)} · 🪵 ${fmt(c.nbmateriaux)}${c.date_arrivee?' · arrivée <t:'+Math.floor(new Date(c.date_arrivee).getTime()/1000)+':f>':''}`);
  const adjustments=(d.ajustements||[]).slice(0,5).map(a=>`• <t:${Math.floor(new Date(a.date_ajustement).getTime()/1000)}:f> · ${escape(short(a.pseudo_acteur,30))} : 🍎 ${fmt(a.pommes_avant)} → ${fmt(a.pommes_apres)} · 🪵 ${fmt(a.materiaux_avant)} → ${fmt(a.materiaux_apres)}`);
  return {embeds:[new EmbedBuilder().setColor(0x657645).setTitle(short(`#${d.id} · ${d.pseudo_demandeur}`,100)).setDescription(`${escape(d.objet||'Ressources')}${d.niveau?' · niveau '+d.niveau:''}\n${d.fini?'Terminée':d.valide?'En cours':'En attente de validation'}${d.valide?'\n'+progress(d)+' · besoin couvert':''}\n\nRestant : 🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}\nDemandé : 🍎 ${fmt(d.nbpomme_original)} · 🪵 ${fmt(d.nbmateriaux_original)}\n\n**Derniers convois (${d.convois?.length||0} au total)**\n${lines.join('\n')||'Aucun convoi.'}${adjustments.length?'\n\n**Derniers ajustements du restant**\n'+adjustments.join('\n'):''}`)],components:[],allowedMentions:{parse:[]}};
 }
}
