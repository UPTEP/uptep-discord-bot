import path from 'node:path';
export function config(env=process.env){
 const missing=['DISCORD_TOKEN','DISCORD_GUILD_ID','CONVOY_CHANNEL_ID','UPTEP_API_TOKEN'].filter(k=>!env[k]);
 if(missing.length)throw new Error('Configuration manquante dans .env : '+missing.join(', '));
 for(const k of ['DISCORD_GUILD_ID','CONVOY_CHANNEL_ID'])if(!/^\d{17,20}$/.test(env[k]))throw new Error(k+' invalide dans .env');
 const apiUrl=env.UPTEP_API_URL??'https://uptep.top/api/bot/v1';
 if(apiUrl!=='https://uptep.top/api/bot/v1')throw new Error('UPTEP_API_URL doit être https://uptep.top/api/bot/v1');
 return {token:env.DISCORD_TOKEN,clientId:env.DISCORD_CLIENT_ID||null,guildId:env.DISCORD_GUILD_ID,channelId:env.CONVOY_CHANNEL_ID,apiUrl,apiToken:env.UPTEP_API_TOKEN,dataDir:path.resolve(env.BOT_DATA_DIR??'data')};
}
