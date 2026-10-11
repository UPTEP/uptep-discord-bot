// Deterministic coverage of the game's standard reports. Each occurrence has its own ID.
const amount='([0-9]+(?:[ \\u00a0\\u202f][0-9]{3})*)';
const number=s=>s.replace(/[ \u00a0\u202f]/g,'');
const key=s=>s.normalize('NFC').trim().toLocaleLowerCase('fr');
export function terrainEvidence(messages){
 const events=[],notes=[],recognized=[],duplicateSources=[],seenReports=new Map();
 for(const message of messages){
  const text=message.text;
  // Only identical entire dated messages can be collapsed automatically, never attack lines.
  const signature=JSON.stringify([message.author??message.name??message.id,text.replace(/\s+/g,' ').trim()]);
  if(/\d{2}\/\d{2}\/\d{2,4}/.test(text)&&seenReports.has(signature)){
   duplicateSources.push(message.id);notes.push(`Message ${message.id} : recopie intégrale du message ${seenReports.get(signature)}, comptée une seule fois.`);continue;
  }
  seenReports.set(signature,message.id);
  const candidates=[];
  const add=(match,kind,direction,n,enemy)=>candidates.push({id:message.id+':'+match.index,source_id:message.id,start:match.index,end:match.index+match[0].length,quote:match[0],kind,direction,amount:number(n),enemy:enemy.trim()});
  for(const m of text.matchAll(new RegExp('(?:Butin chez|Vol par) ([^\\n:]+)\\s*:\\s*'+amount+'\\s*cm[²2]','gi')))add(m,'title',/^Butin/i.test(m[0])?'gain':'loss',m[2],m[1]);
  for(const m of text.matchAll(new RegExp('Vos fourmis ont conquis\\s+'+amount+'\\s*cm[²2] lors de leur derni[èe]re bataille\\.\\s*Ces terres appartenaient [àa] ([^\\n.!]+)[.!]?','gi')))add(m,'detail','gain',m[1],m[2]);
  for(const m of text.matchAll(new RegExp('(?:^|(?<=\\n))([^\\n:]+?) vous a pris\\s+'+amount+'\\s*cm[²2] lors de sa derni[èe]re attaque[.!]?','gim'))){
   // A pasted timestamp may precede the player's name on the same line.
   const enemy=m[1].replace(/^(?:\d{2}\/\d{2}\/\d{2,4}\s*)?(?:\d{1,2}h\d{2}\s*)?/,'').trim();
   if(enemy)add(m,'detail','loss',m[2],enemy);
  }
  candidates.sort((a,b)=>a.start-b.start);recognized.push(...candidates);
  let group=[];
  const flush=()=>{
   if(!group.length)return;
   const title=group[0].kind==='title'?group[0]:null;
   const details=group.filter(c=>c.kind==='detail');
   if(!title){events.push(...details);group=[];return;}
   const same=details.filter(c=>c.direction===title.direction&&key(c.enemy)===key(title.enemy));
   const other=details.filter(c=>!same.includes(c));
   const sum=same.reduce((s,c)=>s+BigInt(c.amount),0n),total=BigInt(title.amount);
   if(sum>=total&&same.length){
    events.push(...same,...other);
    if(sum>total)notes.push(`Message ${message.id} : le titre de ${title.amount} cm² est inférieur aux lignes (${sum} cm²). Les lignes explicites sont retenues une fois chacune ; le titre n’est pas ajouté.`);
   }else{
    events.push(title,...other);
    if(same.length)notes.push(`Message ${message.id} : détail incomplet (${sum}/${total} cm²), total du titre retenu une seule fois.`);
   }
   group=[];
  };
  for(const c of candidates){if(c.kind==='title')flush();group.push(c);}flush();
 }
 return {events,notes,recognized,duplicateSources};
}
