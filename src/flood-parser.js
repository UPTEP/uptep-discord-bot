import {UserError} from './domain.js';
const iso=d=>d.toISOString().replace(/\.\d{3}Z$/,'Z');
export function parseFloods(raw,now=new Date()){
 if(typeof raw!=='string'||!raw.trim()||raw.length>4000)throw new UserError('Colle un relevé de 1 à 4 000 caractères.');
 const text=raw.normalize('NFC').replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/[*`]/g,'').replace(/^_|_$/gm,'').replace(/\u00a0|\u202f/g,' ');
 const starts=[...text.matchAll(/Vous allez attaquer\s+/gi)];if(!starts.length)throw new UserError('Aucune ligne « Vous allez attaquer … dans … » reconnue.');
 if(starts.length>20)throw new UserError('Maximum 20 floods par déclaration.');
 const warnings=[];if(text.slice(0,starts[0].index).replace(/[\s\-–•]/g,''))warnings.push('Du texte avant le premier flood a été ignoré.');
 const floods=starts.map((start,i)=>{
  let block=text.slice(start.index,starts[i+1]?.index??text.length).trim().replace(/[\s\-–•]+$/,'');
  let m=/^Vous allez attaquer\s+(.+?)\s*\((Terrain de chasse|D[oô]me(?:\s*\(\d+\))?|Loge(?: Imp[eé]riale)?(?:\s*\(\d+\))?)\)\s+dans\s+([\s\S]+)$/i.exec(block);
  if(!m){
   const compact=/^Vous allez attaquer\s+([^()\r\n]+?(?:\s*\([^()\r\n]*\))?)\s+dans\s+([\s\S]+)$/i.exec(block);
   if(compact){m=[compact[0],compact[1],'Terrain de chasse',compact[2]];warnings.push(`Flood ${i+1} : lieu absent du relevé, Terrain de chasse utilisé. Vérifie avant de confirmer.`);}
  }
  if(!m)throw new UserError(`Flood ${i+1} incomplet : pseudo, lieu ou durée non reconnu. Aucun flood enregistré.`);
  const pseudo=m[1].replace(/\s*\([^()]*\)\s*$/,'').trim();if(!pseudo||pseudo.length>100)throw new UserError(`Pseudo invalide au flood ${i+1}.`);
  let rest=m[3],seconds=0,parts=0;const units=new Set();
  for(;;){const duration=/^\s*(\d+)\s*(jours?|heures?|minutes?|secondes?|[jhms])(?=\s|\d|$)\s*/i.exec(rest);if(!duration)break;const u=duration[2][0].toLowerCase();if(units.has(u))throw new UserError(`Durée ambiguë au flood ${i+1}.`);units.add(u);parts++;seconds+=Number(duration[1])*({j:86400,h:3600,m:60,s:1}[u]);rest=rest.slice(duration[0].length);}
  if(!parts||!Number.isSafeInteger(seconds)||seconds<1||seconds>31*86400)throw new UserError(`Durée invalide au flood ${i+1}.`);
  const arrival=new Date(+now+seconds*1000);let troops=null;
  const troopMatch=/Troupes en attaques?\s*:\s*([\s\S]*?)(?=Arriv[eé]e\s+[àa]|$)/i.exec(rest);
  if(troopMatch){troops=troopMatch[1].trim().replace(/[\s\-–•]+$/,'');rest=rest.replace(troopMatch[0],'');if(troops.length>1000)throw new UserError(`Détail des troupes trop long au flood ${i+1}.`);}
  const clock=/Arriv[eé]e\s+[àa]\s*(\d{1,2})\s*[h:]\s*(\d{2})(?:\s*[:h]\s*(\d{2}))?/i.exec(rest);
  if(clock){const h=Number(clock[1]),min=Number(clock[2]);if(h>23||min>59)throw new UserError(`Heure invalide au flood ${i+1}.`);const paris=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(arrival);const [eh,em]=paris.split(':').map(Number);const diff=Math.abs(h*60+min-eh*60-em);if(Math.min(diff,1440-diff)>2)warnings.push(`Flood ${i+1} : heure copiée ${clock[1]}h${clock[2]} différente de l’arrivée calculée (${paris}, Paris). Vérifie le relevé.`);rest=rest.replace(clock[0],'');}
  if(rest.replace(/[\s.\-–•]/g,''))warnings.push(`Flood ${i+1} : texte supplémentaire non reconnu, non enregistré.`);
  return {pseudo,location:/^terrain/i.test(m[2])?'Terrain de chasse':/^d/i.test(m[2])?'Dôme':'Loge',troops:troops||null,arrival_at:iso(arrival)};
 });
 return {captured_at:iso(now),floods,warnings};
}
