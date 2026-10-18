// Calculator mirrored from uptep-site/userscript/src/convoys.js; parity checked by tests.
// BEGIN SHARED CALCULATOR
export function convoyColonyCapacity(value){
 const number=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n?BigInt(v):null;
 if(typeof value==='string')return number(value);
 if(!value||typeof value!=='object'||!Array.isArray(value.gains))return null;
 let capacity=number(value.own);if(capacity===null)return null;
 const transfer=t=>{const terrain=number(t?.terrain);return terrain===null||!Number.isInteger(t?.percent)||t.percent<0||t.percent>100?null:terrain*BigInt(t.percent)/100n;};
 if(value.loss!==null&&value.loss!==undefined){const loss=transfer(value.loss);if(loss===null||loss>capacity)return null;capacity-=loss;}
 for(const t of value.gains){const gain=transfer(t);if(gain===null)return null;capacity+=gain;}
 return capacity;
}
export function convoyProductionEstimate(d){
 const integer=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n?BigInt(v):null;
 const tdc=integer(d.production?.tdc),capacity=d.production?.colonies_included?convoyColonyCapacity(d.production.capacity_per_cycle):tdc,apples=integer(d.nbpomme_restant),wood=integer(d.nbmateriaux_restant);
 if(tdc===null||capacity===null||apples===null||wood===null)return {tdc,cycles:null,reason:'Données de capacité manquantes'};
 let harvested=0n;const projection=d.production?.projection;
 if(projection){
  if(projection.history_complete!==true||!Array.isArray(projection.segments))return {tdc,cycles:null,reason:'Historique de TdC incomplet depuis le point de départ'};
  for(const segment of projection.segments){const cycles=integer(segment.cycles),rate=convoyColonyCapacity(segment.capacity_per_cycle);if(cycles===null||rate===null)return {tdc,cycles:null,reason:'Historique de capacité illisible'};harvested+=cycles*rate;}
 }
 const remaining=apples+wood>harvested?apples+wood-harvested:0n;
 if(remaining>0n&&capacity===0n)return {tdc,cycles:null,reason:'Capacité de récolte nulle'};
 const cycles=remaining===0n?0n:(remaining+capacity-1n)/capacity;
 let finish_at=null,minutes=cycles*30n;
 if(projection&&cycles>0n){const anchor=Date.parse(projection.anchor_at),at=Date.parse(projection.calculated_at);const elapsed=integer(projection.elapsed_cycles);
  if(!Number.isFinite(anchor)||!Number.isFinite(at)||elapsed===null)return {tdc,cycles:null,reason:'Date de calcul indisponible'};
  const finish=anchor+Number(elapsed+cycles)*1800000;
  if(Number.isFinite(finish)&&Math.abs(finish)<=8640000000000000){finish_at=finish;minutes=BigInt(Math.max(0,Math.ceil((finish-at)/60000)));}
 }
 return {tdc,cycles,minutes,harvested,remaining,finish_at,capacity};
}
export function convoyProductionMinutes(minutes){const days=minutes/1440n,hours=minutes/60n%24n,rest=minutes%60n;return [days?days.toLocaleString('fr-FR')+' j':'',hours?hours+' h':'',rest?rest+' min':''].filter(Boolean).join(' ')||'0 min';}
export function convoyProductionDuration(cycles){return convoyProductionMinutes(cycles*30n);}
// END SHARED CALCULATOR

export function productionSummary(d,{detail=false}={}){
 if(!d.valide||d.fini||d.annulee)return '';
 let e;try{e=convoyProductionEstimate(d);}catch{return '⏱ Estimation indisponible';}
 const format=n=>n.toLocaleString('fr-FR'),stamp=value=>{const ms=typeof value==='number'?value:Date.parse(value);return Number.isFinite(ms)&&Math.abs(ms)<=8640000000000000?'<t:'+Math.floor(ms/1000)+':f>':null;};
 const lines=['🌿 TdC : '+(e.tdc===null?'inconnu':format(e.tdc)+' cm²')];
 if(e.cycles===null)lines.push('⏱ Estimation indisponible'+(detail&&e.reason?' · '+e.reason:''));
 else if(e.cycles===0n)lines.push('⏱ Production théorique suffisante · demande toujours ouverte');
 else lines.push('⏱ '+format(e.cycles)+' cycle'+(e.cycles===1n?'':'s')+' · ≈ '+convoyProductionMinutes(e.minutes)+(stamp(e.finish_at)?' · fin vers '+stamp(e.finish_at):''));
 const projection=d.production?.projection,capacity=d.production?.capacity_per_cycle;
 if(capacity?.assumed_rates||projection?.assumed_rates)lines.push('⚠️ Étable inconnue : taux de base de 20 %');
 if(detail){
  const base=stamp(projection?.anchor_at);if(base)lines.push('Référence : '+(projection.anchor_kind==='adjustment'?'dernier ajustement':'validation')+' '+base);
  if(e.capacity!==undefined)lines.push('Récolte nette théorique : '+format(e.capacity)+' ressources / cycle · colonies internes UPTEP');
  const asOf=stamp(projection?.calculated_at);if(asOf)lines.push('Calcul au '+asOf);
  lines.push('Cycle : 30 min · TdC entièrement exploité · chaque demande estimée séparément. Le restant réel et la clôture restent manuels.');
 }
 return lines.join('\n');
}
