'use strict';
const {HomeyAPI}=require('homey-api');
const KEY='houseguard.api-key.v1';
const allowed=(scopes,scope)=>Array.isArray(scopes)&&scopes.some(s=>typeof s==='string'&&(s===scope||scope.startsWith(s+'.')));
// Never return the key, client, headers or upstream error text to the UI/log.
class DirectApi {
  #key='';#client=null;#generation=0;#busy=false;
  constructor(homey,factory=opts=>HomeyAPI.createLocalAPI(opts)){this.homey=homey;this.factory=factory;this.ready=false;this.checkedAt=null;this.problem='';}
  get configured(){return !!this.#key;}
  status(){return {configured:this.configured,ready:this.ready,checkedAt:this.checkedAt,problem:this.problem};}
  async candidate(key){
    if(typeof key!=='string'||key.length<20||key.length>1024||/\s/.test(key))throw Error('Lim inn hele API-nøkkelen uten mellomrom.');
    let client;
    try{client=await this.factory({address:await this.homey.api.getLocalUrl(),token:key});
      const session=await client.sessions.getSessionMe({$cache:false,$timeout:10000});
      if(!allowed(session.intersectedScopes,'homey.flow'))throw Error('scope');
      return client;
    }catch(error){await client?.destroy?.();throw Error(error.message==='scope'?'Nøkkelen trenger Flows-tilgang, inkludert kjøring av Flow-kort. Bare «Start Flows» er ikke nok.':'API-nøkkelen kunne ikke kontrolleres. Kontroller nøkkelen og forbindelsen til Homey.');}
  }
  async initialize(){this.#key=this.homey.settings.get(KEY)||'';if(!this.#key)return;try{this.#client=await this.candidate(this.#key);this.ready=true;}catch(error){this.problem=error.message;}this.checkedAt=Date.now();}
  async configure(input){
    if(this.#busy)throw Error('En nøkkelkontroll pågår. Vent til den er ferdig.');
    if(typeof input!=='string')throw Error('API-nøkkel må være tekst.');
    this.#busy=true;let next;
    try{const key=input.trim();next=key?await this.candidate(key):null;
      this.onChange?.();this.homey.settings.set(KEY,key);const old=this.#client;this.#key=key;this.#client=next;this.#generation++;this.ready=!!next;this.checkedAt=Date.now();this.problem='';Promise.resolve(old?.destroy?.()).catch(()=>{});return this.status();
    }finally{this.#busy=false;}
  }
  async check(){if(!this.configured)throw Error('Ingen API-nøkkel er lagt inn.');return this.configure(this.#key);}
  async call(operation,guard,onDispatch=()=>{}){
    if(!this.ready||!this.#client)throw Error('Direkte API-forbindelse er ikke klar. Kontroller nøkkelen under Mer.');
    const client=this.#client,generation=this.#generation;
    guard();if(generation!==this.#generation)throw Error('API-forbindelsen ble endret.');onDispatch();
    try{return await operation(client);}catch(error){
      if(client===this.#client&&[401,403].includes(error.statusCode||error.status)){this.ready=false;this.problem='API-tilgangen ble avvist. Kontroller nøkkelen under Mer.';}
      throw Error('Direkte Homey-kall feilet eller fikk ukjent utfall. Ingen ny sending er forsøkt. Kontroller API-nøkkelen og hendelsesloggen.');
    }
  }
  async close(){this.#generation++;await this.#client?.destroy?.();this.#client=null;this.ready=false;}
}
module.exports={DirectApi,KEY,allowed};
