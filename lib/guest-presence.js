'use strict';
const {presence,deriveMode}=require('./policy');
const retired=id=>['guestOn','guestOff'].includes(id);
const activeRoutines=config=>config.routines.filter(r=>r.enabled && !retired(r.id));

function change(engine,value,beforeActions=()=>{}){
  if(typeof value!=='boolean')throw Error('Gjestemodus må være av/på');
  if(engine.state.guest===value)return false;
  const residents=presence(engine.config,engine.snapshot.people || {},engine.clock());
  engine.state.guest=value;
  engine.state.guestGeneration=(engine.state.guestGeneration || 0)+1;
  engine.state.manualNight=false;
  engine.cancel(r=>r.context.guestArrival || ['guestNotice','guestActivated','guestDeactivated'].includes(r.routineId) || (value && ['away','night','arming','entryDelay'].includes(r.routineId)), 'Ventende handling avbrutt fordi gjestetilstedeværelsen endret seg');
  if(engine.state.welcomeGuestGeneration){engine.state.welcomeUntil=0;engine.state.welcomeGuestGeneration=null;}
  if(value && engine.state.question && !engine.state.question.decided)engine.state.question.decided='cancelled';
  beforeActions(); // Disarm before new arrival actions are queued.
  const mode=deriveMode(engine.facts());engine.state.mode=mode.mode;engine.state.reason=mode.reason;
  const context={guestArrival:true,guestGeneration:engine.state.guestGeneration};
  engine.start('guestNotice',{noticeKind:value?'enabled':'disabled',guestGeneration:engine.state.guestGeneration});
  if(value){
    if(engine.snapshot.connected && residents.allAway){
      engine.start('home',context,engine.config.delays.home);
      if(engine.config.security.autoUnlock)engine.start('arrivalUnlock',context);
      engine.state.welcomeUntil=engine.clock()+10*60000;
      engine.state.welcomeGuestGeneration=engine.state.guestGeneration;
    }else if(!residents.someHome)engine.log('Gjestemodus er på. Hjemkomst og opplåsing hoppes over fordi beboernes tilstedeværelse ikke er bekreftet.',{result:'skipped'});
  }else if(engine.snapshot.connected){
    if(residents.allAway)engine.start('away',{},engine.config.delays.away);
    else if(residents.allHomeAsleep)engine.start('night');
  }
  engine.start(value?'guestActivated':'guestDeactivated',{guestGeneration:engine.state.guestGeneration});
  engine.log(`Gjestemodus ${value?'på':'av'}`);engine.save();return true;
}
module.exports={change,retired,activeRoutines};
