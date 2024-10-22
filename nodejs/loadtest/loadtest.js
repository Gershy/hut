'use strict';

require('../../room/setup/clearing/clearing.js');

// Requires "dev" maturity because needs to supply own hut id
if (conf('global.maturity') !== 'dev') throw Error('Api: "loadtest" feature requires "global.maturity" to be "dev"');

let cp = require('child_process');
let path = require('path');

let randFlt = () => Math.random();
let randInt = (min, max) => min + Math.floor(randFlt() * (max - min));

let InsulatedInstance = form({ name: 'InsulatedInstance', has: { Tmp }, props: (forms, Form) => ({
  
  init({ name, conf, server, sc }) {
    
    forms.Tmp.init.call(this);
    
    sc = sc.kid('loadtest');
    Object.assign(this, {
      name, conf, server, sc, proc: null,
      initialized: Promise.later(), ready: Promise.later()
    });
    
    this.sc.note('running', { name, conf, server });
    
    let procSc = this.sc.kid('ipc');
    this.proc = cp.fork(path.join(__dirname, 'foundationBelow.js'), [ name, valToJson(conf) ], {});
    this.proc.on('message', async m => {
      
      let { scope, msg } = m;
      
      if (msg === 'init') return this.initialized.resolve();
      if (msg === 'ready') return this.ready.resolve();
      
      if (msg?.type === 'subcon') return procSc.note(...msg.subconArgs);
      
      if (msg?.type === 'room') {
        this.sc.head('roomRequest', { request });
        let room = token.dive(msg?.room);
        let cmpKeep = await getCmpKeep('below', room);
        let content = await cmpKeep.getData('utf8');
        this.proc.send({ scope: 'foundation', msg: { type: 'room', room: room.join('.'), content } });
        this.sc.tail('roomRequest', { room, contentLength: content.count() });
      }
      
    });
    this.proc.on('exit', () => this.end());
    
    this.ready.then(() => this.server.makeSession(this));
    
  },
  desc() {
    return `${getFormName(this)}(${this.name})`;
  },
  cleanup() {
    
    this.proc.send = () => {};
    
    try         { this.proc.disconnect(); }
    catch (err) { err.suppress(); }
    
  }
  
})});

let makeRoadAuth = ({ getSessionKey }) => {
  
  let serverOpen = async (security=null, adjacentServerPrms={}) => {
    
    // - `security` is `{ prv, crt }` or `null`
    // - `adjacentServerPrms` looks like `{ [protocolName]: Promise }`
    //   where each Promise represents the opening of another Server on
    //   the same port (resolves when the adjacent Server has begun
    //   listening; resolves to that Server Object)
    
    if (tmp.off()) return;
    
  };
  let serverShut = async () => {};
  let makeSession = insulatedInstance => {
    
    let key = getSessionKey({ trn: 'sync', hid: insulatedInstance.name });
    let session = Tmp({
      key,
      insulatedInstanceName: insulatedInstance.name,
      desc: () => `IpcSession(${key} -> ${insulatedInstance.desc()})`,
      currentCost: () => 0.001,
      timeout: null,
      netAddr: 'localhost',
      hear: Src(),
      tell: Src()
    });
    
    let hearFn = incomingMsg => {
      
      let { scope, msg } = incomingMsg ?? {};
      if (scope === 'road') session.hear.send({ replyable: null, ms: getMs(), msg });
      
    };
    insulatedInstance.proc.on('message', hearFn);
    session.endWith(() => insulatedInstance.proc.off('message', hearFn));
    
    session.endWith(session.tell.route(outgoingComm => {
      
      insulatedInstance.proc.send({ scope: 'road', msg: outgoingComm }, err => {
        if (!err) return;
        err.suppress();
        gsc.say(`Error doing IPC; ending ${insulatedInstance.desc()} (${err.message})`);
        insulatedInstance.end();
      });
      
    }));
    
    then(insulatedInstance.initialized, () => tmp.src.send(session));
    
    return session;
    
  };
  
  let tmp = Tmp({
    desc: () => 'ipc://localhost:0',
    protocol: 'ipc', netProc: 'localhost:0', netAddr: 'localhost', port: 0,
    makeSession, serverOpen, serverShut,
    src: Src(), // Sends `session` Objects
    server: null,
    closing: false,
    sockets: null
  });
  tmp.endWith(() => serverShut());
  return tmp;
  
};

module.exports = async ({ aboveHut, netIden, instancesKeep, getServerSessionKey, loadtest={}, sc }) => {
  
  // When run, we'll manage a series of child processes which pretend to
  // be BelowHuts performing random actions
  
  sc = sc.kid('loadTest');
  
  let TimerSrc = await getRoom('logic.TimerSrc');
  
  let { durationMs=5*60*1000, maxInstances=300 } = loadtest;
  let { minTtlMs=240*1000, maxTtlMs=600*1000 } = loadtest;
  let { minSpawnMs=200, maxSpawnMs=5000 } = loadtest;
  
  let roadAuth = makeRoadAuth({ getSessionKey: getServerSessionKey });
  
  return {
    roadAuth,
    run: () => {
      
      let tmp = Tmp();
      
      let instances = Set();
      let spawnInstance = () => {
        
        let lifetimeSc = sc.kid('life');
        let name = String.id(8);
        let belowKeep = instancesKeep.access(name);
        let inst = InsulatedInstance({
          name,
          conf: {
            insulatedFileKeeps: {
              repo: keep('[file:repo]').desc(),
              below: belowKeep.desc(),
            },
            hid: name,
            ...aboveHut.getBelowConf(),
          },
          server: roadAuth
        });
        
        // Kill `inst` after `ms` elapses
        let timerSrc = TimerSrc({ ms: randInt(minTtlMs, maxTtlMs), num: 1 });
        inst.endWith(timerSrc);
        timerSrc.route(() => inst.end());
        
        instances.add(inst);
        lifetimeSc.head({ instance: inst, totalInstances: instances.size });
        
        inst.endWith(() => {
          instances.rem(inst);
          belowKeep.rem();
          lifetimeSc.tail({ totalInstances: instances.size });
        });
        
      };
      tmp.endWith(() => instances.each(inst => inst.end()));
      
      let spawnInstancesRandomlyTmp = (() => {
        
        let tmp = Tmp();
        
        // When to spawn a new instance
        let timeout = null;
        let resetTimeout = () => {
          
          // Spawn an instance if there's room
          if (instances.size < maxInstances) spawnInstance();
          
          // Random timeout until next instance spawns
          timeout = setTimeout(() => { resetTimeout(); }, randInt(minSpawnMs, maxSpawnMs));
          
        };
        resetTimeout();
        
        tmp.endWith(() => clearTimeout(timeout));
        
        return tmp;
        
      })();
      
      tmp.endWith(spawnInstancesRandomlyTmp);
      
      //// Loadtest for given duration
      //setTimeout(() => tmp.end(), durationMs);
      
      return tmp;
      
    }
  };
  
};
