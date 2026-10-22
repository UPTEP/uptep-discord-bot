export class UserError extends Error {}
export const MAX=9223372036854775807n;
export function quantity(raw){
 const text=String(raw??'').trim().toLowerCase().replace(/\s/g,'');if(!text)return '0';
 const m=/^(\d+)(?:[.,](\d+))?([kmg])?$/.exec(text);if(!m)throw new UserError('Quantité invalide. Exemples : 10000, 10k ou 1,5m.');
 const scale={k:1000n,m:1000000n,g:1000000000n}[m[3]]??1n,denominator=10n**BigInt(m[2]?.length??0);
 const numerator=BigInt(m[1]+(m[2]??''))*scale;if(numerator%denominator)throw new UserError('La quantité doit représenter un nombre entier de ressources.');
 const value=numerator/denominator;if(value>MAX)throw new UserError('Quantité trop grande.');return value.toString();
}
export function amounts(food,wood){const nbpomme=quantity(food),nbmateriaux=quantity(wood);if(nbpomme==='0'&&nbmateriaux==='0')throw new UserError('Renseigne au moins une quantité supérieure à zéro.');return {nbpomme,nbmateriaux};}
export function dueDate(raw,now=new Date()){
 if(!raw?.trim())return undefined;
 const m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());if(!m)throw new UserError('Date souhaitée attendue au format JJ-MM-AAAA.');
 const input=m[3]+'-'+m[2]+'-'+m[1];
 const d=new Date(input+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==input)throw new UserError('Date souhaitée invalide.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);if(input<today)throw new UserError('La date souhaitée est déjà passée.');return input;
}
export function arrival(raw,now=new Date()){
 if(!raw?.trim())return undefined;
 const text=raw.trim();
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(text)){
  const d=new Date(text);if(!Number.isFinite(+d))throw new UserError('Date d’arrivée invalide.');return d.toISOString().replace(/\.\d{3}Z$/,'Z');
 }
 if(!/^(?:\d+\s*[jhms]\s*)+$/i.test(text))throw new UserError('Arrivée : indique une durée comme 2h 30m ou une date ISO avec fuseau.');
 let seconds=0;for(const m of text.matchAll(/(\d+)\s*([jhms])/gi))seconds+=Number(m[1])*({j:86400,h:3600,m:60,s:1}[m[2].toLowerCase()]);
 if(!Number.isSafeInteger(seconds)||seconds>366*86400)throw new UserError('Durée d’arrivée trop grande.');return new Date(+now+seconds*1000).toISOString().replace(/\.\d{3}Z$/,'Z');
}
export function level(raw){if(!/^[1-9]\d{0,2}$/.test(raw))throw new UserError('Niveau attendu entre 1 et 999.');return raw;}
export function cleanText(raw,max=160){const s=raw.trim();if(!s||s.length>max)throw new UserError('Renseigne un libellé entre 1 et '+max+' caractères.');return s;}
export const fmt=value=>BigInt(value??'0').toLocaleString('fr-FR');
export const escape=text=>String(text??'').replace(/[\\*_`~|<>\[\]()]/g,'\\$&').replace(/[\r\n]+/g,' ');
export function short(text,size=90){return String(text).length>size?String(text).slice(0,size-1)+'…':String(text);}
// The game line, optionally rewritten by another script with "· arrivée aujourd'hui 10 h 54" (ignored: the duration is used).
export function convoyReport(raw,recipient,now=new Date()){
 const text=String(raw).normalize('NFC').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
 if((text.match(/Vous allez livrer\b/giu)||[]).length>1)throw new UserError('Plusieurs convois ont été collés. Déclare un seul convoi à la fois : copie uniquement sa ligne « Vous allez livrer … », puis recommence pour les autres envois.');
 const m=/^(?:-\s*)?Vous allez livrer (\d[\d ]*)(?: nourritures?)? et (\d[\d ]*)(?: mat[eé]riaux?)? [àa] ((?:(?! dans ).)+?) dans ((?:\d+\s*[jHhms]\s*)+)(?:[·•]\s*arriv[ée]e\s+[^-·•]*)?(?:\s*-\s*Retour le [^-]+)?(?:\s*-\s*Annuler)?(?:\s*-)?\s*$/iu.exec(text);
 if(!m)throw new UserError('Rapport non reconnu. Colle une seule ligne « Vous allez livrer … dans … », avec ou sans le retour.');
 const target=m[3].trim();if(target.toLocaleLowerCase('fr')!==String(recipient).normalize('NFC').trim().toLocaleLowerCase('fr'))throw new UserError('Ce rapport est destiné à '+target+', mais la demande choisie concerne '+recipient+'. Choisis la bonne demande.');
 return {...amounts(m[1],m[2]),date_arrivee:arrival(m[4],now)};
}
// Preserve each occurrence: identical reports may represent distinct convoys.
export function convoyReports(raw,recipient,now=new Date()){
 const text=String(raw).normalize('NFC').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
 if(text.length>4000)throw new UserError('Colle au maximum 4 000 caractères de rapports.');
 const starts=[...text.matchAll(/Vous allez livrer\b/giu)];
 if(!starts.length)return [convoyReport(text,recipient,now)];
 if(starts.length>20)throw new UserError('Déclare au maximum 20 convois à la fois.');
 if(!/^(?:-\s*)?$/.test(text.slice(0,starts[0].index)))throw new UserError('Colle uniquement les lignes « Vous allez livrer … ».');
 return starts.map((start,index)=>{
  try{return convoyReport(text.slice(start.index,starts[index+1]?.index??text.length).trim(),recipient,now);}
  catch(e){if(e instanceof UserError)throw new UserError('Convoi '+(index+1)+' : '+e.message);throw e;}
 });
}
export function progress(d){
 const total=BigInt(d.nbpomme_original??0)+BigInt(d.nbmateriaux_original??0);
 const remaining=BigInt(d.nbpomme_restant??0)+BigInt(d.nbmateriaux_restant??0);
 const sent=total>remaining?total-remaining:0n;
 const tenths=total>0n?Number((sent*1000n)/total):0;
 const bounded=Math.max(0,Math.min(1000,tenths));
 const blocks=Math.floor(bounded/100);
 const percentage=bounded%10===0?String(bounded/10):(bounded/10).toFixed(1).replace('.',',');
 return '`'+ '█'.repeat(blocks)+'░'.repeat(10-blocks)+'` **'+percentage+' %**';
}

export const frenchDate=value=>String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');
