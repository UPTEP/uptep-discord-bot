import {productionSummary} from './production.js';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder,MessageFlags,EmbedBuilder,CheckboxBuilder,LabelBuilder} from 'discord.js';
import {UserError,quantity,amounts,dueDate,arrival,level,cleanText,fmt,escape,short,convoyReports,progress,frenchDate} from './domain.js';
const row=(...components)=>new ActionRowBuilder().addComponents(components);
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId('uptep:'+id).setLabel(label).setStyle(style);
const field=(id,label,required=true,placeholder='')=>row(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(160).setPlaceholder(placeholder));
const autoCheckbox=value=>new LabelBuilder().setLabel('Auto production').setDescription('Je prévois de produire moi-même les ressources. Les convois restent possibles après confirmation.').setCheckboxComponent(new CheckboxBuilder().setCustomId('auto_production').setDefault(value===true));
const autoWarning='⚠️ Cette demande est en auto production. Souhaites-tu quand même déclarer ce convoi ?';
export const actions=()=>[row(button('request','Demander des ressources',ButtonStyle.Success),button('deliver','Déclarer un convoi',ButtonStyle.Success),button('browse','Consulter',ButtonStyle.Primary)),row(button('validate','Valider une demande (droit admin requis)',ButtonStyle.Primary),button('cancel','Annuler / Terminer une demande',ButtonStyle.Danger),button('cancelConvoy','Annuler un convoi déclaré',ButtonStyle.Danger)),row(button('adjust','Modifier une demande',ButtonStyle.Primary))];
const overage=(d,food,wood)=>({pommes:String(BigInt(food??0)>BigInt(d.nbpomme_restant??0)?BigInt(food??0)-BigInt(d.nbpomme_restant??0):0n),materiaux:String(BigInt(wood??0)>BigInt(d.nbmateriaux_restant??0)?BigInt(wood??0)-BigInt(d.nbmateriaux_restant??0):0n)});
const hasOverage=e=>e.pommes!=='0'||e.materiaux!=='0';
const overageWarning=e=>`⚠️ **Attention, le montant envoyé dépasse le restant demandé de 🍎 ${fmt(e.pommes)} pommes et 🪵 ${fmt(e.materiaux)} matériaux.**\nVérifie les montants. Confirmer autorise ce dépassement.`;
function planOverages(d,items){let food=BigInt(d.nbpomme_restant??0),wood=BigInt(d.nbmateriaux_restant??0);return items.map(item=>{const e=overage({nbpomme_restant:food,nbmateriaux_restant:wood},item.body.nbpomme,item.body.nbmateriaux);food=food>BigInt(item.body.nbpomme)?food-BigInt(item.body.nbpomme):0n;wood=wood>BigInt(item.body.nbmateriaux)?wood-BigInt(item.body.nbmateriaux):0n;return e;});}
export function boardPayload(demands){
 const open=demands.filter(d=>!d.fini);const done=demands.filter(d=>d.fini);
 const lines=open.slice(0,15).map(d=>`${d.valide?'🟢':'🟠'} **#${d.id} · ${escape(short(d.pseudo_demandeur,30))}** — ${escape(short(d.objet||'Ressources',40))}${d.niveau?' niv. '+d.niveau:''}${d.auto_production?' · 🏭 Auto production':''}\n🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}${d.auto_production?' · Envoi désactivé':''}${!d.auto_production&&d.valide&&!d.fini&&!d.annulee&&/^[1-9]\d*$/.test(String(d.iddemandeur))?' · [Livrer sur Fourmizzz](https://s5.fourmizzz.fr/commerce.php?ID='+d.iddemandeur+')':''}${d.date_souhaitee?' · souhaité le '+frenchDate(d.date_souhaitee):''}${d.valide?'\n'+progress(d)+'\n'+productionSummary(d):''}`);
 while(lines.join('\n\n').length>3700)lines.pop();
 return {embeds:[new EmbedBuilder().setColor(0x657645).setTitle('UPTEP · Gestion des convois').setDescription((lines.join('\n\n')||'Aucune demande en attente ou en cours.')+`\n\n🟠 À valider · 🟢 En cours\n${open.length} demande(s) ouverte(s) · ${done.length} terminée(s) sur 7 jours.`).setFooter({text:'UPTEP_CONVOYS_V1 · Actualisation automatique · Estimation théorique : cycles de 30 min'}).setTimestamp()],components:actions(),allowedMentions:{parse:[]}};
}
export class UI {
 constructor({api,snapshot,state,refresh,notifications,convoyNotifications}){Object.assign(this,{api,snapshot,state,refresh,notifications,convoyNotifications});this.busy=new Set();}
 async handle(i){
  const [,action,id,arg]=i.customId.split(':');
  try{
   if(action==='request'){
    const sid=this.state.create(i.user.id,'request');
    return await i.showModal(new ModalBuilder().setCustomId('uptep:requestForm:'+sid).setTitle('Demander des ressources').addComponents(field('objet','Bâtiment ou recherche'),field('niveau','Niveau visé',true,'Exemple : 20'),field('food','Pommes',false,'Exemple : 100k'),field('wood','Matériaux',false,'Exemple : 1,5m'),field('date','Date souhaitée (facultatif)',false,'JJ-MM-AAAA')));
   }
   if(action==='autoOptions'){
    const s=this.state.get(id,i.user.id);if(s.type!=='auto-options'||s.data.used)throw new UserError('Ce formulaire a déjà été confirmé. Repars du tableau.');
    return await i.showModal(new ModalBuilder().setCustomId('uptep:autoForm:'+id).setTitle('Options de la demande').addComponents(autoCheckbox(s.data.auto)));
   }
   if(action==='editBatch'){const s=this.state.get(id,i.user.id);if(s.type!=='convoyBatch'||s.data.attempted)throw new UserError('Ce lot a déjà été envoyé. Reprends les déclarations restantes.');this.state.set(id,{...s.data,superseded:true});const demand=s.data.demand;const sid=this.state.create(i.user.id,'deliver',{demand});return await i.showModal(new ModalBuilder().setCustomId('uptep:deliverForm:'+sid).setTitle('Vérifier les convois').addComponents(row(new TextInputBuilder().setCustomId('report').setLabel('Rapports du jeu · jusqu’à 20 convois').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(s.data.reportsText||s.data.items.map(item=>`Vous allez livrer ${item.body.nbpomme} et ${item.body.nbmateriaux} à ${demand.pseudo_demandeur} dans ${Math.max(0,Math.ceil((new Date(item.body.date_arrivee||Date.now()).getTime()-Date.now())/1000))}s`).join('\n'))),field('food','Pommes',false),field('wood','Matériaux',false),field('arrival','Arrivée',false)));}
   if(action==='edit'){
    const job=this.state.get(id,i.user.id);if(job.type!=='job'||!job.data.path.endsWith('/convois')||job.data.result||job.data.attempted||job.data.superseded)throw new UserError('Ce formulaire ne peut plus être modifié.');
    const d=job.data;this.state.set(id,{...d,superseded:true});const sid=this.state.create(i.user.id,'deliver',{demand:d.demand});
    const filled=(key,label,value)=>{const f=field(key,label,false);if(value)f.components[0].setValue(value);return f;};
    return await i.showModal(new ModalBuilder().setCustomId('uptep:deliverForm:'+sid).setTitle('Vérifier les données du convoi').addComponents(filled('food','Pommes envoyées',d.body.nbpomme),filled('wood','Matériaux envoyés',d.body.nbmateriaux),filled('arrival','Arrivée (ISO avec fuseau)',d.body.date_arrivee)));
   }
   if(action==='pick'){
    const s=this.state.get(id,i.user.id);const demand=s.data.rows.find(d=>d.id===i.values[0]);if(!demand)throw new UserError('Demande inconnue.');
    if(s.type==='adjust'){
     if(!demand.valide){
      const sid=this.state.create(i.user.id,'modify',{demand});
      const filled=(key,label,value,required=true)=>{const f=field(key,label,required);if(value!==null&&value!==undefined&&value!=='')f.components[0].setValue(String(value));return f;};
      return await i.showModal(new ModalBuilder().setCustomId('uptep:modifyForm:'+sid).setTitle(short('Modifier la demande · #'+demand.id,45)).addComponents(filled('objet','Bâtiment ou recherche',demand.objet),filled('niveau','Niveau visé',demand.niveau),filled('food','Pommes demandées',demand.nbpomme_original),filled('wood','Matériaux demandés',demand.nbmateriaux_original),filled('date','Date souhaitée (JJ-MM-AAAA)',demand.date_souhaitee?frenchDate(demand.date_souhaitee):'',false)));
     }
     const sid=this.state.create(i.user.id,'adjust',{demand});
     const food=field('food','Pommes encore nécessaires',true),wood=field('wood','Matériaux encore nécessaires',true);
     food.components[0].setValue(String(demand.nbpomme_restant));wood.components[0].setValue(String(demand.nbmateriaux_restant));
     return await i.showModal(new ModalBuilder().setCustomId('uptep:adjustForm:'+sid).setTitle(short('Modifier une demande · #'+demand.id,45)).addComponents(food,wood,autoCheckbox(demand.auto_production)));
    }
    if(s.type==='deliver'){
     const sid=this.state.create(i.user.id,'deliver',{demand});
     return await i.showModal(new ModalBuilder().setCustomId('uptep:deliverForm:'+sid).setTitle(short('Convoi #'+demand.id+' · '+demand.pseudo_demandeur,45)).addComponents(row(new TextInputBuilder().setCustomId('report').setLabel('Rapport(s) du jeu · jusqu’à 20 convois').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setPlaceholder('Vous allez livrer …')),field('food','Pommes envoyées',false),field('wood','Matériaux envoyés',false),field('arrival','Arrivée (facultatif)',false,'Durée : 2h 30m')));
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(s.type==='cancelConvoy'){
     const member=await this.api.member(i.user.id);if(!member.is_chaine&&member.player_id!==demand.idenvoyeur)throw new UserError('Tu peux uniquement annuler tes propres convois.');
     return await this.stage(i,'cancelConvoy',{path:'/convois/'+demand.id+'/annulation',body:{discord_id:i.user.id},summary:`Annuler la déclaration du convoi #${demand.id} de **${escape(demand.pseudo_envoyeur)}** vers **${escape(demand.pseudo_demandeur)}**, demande #${demand.iddemande} ?\n🍎 ${fmt(demand.nbpomme)} · 🪵 ${fmt(demand.nbmateriaux)}\nLe restant sera recalculé en tenant compte des éventuels surplus. Une demande soldée automatiquement pourra être rouverte ; une demande annulée ou terminée manuellement restera fermée.\nCela n’annule aucun envoi dans Fourmizzz.`});
    }
    if(s.type==='cancel'){
     const member=await this.api.member(i.user.id);this.check('cancel',demand,member);const sid=this.state.create(i.user.id,'closeDemand',{demand});
     return await i.editReply({content:`Demande #${demand.id} de **${escape(demand.pseudo_demandeur)}** : choisis l’action.\nAnnuler : abandonner la demande. Terminer : fermer une demande validée même si des ressources restent attendues, sans inventer de convoi.`,components:[row(button('closeDemand:'+sid+':cancel','Annuler la demande',ButtonStyle.Danger),button('closeDemand:'+sid+':finish','Terminer la demande',ButtonStyle.Primary).setDisabled(!demand.valide))],allowedMentions:{parse:[]}});
    }
    if(s.type==='browse')return await i.editReply(this.detail(demand));
    const member=await this.api.member(i.user.id);this.check(s.type,demand,member);
    return await this.stage(i,s.type,{path:'/demandes/'+demand.id+'/'+(s.type==='validate'?'validation':'annulation'),body:{discord_id:i.user.id,...(s.type==='validate'&&demand.version_modification?{version_attendue:demand.version_modification}:{})},summary:`${s.type==='validate'?'Valider':'Annuler'} la demande #${demand.id} de ${escape(demand.pseudo_demandeur)} ?`+(s.type==='validate'?`\n${escape(demand.objet||'Ressources')}${demand.niveau?' · niveau '+demand.niveau:''}\n🍎 ${fmt(demand.nbpomme_original)} · 🪵 ${fmt(demand.nbmateriaux_original)}\nDate souhaitée : ${demand.date_souhaitee?frenchDate(demand.date_souhaitee):'Non renseignée'}${demand.auto_production?'\n🏭 Auto production':''}`:'')});
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
   if(action==='autoForm'){
    const s=this.state.get(id,i.user.id);if(s.type!=='auto-options'||s.data.used)throw new UserError('Cette confirmation a déjà été préparée. Utilise le bouton Confirmer existant.');
    await this.api.member(i.user.id);if(s.data.type==='modify')this.check('adjust',s.data.data.demand,await this.api.member(i.user.id));
    const value=i.fields.getCheckbox('auto_production');if(typeof value!=='boolean')throw new UserError('Option auto production invalide.');
    if(s.data.used)throw new UserError('Cette confirmation a déjà été préparée.');this.state.set(id,{...s.data,used:true});
    const data=s.data.data;data.body.auto_production=value;data.summary+='\n🏭 Auto production : **'+(value?'Oui':'Non')+'**';return await this.stage(i,s.data.type,data);
   }
   if(action==='modifyForm'){
    const s=this.state.get(id,i.user.id);if(s.type!=='modify')throw new UserError('Formulaire invalide.');
    const d=s.data.demand;this.check('adjust',d,await this.api.member(i.user.id));
    if(!d.version_modification)throw new UserError('Rouvre Modifier une demande depuis le tableau actualisé.');
    const get=k=>i.fields.getTextInputValue(k);
    const body={discord_id:i.user.id,...amounts(get('food'),get('wood')),objet:cleanText(get('objet')),niveau:level(get('niveau').trim()),date_souhaitee:dueDate(get('date'))??null,version_attendue:d.version_modification};
    return await this.autoOptions(i,'modify',{path:'/demandes/'+d.id+'/modification',body,summary:`Modifier la demande #${d.id} de **${escape(d.pseudo_demandeur)}**\n**${escape(body.objet)} · niveau ${body.niveau}**\n🍎 ${fmt(body.nbpomme)} · 🪵 ${fmt(body.nbmateriaux)}\nDate souhaitée : ${body.date_souhaitee?frenchDate(body.date_souhaitee):'Non renseignée'}\n\nLa demande restera en attente de validation.`,demand:d},d.auto_production);
   }
   if(action==='adjustForm'){
    const s=this.state.get(id,i.user.id);if(s.type!=='adjust')throw new UserError('Formulaire invalide.');
    const d=s.data.demand,member=await this.api.member(i.user.id);this.check('adjust',d,member);
    const food=quantity(i.fields.getTextInputValue('food')),wood=quantity(i.fields.getTextInputValue('wood'));
    const body={discord_id:i.user.id,nbpomme_restant:food,nbmateriaux_restant:wood,nbpomme_attendu:d.nbpomme_restant,nbmateriaux_attendu:d.nbmateriaux_restant,...(typeof i.fields.getCheckbox==='function'?{auto_production:i.fields.getCheckbox('auto_production'),version_attendue:d.version_modification}:{})};
    return await this.stage(i,'adjust',{path:'/demandes/'+d.id+'/ajustement',body,summary:`Ajuster le restant de la demande #${d.id} de **${escape(d.pseudo_demandeur)}**
🍎 ${fmt(d.nbpomme_restant)} → **${fmt(food)}**
🪵 ${fmt(d.nbmateriaux_restant)} → **${fmt(wood)}**
🏭 Auto production : **${(body.auto_production??d.auto_production)?'Oui':'Non'}**\nSaisis le nouveau total encore nécessaire, pas la quantité produite. Les convois et les statistiques d’envoi restent inchangés.${food==='0'&&wood==='0'?'\nLa demande sera terminée manuellement.':''}`});
   }
   if(action==='requestForm'||action==='deliverForm'){
    const s=this.state.get(id,i.user.id);if(s.type!==(action==='requestForm'?'request':'deliver'))throw new UserError('Formulaire invalide.');
    await this.api.member(i.user.id);
    const get=k=>i.fields.getTextInputValue(k);const report=action==='deliverForm'&&i.fields.fields?.has('report')?get('report').trim():'';const parsedReports=report?convoyReports(report,s.data.demand.pseudo_demandeur):null;if(parsedReports&&(get('food').trim()||get('wood').trim()||get('arrival').trim()))throw new UserError('Colle uniquement le rapport ou remplis les champs manuels, pour éviter des quantités contradictoires.');
    if(parsedReports?.length>1)return await this.stageConvoys(i,s.data.demand,parsedReports);
    const parsed=parsedReports?.[0]??null;const quantities=parsed?{nbpomme:parsed.nbpomme,nbmateriaux:parsed.nbmateriaux}:amounts(get('food'),get('wood'));let body={discord_id:i.user.id,...quantities},path,summary;
    if(action==='requestForm'){
     body={...body,objet:cleanText(get('objet')),niveau:level(get('niveau').trim()),date_souhaitee:dueDate(get('date'))};path='/demandes';summary=`Demander **${escape(body.objet)} niveau ${body.niveau}**`;
    }else{body.date_arrivee=parsed?parsed.date_arrivee:arrival(get('arrival'));body.date_convoi=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');path='/demandes/'+s.data.demand.id+'/convois';summary=`Déclarer un convoi pour **${escape(s.data.demand.pseudo_demandeur)}**, demande #${s.data.demand.id}`;}
    summary+=`\n🍎 ${fmt(body.nbpomme)} · 🪵 ${fmt(body.nbmateriaux)}`;
    if(body.date_souhaitee)summary+='\nDate souhaitée : '+frenchDate(body.date_souhaitee);
    if(body.date_arrivee)summary+='\nArrivée : <t:'+Math.floor(new Date(body.date_arrivee).getTime()/1000)+':f>';
    if(action==='requestForm')return await this.autoOptions(i,s.type,{path,body,summary},false);
    return await this.stage(i,s.type,{path,body,summary,demand:s.data.demand});
   }

   if(action==='confirmOverageBatch'){const s=this.state.get(id,i.user.id);if(s.type!=='convoyBatch'||!s.data.overagePlan)throw new UserError('Confirmation expirée.');const items=s.data.items.filter(item=>!item.result);for(let n=0;n<items.length;n++){items[n].body.overage_confirmed=s.data.overagePlan[n];if(s.data.demand.auto_production)items[n].body.auto_production_confirmed=true;}delete s.data.overagePlan;this.state.set(id,s.data);return await this.applyConvoys(i,id);}
   if(action==='confirmAutoBatch'){const s=this.state.get(id,i.user.id);if(s.type!=='convoyBatch'||!s.data.autoNeedsConfirmation)throw new UserError('Confirmation expirée.');for(const item of s.data.items)if(!item.result)item.body.auto_production_confirmed=true;delete s.data.autoNeedsConfirmation;this.state.set(id,s.data);return await this.applyConvoys(i,id);}
   if(action==='applyConvoys')return await this.applyConvoys(i,id);
   if(action==='apply'){
    const s=this.state.get(id,i.user.id);if(s.type!=='job')throw new UserError('Confirmation invalide.');
    if(s.data.superseded)throw new UserError('Cette confirmation a été remplacée par le formulaire de modification.');
    if(s.data.result)return await i.editReply({content:s.data.result,components:[]});
    if(this.busy.has(id))throw new UserError('Cette opération est déjà en cours.');this.busy.add(id);this.state.set(id,{...s.data,attempted:true});
    try{
     const result=await this.api.request(s.data.path,{body:s.data.body});const content=`✅ Opération enregistrée sur UPTEP · demande #${result.demande.id}.`;
     if(/^\/demandes\/[0-9]+\/validation$/.test(s.data.path))this.notifications?.enqueue(result.demande);
     if(/^\/demandes\/[0-9]+\/convois$/.test(s.data.path))this.convoyNotifications?.enqueue(result);
     this.convoyNotifications?.flush().catch(()=>console.error('MP convoi différé.'));
     this.notifications?.flush().catch(()=>console.error('Annonce de validation différée.'));
     this.state.set(id,{...s.data,result:content});await i.editReply({content,components:[]});
     this.snapshot.invalidate();this.refresh().catch(()=>console.error('Actualisation du tableau différée.'));
    }catch(e){if(e.status===409&&/auto production|dépassement/i.test(e.message)&&s.data.demand){this.state.set(id,{...s.data,superseded:true});const {result,attempted,superseded,...retry}=s.data;return await this.stage(i,'deliver',{...retry,body:{...s.data.body},demand:{...s.data.demand,...(/auto production/i.test(e.message)?{auto_production:true}:{})},summary:s.data.summary});}await i.editReply({content:this.error(e),components:[row(button('apply:'+id,'Réessayer la même opération',ButtonStyle.Primary))]});}
    finally{this.busy.delete(id);}return;
   }
   if(action==='page'){const s=this.state.get(id,i.user.id);return await i.editReply(this.selection(id,s,Number(arg)));}
   if(['deliver','validate','cancel','browse','adjust'].includes(action)){
    const member=await this.api.member(i.user.id);const all=await this.snapshot.get();
    const rows=all.filter(d=>action==='browse'||(!d.fini&&!d.annulee&&(action==='deliver'?d.valide&&d.iddemandeur!==member.player_id:action==='validate'?!d.valide&&member.is_chaine:member.is_chaine||d.iddemandeur===member.player_id)));
    // Consultation lists the most recent request first, so it opens on page 1.
    if(action==='browse')rows.sort((x,y)=>{const a=BigInt(x.id),b=BigInt(y.id);return a<b?1:a>b?-1:0;});
    if(action==='validate'&&!member.is_chaine)throw new UserError('Il faut être administrateur du bot ou avoir le droit chaîne sur UPTEP pour valider les demandes.');
    if(!rows.length)return await i.editReply('Aucune demande disponible pour cette action.');
    const sid=this.state.create(i.user.id,action,{rows});return await i.editReply(this.selection(sid,this.state.get(sid,i.user.id),0));
   }
   throw new UserError('Action inconnue.');
  }catch(e){const payload={content:this.error(e),components:[],allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(payload);else await i.reply({...payload,flags:MessageFlags.Ephemeral});}
 }
 error(e){if(e instanceof UserError)return e.message;console.error('Erreur interaction :',e.name);return 'Une erreur est survenue. Réessaie depuis le tableau.';}
 check(type,d,m){if(type==='adjust'&&!m.is_chaine&&m.player_id!==d.iddemandeur)throw new UserError('Tu peux uniquement ajuster tes propres demandes.');if(type==='validate'&&!m.is_chaine)throw new UserError('Un droit administrateur du bot ou le droit chaîne est nécessaire.');if(type==='cancel'&&!m.is_chaine&&m.player_id!==d.iddemandeur)throw new UserError('Tu peux uniquement annuler tes demandes.');}
 async autoOptions(i,type,data,value=false){const sid=this.state.create(i.user.id,'auto-options',{type,data,auto:value===true});return i.editReply({content:data.summary+'\n\nChoisis l’option Auto production avant la confirmation finale.',components:[row(button('autoOptions:'+sid,'Auto production et confirmation',ButtonStyle.Primary))],allowedMentions:{parse:[]}});}
 async freshDemand(d){if(!this.snapshot?.get)return d;this.snapshot.invalidate?.();return (await this.snapshot.get()).find(row=>row.id===d.id)??d;}
 async stage(i,type,data){if(type==='deliver'&&data.demand){data.demand=await this.freshDemand(data.demand);const excess=overage(data.demand,data.body.nbpomme,data.body.nbmateriaux);delete data.body.overage_confirmed;data.summary=data.summary.split('\n\n⚠️ **Attention, le montant envoyé')[0];if(hasOverage(excess)){data.body.overage_confirmed=excess;data.summary+='\n\n'+overageWarning(excess);}if(data.demand.auto_production){data.body.auto_production_confirmed=true;if(!data.summary.includes(autoWarning))data.summary+='\n\n'+autoWarning;}}const sid=this.state.create(i.user.id,'job',{});data.body.commande_id='discord:'+sid;this.state.set(sid,data);return i.editReply({content:data.summary+'\n\nConfirme pour enregistrer cette action.',components:[row(button('apply:'+sid,'Confirmer',['cancel','cancelConvoy'].includes(type)?ButtonStyle.Danger:ButtonStyle.Success),...(type==='deliver'?[button('edit:'+sid,'Vérifier / modifier les champs')]:[]))],allowedMentions:{parse:[]}});}
 async stageConvoys(i,demand,reports){
  demand=await this.freshDemand(demand);
  const totals=reports.reduce((sum,r)=>({food:sum.food+BigInt(r.nbpomme),wood:sum.wood+BigInt(r.nbmateriaux)}),{food:0n,wood:0n});
  const excess=overage(demand,totals.food,totals.wood);
  const sid=this.state.create(i.user.id,'convoyBatch',{}),date=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
  const items=reports.map((r,index)=>({body:{discord_id:i.user.id,...r,date_convoi:date,commande_id:'discord:'+sid+':'+index,...(demand.auto_production?{auto_production_confirmed:true}:{})}}));
  const plan=planOverages(demand,items);for(let n=0;n<items.length;n++)if(hasOverage(plan[n]))items[n].body.overage_confirmed=plan[n];
  this.state.set(sid,{path:'/demandes/'+demand.id+'/convois',demand,items});
  const lines=reports.map((r,index)=>`${index+1}. 🍎 ${fmt(r.nbpomme)} · 🪵 ${fmt(r.nbmateriaux)} · <t:${Math.floor(new Date(r.date_arrivee).getTime()/1000)}:f>`);
  return i.editReply({content:`**${reports.length} convois pour ${escape(short(demand.pseudo_demandeur,80))} · demande #${demand.id}**\nTotal : 🍎 ${fmt(totals.food)} · 🪵 ${fmt(totals.wood)}\nVérifie chaque envoi avant de confirmer. Les lignes identiques sont conservées comme des convois distincts.${demand.auto_production?'\n\n'+autoWarning:''}${hasOverage(excess)?'\n\n'+overageWarning(excess):''}`,embeds:[new EmbedBuilder().setColor(0x657645).setTitle('Quantités et arrivée de chaque convoi').setDescription(lines.join('\n'))],components:[row(button('applyConvoys:'+sid,'Confirmer les convois',ButtonStyle.Success),button('editBatch:'+sid,'Vérifier / modifier les champs'))],allowedMentions:{parse:[]}});
 }
 async applyConvoys(i,id){
  const session=this.state.get(id,i.user.id);if(session.type!=='convoyBatch')throw new UserError('Confirmation invalide.');
  if(this.busy.has(id))throw new UserError('Cette opération est déjà en cours.');
  const data=session.data;if(data.superseded)throw new UserError('Ce lot a été remplacé par le formulaire de modification.');
  if(data.result)return i.editReply({content:data.result,embeds:[],components:[],allowedMentions:{parse:[]}});
  this.busy.add(id);data.attempted=true;this.state.set(id,data);
  try{
   for(const item of data.items){
    if(!item.result){
     // Stable body and command ID survive a lost response or bot restart.
     item.result=await this.api.request(data.path,{body:item.body});
     this.state.set(id,data);
    }
    // Queue is idempotent by convoy ID, including crash recovery.
    this.convoyNotifications?.enqueue(item.result);
   }
   data.result=`✅ ${data.items.length} convois enregistrés sur UPTEP · demande #${data.items[0].result.demande.id}.`;
   this.state.set(id,data);
   await i.editReply({content:data.result,embeds:[],components:[],allowedMentions:{parse:[]}});
  }catch(e){
   if(e.status===409&&/dépassement/i.test(e.message)&&data.demand){data.demand=await this.freshDemand(data.demand);const remaining=data.items.filter(item=>!item.result);data.overagePlan=planOverages(data.demand,remaining);this.state.set(id,data);const totals=remaining.reduce((a,item)=>({food:a.food+BigInt(item.body.nbpomme),wood:a.wood+BigInt(item.body.nbmateriaux)}),{food:0n,wood:0n});return i.editReply({content:overageWarning(overage(data.demand,totals.food,totals.wood))+'\nLes convois déjà enregistrés seront conservés.'+(data.demand.auto_production?'\n'+autoWarning:''),embeds:[],components:[row(button('confirmOverageBatch:'+id,'Confirmer le dépassement',ButtonStyle.Primary))],allowedMentions:{parse:[]}});}
   if(e.status===409&&/auto production/i.test(e.message)){data.autoNeedsConfirmation=true;this.state.set(id,data);return i.editReply({content:autoWarning+'\nLes convois déjà enregistrés seront conservés.',components:[row(button('confirmAutoBatch:'+id,'Confirmer malgré auto production',ButtonStyle.Primary))],allowedMentions:{parse:[]}});}
   const done=data.items.filter(item=>item.result).length;
   await i.editReply({content:`${done}/${data.items.length} convois confirmés par UPTEP.\n${this.error(e)}\nUtilise ce bouton pour reprendre : les convois déjà enregistrés ne seront pas ajoutés une seconde fois.`,embeds:[],components:[row(button('applyConvoys:'+id,'Reprendre les convois restants',ButtonStyle.Primary))],allowedMentions:{parse:[]}});
  }finally{
   this.busy.delete(id);
   this.convoyNotifications?.flush().catch(()=>console.error('MP convoi différé.'));
   this.snapshot.invalidate();this.refresh().catch(()=>console.error('Actualisation du tableau différée.'));
  }
 }
 selection(id,s,page){
  const rows=[...new Map(s.data.rows.map(d=>[String(d.id),d])).values()];
  const pages=Math.ceil(rows.length/25);page=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
  const select=new StringSelectMenuBuilder().setCustomId('uptep:pick:'+id).setPlaceholder(s.type==='cancelConvoy'?'Choisir un convoi':'Choisir une demande').addOptions(rows.slice(page*25,(page+1)*25).map(d=>s.type==='cancelConvoy'?{label:short(`Convoi #${d.id} · ${d.pseudo_envoyeur} → ${d.pseudo_demandeur}`,100),value:d.id,description:short(`Demande #${d.iddemande} · ${fmt(d.nbpomme)} pommes · ${fmt(d.nbmateriaux)} matériaux · ${d.date_convoi}`,100)}:({label:short(`#${d.id} · ${d.pseudo_demandeur} · ${d.objet||'Ressources'}`,100),value:d.id,description:short(`${d.fini?'Terminée':d.valide?'En cours':'À valider'}${d.auto_production?' · Auto production':''} · Pommes ${fmt(d.nbpomme_restant)} · Matériaux ${fmt(d.nbmateriaux_restant)}`,100)})));
  const components=[row(select)];if(pages>1)components.push(row(button(`page:${id}:${page-1}`,'Précédent').setDisabled(page===0),button(`page:${id}:${page+1}`,'Suivant').setDisabled(page===pages-1)));
  return {content:`Choisis ${s.type==='cancelConvoy'?'un convoi':'une demande'} · page ${page+1}/${pages}`,components,allowedMentions:{parse:[]}};
 }
 detail(d){
  const lines=(d.convois||[]).slice(-15).reverse().map(c=>`• ${c.annule?'❌ Annulé · ':''}${escape(short(c.pseudo_envoyeur,30))} : 🍎 ${fmt(c.nbpomme)} · 🪵 ${fmt(c.nbmateriaux)}${c.date_arrivee?' · arrivée <t:'+Math.floor(new Date(c.date_arrivee).getTime()/1000)+':f>':''}`);
  const adjustments=(d.ajustements||[]).slice(0,5).map(a=>`• <t:${Math.floor(new Date(a.date_ajustement).getTime()/1000)}:f> · ${escape(short(a.pseudo_acteur,30))} : 🍎 ${fmt(a.pommes_avant)} → ${fmt(a.pommes_apres)} · 🪵 ${fmt(a.materiaux_avant)} → ${fmt(a.materiaux_apres)}`);
  return {embeds:[new EmbedBuilder().setColor(0x657645).setTitle(short(`#${d.id} · ${d.pseudo_demandeur}`,100)).setDescription(short(`${escape(d.objet||'Ressources')}${d.niveau?' · niveau '+d.niveau:''}${d.auto_production?'\n🏭 **Auto production**':''}\n${d.fini?'Terminée':d.valide?'En cours':'En attente de validation'}${d.valide?'\n'+progress(d)+' · besoin couvert':''}\n\nRestant : 🍎 ${fmt(d.nbpomme_restant)} · 🪵 ${fmt(d.nbmateriaux_restant)}\nDemandé : 🍎 ${fmt(d.nbpomme_original)} · 🪵 ${fmt(d.nbmateriaux_original)}${productionSummary(d)?'\n\n'+productionSummary(d,{detail:true}):''}\n\n**Derniers convois (${d.convois?.length||0} au total)**\n${lines.join('\n')||'Aucun convoi.'}${adjustments.length?'\n\n**Derniers ajustements du restant**\n'+adjustments.join('\n'):''}`,4000))],components:[],allowedMentions:{parse:[]}};
 }
}
