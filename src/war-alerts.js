import {EmbedBuilder,PermissionFlagsBits} from 'discord.js';
import {escape as esc} from './domain.js';
// Alertes « préparation de guerre » calculées par le site après chaque relevé des joueurs.
// Le bot déclenche l'évaluation (idempotente), publie les événements puis les acquitte.
const numbers=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0});
const ratios=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
const paris=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const n=value=>numbers.format(Number(value));
export function parisTime(iso){const p=Object.fromEntries(paris.formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return `${p.day}/${p.month} ${p.hour}h${p.minute}`;}
const growth=(before,now)=>Number(before)>0?'×'+ratios.format(Number(now)/Number(before)):'depuis 0';
const item=raw=>typeof raw==='string'?{tag:raw}:raw&&typeof raw==='object'?raw:{tag:'?'};
function list(items,format,max=6){const shown=items.slice(0,max).map(format);if(items.length>max)shown.push('…');return '['+shown.join(', ')+']';}
function pumpedLines(p,homeTag){
 const donors=p.donors.length?p.donors.map(d=>`${esc(d.pseudo??'#'+d.player_id)} (${n(d.amount)})`).join(', '):'—';
 const lines=[`• **${esc(p.pseudo)}** ${n(p.field_before)} → ${n(p.field_now)} (${growth(p.field_before,p.field_now)}), chaîne : ${donors}`];
 if(p.neighbours?.length)lines.push(`  ↳ ${esc(homeTag)} proches : `+p.neighbours.map(u=>`${esc(u.pseudo)} à ${ratios.format(Number(u.distance))} (${n(u.field)}, ${Number(p.field_now)>0?ratios.format(Number(u.field)/Number(p.field_now))+'×':'—'})`).join(', '));
 return lines;
}
// Garde la description sous la limite Discord en coupant la liste des comptes gonflés.
function fit(head,pumped,tail,limit=3900){
 const out=[...head];let used=head.join('\n').length+tail.join('\n').length;let shown=0;
 for(const text of pumped){if(used+text.length+1>limit)break;out.push(text);used+=text.length+1;shown++;}
 if(shown<pumped.length)out.push(`… et ${pumped.length-shown} autre(s) compte(s).`);
 return [...out,...tail].join('\n');
}
export function warAlertPayload(event,{homeTag='UPTEP'}={}){
 const a=event.payload,update=event.kind==='mise_a_jour';
 const span=a.span_hours!=null?`${Math.round(Number(a.span_hours))} h`:'12 relevés';
 const fresh=update?new Set(a.new_player_ids??[]):null;
 const pumped=(update?a.pumped.filter(p=>fresh.has(p.player_id)):a.pumped).map(p=>pumpedLines(p,homeTag).join('\n'));
 const head=[`Relevé : ${parisTime(a.exported_at)}`+(update&&event.episode_start?` · épisode commencé le ${parisTime(event.episode_start)}`:''),'',update?`**Nouveaux comptes gonflés (${span}) :**`:`**Comptes gonflés (${span}) :**`];
 const idle=a.idle.map(x=>esc(x.pseudo));
 const tail=['',`**Gros comptes à l’arrêt :** ${a.idle_count}/${a.top_count}${idle.length?' ('+idle.slice(0,6).join(', ')+(idle.length>6?', …':'')+')':''}`,
  `**Diplomatie :** guerres ${list(a.wars,w=>esc(item(w).tag))} · pactes ${list(a.pacts,raw=>{const x=item(raw);const label=x.description||x.name;return esc(x.tag)+(label?' : '+esc(label):'');})} · pacte avec ${esc(homeTag)} : ${a.home_pact?'oui':'non'}`,
  '','-# Préparation *possible* : environ 8 alertes sur 10 ne sont suivies d’aucune attaque. À vérifier.'];
 const title=`${update?'🔁 Mise à jour':'⚠️ Préparation possible'} : ${a.tag} (${n(a.members)} membres, ${n(a.total_field)} TDC)`;
 const embed=new EmbedBuilder().setColor(update?0xc98a2e:0xb3412e).setTitle(title.slice(0,256)).setDescription(fit(head,pumped,tail)).setFooter({text:'UPTEP_WAR_ALERT_V1 · '+(a.name?a.name.slice(0,80)+' · ':'')+a.export_version});
 return {embeds:[embed],allowedMentions:{parse:[]}};
}
export class WarAlerts{
 constructor({api,state,client,guildId,channelId,homeTag='UPTEP',log=console}){Object.assign(this,{api,state,client,guildId,channelId,homeTag,log});this.running=null;}
 tick(){if(!this.channelId)return Promise.resolve();if(!this.running)this.running=this.run().finally(()=>{this.running=null;});return this.running;}
 async channel(){
  const c=await this.client.channels.fetch(this.channelId);
  if(!c?.isTextBased()||c.isDMBased()||c.guildId!==this.guildId)throw new Error('Salon des alertes invalide');
  if(!c.permissionsFor(this.client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory]))throw new Error('Permissions manquantes dans le salon des alertes');
  return c;
 }
 async run(){
  // Une évaluation en échec n'empêche pas de publier ce qui attend déjà.
  try{const r=await this.api.request('/alertes-guerre/evaluation',{body:{}});if(r.status==='window_skipped')this.log.warn?.(`Alertes guerre : fenêtre incomplète pour ${r.export_version}, relevé ignoré.`);}
  catch(e){this.log.error('Évaluation alertes guerre :',e.message);}
  const {events}=await this.api.request('/alertes-guerre');
  if(!events.length)return;
  const channel=await this.channel();
  const sent=this.state.data.warAlerts??={};const firstMessage={};
  for(const event of events){
   // L'ID publié est sauvegardé avant l'acquittement : un redémarrage entre les deux ne republie pas.
   let id=sent[event.id];
   if(!id){
    const ref=event.kind==='mise_a_jour'?event.episode_message_id??firstMessage[event.episode_id]:null;
    const message=await channel.send({...warAlertPayload(event,{homeTag:this.homeTag}),...(ref?{reply:{messageReference:ref,failIfNotExists:false}}:{})});
    id=message.id;sent[event.id]=id;this.state.save();
   }
   if(event.kind==='nouvelle')firstMessage[event.episode_id]=id;
   await this.api.request('/alertes-guerre',{body:{id:event.id,message_id:id}});
   delete sent[event.id];this.state.save();
  }
 }
}
