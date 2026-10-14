import {spawn} from 'node:child_process';
import {terrainPrompt} from './src/terrain.js';

// Run as uptep-codex inside the systemd service, never via sudo from uptep.
export function protectedAnalyze(messages){
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/local/libexec/uptep-terrain-codex',['gpt-6-luna'],{
   stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}
  });
  let output='',failed=false;
  const stop=()=>{failed=true;child.kill('SIGTERM');};
  const timer=setTimeout(stop,540000);timer.unref();
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2000000)stop();});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Service Codex indisponible.'));});
  child.on('close',code=>{
   clearTimeout(timer);
   if(failed||code!==0)return reject(new Error('Codex n’a pas terminé l’analyse. Réessaie plus tard.'));
   try{resolve(JSON.parse(output));}catch{reject(new Error('Réponse Codex invalide.'));}
  });
  child.stdin.end(terrainPrompt(messages));
 });
}
