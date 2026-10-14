import {Client,Events,GatewayIntentBits,MessageFlags} from 'discord.js';
import {Api} from './src/api.js';
import {Terrain,TERRAIN_USER,terrainCommand} from './src/terrain.js';
import {InteractionGuard} from './guard.js';
import {protectedAnalyze} from './codex.js';
const env=process.env;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','UPTEP_API_TOKEN'])if(!env[key])throw Error('Configuration protégée incomplète.');
const client=new Client({intents:[GatewayIntentBits.Guilds],allowedMentions:{parse:[]}});
const api=new Api({apiUrl:'https://uptep.top/api/bot/v1',apiToken:env.UPTEP_API_TOKEN});
const terrain=new Terrain({guildId:env.DISCORD_GUILD_ID,api,analyze:protectedAnalyze});
const guard=new InteractionGuard({applicationId:env.DISCORD_CLIENT_ID,guildId:env.DISCORD_GUILD_ID,ownerId:TERRAIN_USER,file:'/var/lib/uptep-codex/terrain-service/interactions.json'});
let stopping=false;
client.on(Events.InteractionCreate,async i=>{
 if(stopping||!i.isChatInputCommand()||i.commandName!=='solde-terrain')return;
 // Identity is supplied directly by Discord over the service's own TLS Gateway.
 if(i.user.id!==TERRAIN_USER||i.guildId!==env.DISCORD_GUILD_ID||i.applicationId!==env.DISCORD_CLIENT_ID){
  await i.reply({content:'Commande réservée à NoobEnCDI.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;
 }
 try{if(!guard.claim(i))return;await terrain.handle(i);}catch{console.error('Commande terrain interrompue.');}
});
client.once(Events.ClientReady,async()=>{
 try{
  if(client.application.id!==env.DISCORD_CLIENT_ID)throw Error('Application inattendue');
  await api.request('/health');
  await client.application.commands.create(terrainCommand,env.DISCORD_GUILD_ID);
  console.log('Service terrain protégé connecté à Discord ; propriétaire vérifié à chaque commande.');
 }catch{console.error('Initialisation protégée impossible.');await client.destroy();process.exit(1);}
});
client.on(Events.Error,()=>console.error('Connexion Discord protégée interrompue.'));
async function stop(){stopping=true;await client.destroy();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
client.login(env.DISCORD_TOKEN).catch(()=>{console.error('Connexion Discord protégée refusée.');process.exit(1);});
