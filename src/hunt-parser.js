import {UserError} from './domain.js';
const iso=d=>d.toISOString().replace(/\.\d{3}Z$/,'Z');
const UNITS={j:86400,jour:86400,jours:86400,h:3600,heure:3600,heures:3600,m:60,mn:60,min:60,minute:60,minutes:60,s:1,sec:1,seconde:1,secondes:1};
// Paris wall-clock parts of an instant.
function paris(date){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));return p;}
// Instant of a Paris wall-clock time (DST-safe: corrects with the zone offset at that moment).
function parisInstant(y,mo,d,h,mi){let t=Date.UTC(y,mo-1,d,h,mi);for(let k=0;k<2;k++){const p=paris(new Date(t));const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);t+=Date.UTC(y,mo-1,d,h,mi)-shown;}return new Date(t);}
/** Reads "<number> <unit>" pairs from the start; stops at anything else ("Arrivée à 09h26"). */
export function huntDuration(text){
 let rest=String(text).toLowerCase(),seconds=0,last=null,found=false;
 const pair=/^\s*(\d+)\s*(jours|jour|j|heures|heure|h|minutes|minute|min|mn|m|secondes|seconde|sec|s)?(?![a-zéè])/;
 for(let m;(m=rest.match(pair));rest=rest.slice(m[0].length)){
  const factor=m[2]?UNITS[m[2]]:(last===3600?60:undefined);// "3 h 08": a bare number after hours is minutes.
  if(factor===undefined)break;
  seconds+=Number(m[1])*factor;last=factor;found=true;
 }
 return found&&seconds>0&&seconds<=31*86400?seconds:null;
}
/**
 * Hunt report pasted from AcquerirTerrain.php or Ressources.php (any layout):
 * "Vos chasseuses vont conquérir 2 205 cm² dans 1 minute 44 secondes … Arrivée à 09h26"
 * or "+2 573 cm² · retour dans 3 h 08 (aujourd'hui 23 h 55)".
 * The arrival is the paste time plus the duration; when the report also gives a clock time and the two
 * disagree by more than 2 minutes (report copied a while ago), the clock time wins.
 */
export function parseHunts(raw,now=new Date()){
 if(typeof raw!=='string'||!raw.trim()||raw.length>4000)throw new UserError('Colle un rapport de 1 à 4 000 caractères.');
 const text=raw.normalize('NFC').replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/[*`_]/g,'').replace(/[  ]/g,' ')
  .replace(/(vos chasseuses|\+\s*\d[\d ]*\s*cm)/gi,'\n$1');
 const blocks=[...text.matchAll(/(?:vos chasseuses vont conquérir\s+(\d[\d ]*)\s*cm(?:²|2)\s+dans|\+\s*(\d[\d ]*)\s*cm(?:²|2)\s*·?\s*retour\s+dans)\s+([^\n]*(?:\n(?!\s*(?:vos chasseuses|\+\s*\d))[^\n]*)*)/gi)];
 if(!blocks.length)throw new UserError('Aucune ligne « Vos chasseuses vont conquérir … cm² dans … » reconnue. Copie le bloc « Chasse en cours » de la page Chasse ou Ressources.');
 if(blocks.length>50)throw new UserError('Maximum 50 chasses par déclaration.');
 const warnings=[];
 const hunts=blocks.map((b,i)=>{
  const digits=(b[1]??b[2]).replace(/\s/g,'');if(!/^\d{1,13}$/.test(digits)||/^0+$/.test(digits))throw new UserError(`Surface invalide à la chasse ${i+1}.`);
  const tail=b[3].replace(/\s+/g,' ');
  const seconds=huntDuration(tail.split(/arriv|\(|troupes|annuler/i)[0]);
  if(!seconds)throw new UserError(`Durée non reconnue à la chasse ${i+1}. Aucune chasse enregistrée.`);
  let arrival=new Date(+now+seconds*1000);
  const clock=/(?:arriv[ée]e\s+(?:(aujourd['’]hui|demain)\s+)?[àa]\s*|\(\s*(aujourd['’]hui|demain)\s+)(\d{1,2})\s*[h:]\s*(\d{2})/i.exec(tail);
  if(clock){
   const h=Number(clock[3]),mi=Number(clock[4]);if(h>23||mi>59)throw new UserError(`Heure invalide à la chasse ${i+1}.`);
   // Pick the day that puts this Paris clock time closest to the computed arrival.
   const base=paris(arrival);let best=null;
   for(const shift of [-1,0,1]){const d=new Date(Date.UTC(+base.year,+base.month-1,+base.day+shift));const c=parisInstant(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),h,mi);if(!best||Math.abs(c-arrival)<Math.abs(best-arrival))best=c;}
   const gap=Math.abs(best-arrival)/60000;
   if(gap>2&&gap<=12*60){warnings.push(`Chasse ${i+1} : la durée copiée date un peu ; l’heure d’arrivée ${clock[3]}h${clock[4]} (Paris) est utilisée.`);arrival=best;}
   else if(gap>12*60)warnings.push(`Chasse ${i+1} : l’heure ${clock[3]}h${clock[4]} ne correspond pas à la durée ; la durée est utilisée.`);
  }
  if(+arrival<=+now)throw new UserError(`La chasse ${i+1} est déjà arrivée : recopie un rapport à jour.`);
  return {area:String(BigInt(digits)),arrival_at:iso(arrival)};
 });
 const announced=(text.match(/(\d+)\s*chasse\(s\)\s*en\s*cours/i)||[])[1];
 if(announced!==undefined&&Number(announced)!==hunts.length)warnings.push(`Le rapport annonce ${announced} chasse(s) en cours, ${hunts.length} reconnue(s). Vérifie avant de confirmer.`);
 return {captured_at:iso(now),hunts,warnings};
}
