'use strict';

Object.assign(global, { rooms: Object.create(null) });
require('../../room/setup/clearing/clearing.js');

process.on('uncaughtException', err => process.exit());
process.on('unhandledRejection', err => process.exit());

let unscopedEval = (...args) => Promise.resolve().then(() => eval(...args));

let scopedMsgSrcs = Object.plain();
let scopedMsgSrc = scope => scopedMsgSrcs[scope] ?? (scopedMsgSrcs[scope] = Src());
process.on('message', m => {
  let { scope, msg } = m ?? {};
  scopedMsgSrc(scope).send(msg);
});

let setupFoundation = async (name, conf) => {
  
  let { rootTransaction, Filepath, FsKeep } = require('../filesys.js');
  
  (async () => {
    global.subconOutput = (sc, ...args) => thenAll(args.map(v => hasForm(v, Function) ? v() : v), args => {
      
      let { chatter=true } = global.subconParams(sc);
      if (!chatter) return;
      
      process.send({ scope: 'foundation', msg: { type: 'subcon', subconArgs: [ sc.term, ...args ] } });
      
    });
    global.subconOpts = sc => ({ output: { inline: 1, therapist: 0 } });
  })();
  
  // Enable `global.keep`
  // - Requires `hutKeep`
  await (async () => {
    
    let RootKeep = form({ name: 'RootKeep', has: { Keep }, props: (forms, Form) => ({
      
      init(map) { Object.assign(this, { map: Object.plain(map) }); },
      access(prop) {
        if (prop[0] === '[') prop = prop.slice(1, -1);
        if (!this.map[prop]) return this; // Dummy behaviour!!
        return this.map[prop];
      }
      
    })});
    
    let rootFsKeep = FsKeep(rootTransaction, Filepath([]));
    let rootKeep = RootKeep({
      'file': rootFsKeep,
      'file:root': rootFsKeep
    });
    
    // Repo and src-code are reused from the parent process
    rootKeep.map['file:repo'] = rootKeep.seek(conf.insulatedFileKeeps.repo);
    rootKeep.map['file:code:src'] = rootKeep.seek('[file:repo].room');
    
    // Mill and cmp-code are dedicated to this child 
    rootKeep.map['file:mill'] = rootKeep.seek(conf.insulatedFileKeeps.below);
    rootKeep.map['file:code:cmp'] = rootKeep.seek('[file:mill].cmp');
    
    global.keep = (diveToken) => rootKeep.seek(token.dive(diveToken));
    
  })();
  
  // Enable `global.conf
  await (async () => {
    
    let mainConf = conf;
    global.conf = (diveToken, def=null) => {
      
      // Resolve nested Arrays and period-delimited Strings
      let dive = token.dive(diveToken);
      let ptr = mainConf;
      for (let pc of dive) {
        if (!isForm(ptr, Object) || !ptr.has(pc)) return def;
        ptr = ptr[pc];
      }
      return ptr;
      
    };
    
  })();
  
  let roomPrms = Object.plain();
  
  scopedMsgSrc('foundation').route(async msg => {
    
    if (msg.type !== 'room') return;
    
    let { room, content } = msg;
    if (!roomPrms[room]) gsc(`OOAOSDASDMMMmmSMNagghh: ${room}`);
    
    await unscopedEval(content);
    let result = global.rooms[room];
    if (!result) throw Error(`Room "${name}" does not set global.rooms['${name}']!`);
    if (!hasForm(result, Function)) throw Error(`Dang, room "${name}" doesn't define a global Function`);
    
    then(result(), result => {
      roomPrms[room].resolve(result);
      roomPrms[room] = result;
    });
    
  });
  
  global.getRooms = (names, { shorten=true, ...opts }={}) => {
    
    let err = Error('trace');
    return thenAll(names.toObj(name => {
      
      if (!roomPrms[name]) {
        roomPrms[name] = Promise.later();
        process.send({ scope: 'foundation', msg: { type: 'room', room: name } });
      }
      
      let resultName = shorten ? name.split('.').slice(-1)[0] : name;
      return [ resultName, roomPrms[name] ];
      
    }));
    
  };
  
  // Enable `global.real`
  await (async () => {
    
    let FakeReal = form({ name: 'FakeReal', has: { Tmp }, props: (forms, Form) => ({
      init({ name, tech }) {
        forms.Tmp.init.call(this);
        Object.assign(this, {
          name, tech,
          fakeLayout: null,
          params: { textInputSrc: { mod: Function.stub, route: fn => fn(''), send: Function.stub }}
        });
      },
      loaded: Promise.resolve(),
      setTree() {},
      addReal(real) { return this; },
      mod() {},
      addLayout: lay => Tmp({ layout: { src: Src.stub, route: Function.stub } }),
      getLayout() { return this.fakeLayout || (this.fakeLayout = this.getLayoutForm('FakeBoi')()); },
      getLayoutForm(name) { return this.tech.getLayoutForm(name); },
      getTech() { return this.tech; },
      addNavOption() { return { activate: () => {} }; },
      render() {}
    })});
    let FakeLayout = form({ name: 'FakeLayout', has: { Src }, props: (forms, Form) => ({
      init() { forms.Src.init.call(this); this.keysSrc = Src.stub; },
      isInnerLayout() { return false; },
      setText(){},
      addReal(){},
      src: Src.stub
    })});
    
    let fakeLayout = FakeLayout();
    let fakeReal =  global.real = FakeReal({ name: 'nodejs.fakeReal', tech: {
      render: Function.stub,
      informNavigation: Function.stub,
      getLayoutForm: name => fakeLayout,
      getLayoutForms: names => names.toObj(name => [ name, fakeReal.getLayoutForm(name) ]),
      render: Function.stub
    }});
    
  })();
  
};
let makeIpcServer = ({ aboveHut, belowHut, procConnectedToAbove }) => {
  
  let server = Tmp({
    protocol: 'ipc', netProc: 'localhost:0',
    desc: () => 'ipc://localhost:0',
    src: Src()
  });
  
  let session = Tmp({ key: '!above', currentCost: () => 0.001, tell: Src(), hear: Src() });
  server.endWith(session, 'tmp');
  
  // Convert incoming ipc messages to Hears
  scopedMsgSrc('road').route(msg => {
    session.hear.send({ replyable: null, ms: getMs(), msg });
  });
  
  // Convert outgoing ipc messages to Tells
  session.tell.route(msg => procConnectedToAbove.send({ scope: 'road', msg }));
  
  soon(() => server.src.send(session));
  
  return server;
  
};

