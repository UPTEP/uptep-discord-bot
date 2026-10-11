import {config} from './config.js';import {Api} from './api.js';
try{const c=config();const api=new Api(c);await api.request('/health');await api.demands();console.log('Configuration et lecture API : OK. Aucun message Discord envoyé.');}catch(e){console.error(e.message);process.exitCode=1;}
