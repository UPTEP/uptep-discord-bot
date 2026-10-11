import {Reports,reportCommands} from './reports.js';
import {Client,GatewayIntentBits,Events,PermissionFlagsBits,MessageFlags} from 'discord.js';
import {config} from './config.js';import {Api,Snapshot} from './api.js';import {State} from './state.js';import {UI,boardPayload} from './ui.js';
const cfg=config();const api=new Api(cfg);const snapshot=new Snapshot(api);const state=new State(cfg.dataDir);
const client=new Client({intents:[GatewayIntentBits.Guilds],allowedMentions:{parse:[]}});
let channel,board,refreshing,timer,stopping=false;
const key=cfg.guildId+':'+cfg.channelId;
async function refresh(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{const rows=await snapshot.get();const payload=boardPayload(rows);if(board)await board.edit(payload);else{board=await channel.send(payload);state.setBoard(key,board.id);}})();
 try{return await refreshing;}finally{refreshing=null;}
}
const ui=new UI({api,snapshot,state,refresh});
const reports=new Reports({api,state});
client.on(Events.InteractionCreate,async i=>{
 if(stopping)return;
 const slash=i.isChatInputCommand()&&reportCommands.some(c=>c.name===i.commandName);
 const reportComponent=i.customId?.startsWith('uptep:report');
 if(!slash&&!i.customId?.startsWith('uptep:'))return;
 // Only ephemeral responses created by this interaction expire; never delete the shared board.
 let cleanupTimer;
 for(const method of ['reply','editReply']){
  const original=i[method].bind(i);
  i[method]=async(...args)=>{
   const result=await original(...args);
   if(i.ephemeral===true){
    clearTimeout(cleanupTimer);
    const payload=args[0];
    const finished=typeof payload==='object' && payload?.content?.startsWith('✅ Opération enregistrée sur UPTEP');
    const advanced=finished || (typeof payload==='object' && (payload?.components?.length>0 || payload?.embeds?.length>0));
    // Delete only the bot's private source message after the next step has been displayed.
    // Keep it while a modal is open, or when validation fails, so the user can retry.
    if(advanced && i.message?.flags?.has(MessageFlags.Ephemeral) && i.message.author?.id===client.user.id){
     await i.webhook.deleteMessage(i.message.id).catch(()=>{});
    }
    cleanupTimer=setTimeout(()=>{i.deleteReply().catch(()=>{});},finished?10000:5*60*1000);
    cleanupTimer.unref();
   }
   return result;
  };
 }
 if(i.guildId!==cfg.guildId||i.channelId!==cfg.channelId){await i.reply({content:'Ce bouton n’est pas disponible sur ce serveur ou dans ce salon.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
 await (slash||reportComponent?reports:ui).handle(i).catch(e=>console.error('Réponse Discord impossible :',e.name));
});
client.once(Events.ClientReady,async()=>{
 try{
  if(cfg.clientId&&client.application.id!==cfg.clientId)throw new Error('Le token ne correspond pas à DISCORD_CLIENT_ID.');
  await api.request('/health');channel=await client.channels.fetch(cfg.channelId);
  if(!channel?.isTextBased()||channel.isDMBased()||channel.guildId!==cfg.guildId||channel.isThread())throw new Error('Salon textuel du serveur attendu.');
  const perms=channel.permissionsFor(client.user);if(!perms?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.EmbedLinks]))throw new Error('Permissions requises : voir le salon, envoyer, intégrer des liens et lire l’historique.');
  const saved=state.board(key);if(saved)board=await channel.messages.fetch(saved).catch(e=>{if(e.code===10008)return null;throw e;});
  if(board&&board.author.id!==client.user.id)throw new Error('Le message enregistré appartient à un autre compte.');
  if(!board){const messages=await channel.messages.fetch({limit:100});board=messages.find(m=>m.author.id===client.user.id&&m.embeds.some(e=>e.footer?.text?.startsWith('UPTEP_CONVOYS_V1')))??null;if(board)state.setBoard(key,board.id);}
  for(const command of reportCommands)await client.application.commands.create(command,cfg.guildId);
  console.log('Trois commandes slash de rapports enregistrées.');
  await refresh();timer=setInterval(()=>refresh().catch(e=>console.error('Actualisation impossible :',e.name)),60000);
  console.log('Bot connecté ; tableau prêt dans le salon configuré.');
 }catch(e){console.error('Démarrage impossible :',e.message);await client.destroy();process.exitCode=1;}
});
client.on(Events.Error,e=>console.error('Connexion Discord :',e.name));
async function stop(){stopping=true;clearInterval(timer);await client.destroy();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
client.login(cfg.token).catch(()=>{console.error('Connexion Discord refusée. Vérifier le token.');process.exitCode=1;});