(async () => {
  
  process.send({ scope: 'foundation', msg: 'init' });
  
  let [ name, conf ] = process.argv.slice(2);
  conf = jsonToVal(conf);
  
  await setupFoundation(name, conf);
  
  // `global` is set up... now run a Hut based on settings
  let { hut, record, WeakBank, ...loftObj } = await global.getRooms([
    'setup.hut',
    'record',
    
    // TODO: Maybe something like localstorage could allow BELOW to
    // work with KeepBank? (Would be blazing-fast client-side!!)
    'record.bank.WeakBank',
    global.conf('deploy.loft.name')
  ]);
  
  let { hid: belowHid, aboveHid, deploy: { uid, host } } = global.conf();
  let { heartbeatMs } = host;
  
  let bank = WeakBank({ sc: global.subcon('bank') });
  let recMan = record.Manager({ bank });
  
  let aboveHut = hut.AboveHut({ hid: aboveHid, isHere: false, recMan, heartbeatMs });
  let belowHut = aboveHut.makeBelowHut(belowHid);
  belowHut.isLoadtestBot = true;
  
  let server = makeIpcServer({ aboveHut, belowHut, procConnectedToAbove: process });
  server.src.route(session => {
    // TODO: `seenOnRoad` no longer exists!! Use `getBelowHutAndRoad` instead??
    belowHut.seenOnRoad(server, session);
    session.hear.route(({ ms, msg }) => {
      aboveHut.tell({ trg: belowHut, road: session, ms, msg });
    });
  });
  
  let loft = loftObj.toArr(v => v)[0];
  await loft.open({ sc: global.subcon('loft'), hereHut: belowHut, rec: aboveHut });
  
  process.send({ scope: 'foundation', msg: 'ready' });
  
})()
  .catch(err => {
    console.log('FATAL', err);
  });

