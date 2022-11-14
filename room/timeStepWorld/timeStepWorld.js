global.rooms['timeStepWorld'] = async foundation => {
  
  let { MemSrc, TimerSrc, record: { Record: Rec } } = await foundation.getRooms([
    'logic.MemSrc',
    'logic.TimerSrc',
    'record'
  ]);
  
  let fa = (protos, methodName, fn) => { // "form all"
    
    let pfns = protos.toArr(proto => {
      
      // Ignore Protos that don't define `methodName`
      if (!proto.has(methodName)) return skip;
      
      let pfn = proto[methodName];
      if (!hasForm(pfn, Function)) return skip; // Ignore non-Function props
      if (pfn['~noFormCollision']) return skip; // Ignore Function props with `~noFormCollison` set
      
    });
    return function(...args) {
      
      let protoResults = pfns.map(pfn => pfn.call(this, ...args));
      return fn(this, protoResults, ...args);
      
    };
    
  };
  
  let Entity = U.form({ name: 'Entity', has: { Rec }, props: (forms, Form) => ({
    
    // TODO: This is SO JANKY, but doesn't look like there's another way
    // to achieve the same effect (preventing conflicting prop names).
    // Note that this is awkward to maintain; properties may be renamed,
    // added or removed from U.logic.Endable, U.logic.Src, and
    // foundation.getRoom('record').Rec - in such cases, this list would
    // need to be altered as well! The missing ingredient to implement
    // this correctly is information available on Forms (not on Facts)
    // indicating what instance properties will be assigned to the Fact.
    // Having that feature would enable a ton of metaprogramming
    // improvements too, but probably make Form definition much more
    // cumbersome.
    $conflictPropNames: new Set('cleanup,onn,fns,type,uid,mems,relSrcs,valSrc,allMemsTmp'.split(',')),
    $rpnFn: function(rpn) { // RelProp Function
      return (ws=null) => {
        let uid = this.getValue()[rpn]; // RelProps are always synced so look in `this.getValue()`
        if (!uid) return null;
        if (!ws.entities) console.log(ws);
        return ws.entities[uid] || null;
      };
    },
    
    initProps: function(val) { return val; }, // TODO: Necessary to pick props from `val`??
    syncProps: function() { return []; },
    relProps: function() { return []; },
    init: function(rt, uid, mems, val) {
      
      if (!val) throw Error(`${U.getFormName(this)} missing "val" param`);
      
      // Get props, and list of sync prop names
      let props = this.initProps(val);
      if (!U.isForm(props, Object)) throw Error(`${U.getFormName(this)}.prototype.initProps should return Object; get ${U.getFormName(props)}`);
      
      // Prevent any properties whose names conflict with the member
      // properties of Rec (and Endable and Tmp, inherited by Rec).
      for (let k in props) if (this[k] !== C.skip || Form.conflictPropNames.has(k))
        throw Error(`Conflicting prop name for ${U.getFormName(this)}: "${k}"`);
      
      // Move properties from `props` to `syncProps` as appropriate
      let syncProps = {};
      let sProps = this.syncProps();
      if (Set(sProps).size !== sProps.length) throw Error(`${U.getFormName(this)} defines sync properties multiple times (potentially through polymorphism)`);
      for (let spn of sProps) if (!props.has(spn)) throw Error(`${U.getFormName(this)} missing sync prop "${spn}"`);
      for (let spn of sProps) { syncProps[spn] = props[spn]; delete props[spn]; }
      
      let relProps = {};
      let rProps = this.relProps();
      if (Set(rProps).count() !== rProps.count()) throw Error(`${U.getFormName(this)} defines rel properties multiple times (potentially through polymorphism)`);
      for (let rpn of rProps) if (!props.has(rpn)) throw Error(`${U.getFormName(this)} missing rel prop "${rpn}");`);
      for (let rpn of rProps) { relProps[rpn] = props[rpn]; delete props[rpn]; }
      
      // Attach all local properties
      Object.assign(this, props);
      
      // Define getter+setter for synced properties
      for (let spn in syncProps) Object.defineProperty(this, spn, {
        get: function() { return this.getValue()[spn]; },
        set: function(v) { if (v !== v) { console.log(foundation.formatError(Error(`${U.getFormName(this)}.${spn} = NaN;`))); process.exit(0); } this.mod({ [spn]: v }); },
        enumerable: true,
        configurable: true
      });
      
      // TODO: Technically RelProp and SyncProp have no connection to
      // each other. I am assuming that RelProp uids will not ever
      // change rapidly, and will therefore produce little sync noise,
      // therefore it's safe to consider every RelProp a SyncProp too.
      // Each RelProp is a Function which returns the related Entity
      // given a WorldState
      for (let rpn in relProps) Object.defineProperty(this, rpn, {
        get: Form.rpnFn.bind(this, rpn), // So e.g. `ParEnt(...).child(ws) === ChildEnt(...)`
        set: function(entity) { return this.mod({ [rpn]: entity && (U.isForm(entity, String) ? entity : entity.uid) }); },
        enumerable: true,
        configurable: true
      });
      
      // Initialize as Rec using sync properties
      // TODO: Move this to happen before any `syncProps` get set? That
      // would prevent any need for `Form.conflictPropNames`...
      
      forms.Rec.init.call(this, rt, uid, mems, {
        form: U.getFormName(this),
        ...syncProps,
        ...relProps.map( v => v && (U.isForm(v, String) ? v : v.uid) )
      });
      
    },
    getAgeMs: function(ws) { return ws.ms - this.ms; },
    doStep: C.noFn('doStep', ws => [ { wa: 'wa1', params: {} }, { wa: 'wa2', params: {} } ]),
    getState: C.noFn('getState', ws => {})
    
  })});
  
  let TreeEntity = U.form({ name: 'TreeEntity', has: { Entity }, props: (forms, Form) => ({
    getParNode: function(ws) { return null; },
  })});
  
  let GeomEntity = U.form({ name: 'GeomEntity', has: { TreeEntity }, props: (forms, Form) => ({
    
    initProps: fa(forms, 'initProps', (i, arr, val) => {
      
      let { x=0, y=0 } = val;
      let a = { x, y };
      return ({}).gain(...arr, { a });
      
    }),
    syncProps: fa(forms, 'syncProps', (i, arr) => ([]).gain(...arr, 'a'.split(','))),
    
    getRelGeom: C.noFn('getRelGeom'), // Returns bounding position relative to ParNode
    getGeom: function(ws) {
      
      let relGeom = this.getRelGeom(ws);
      let parNode = this.getParNode(ws);
      if (!parNode) return relGeom;
      
      let parGeom = parNode.getGeom(ws);
      return { ...relGeom, x: relGeom.x + parGeom.x, y: relGeom.y + parGeom.y };
      
    },
    getState: function(ws) { return { geom: this.getGeom(ws) }; }
    
  })});
  
  let World = U.form({ name: 'World', has: { Entity }, props: (forms, Form) => ({
    
    initProps: fa(forms, 'initProps', (i, arr, val) => {
      
      let { ms=foundation.getMs(), lastMs=ms, hut=null, huts=[], random=null, fps=60, updFps=fps, rndFps=60 } = val;
      
      /// {ABOVE=
      if (hut    === null) throw Error(`${U.getFormName(i)} requires "hut" param`);
      if (random === null) throw Error(`${U.getFormName(i)} requires "random" param`);
      /// =ABOVE}
      
      return ({}).gain(...arr, { hut, huts, random, ms, lastMs, fps, updFps, rndFps });
      
    }),
    syncProps: fa(forms, 'initSyncs', (i, arr) => ([]).gain(...arr, [ 'ms' ])),
    
    /// {ABOVE=
    init: function(...args) {
      
      forms.Entity.init.call(this, ...args);
      
      // Immediately create controllers for any relevant huts
      let [ pfx ] = this.type.name.split('.');
      for (let hut of this.huts) {
        let controller = hut.addRecord(`${pfx}.controller`, [ this, hut ], { ctrlVals: this.getInitCtrlSet() });
        controller.ctrls = controller.getValue().ctrlVals.map( v => ({ mag: 0, ms: 0, lastMs: 0 }) );
      }
      
      // Do initialization
      let initWs = this.genWs(0);
      this.doInit(initWs);
      this.consumeActions(initWs);
      
      // Initialize update loop
      let mspf = 1000 / this.updFps;
      
      let timerSrc = TimerSrc({ ms: mspf, num: Infinity });
      this.endWith(timerSrc);
      timerSrc.route(({ dms }) => {
        let ws = this.genWs(dms);
        this.doStep(ws);
        this.consumeActions(ws);
      });
      
    },
    genWs: function(dms) { // "world state"
      
      let [ pfx ] = this.type.name.split('.');
      return {
        ms: foundation.getMs() - this.ms,
        dms,
        fps: this.updFps,
        spf: 1 / this.updFps,
        random: this.random,
        entities: this.relRecs(`${pfx}.entity`).toObj(ent => [ ent.uid, ent ]),
        huts: this.relRecs(`${pfx}.controller`).toArr(ctrl => ctrl.mems['lands.hut']),
        actions: []
      };
      
    },
    doInit: function(ws) {
    },
    doStep: function(ws) {
      // Transitions the World to be at time `ws.ms`, and the amount of
      // time that passed during this update is `dms`. Overall the world
      // is transitioned from time `ws.ms - dms` -> `ws.ms`
      for (let ent of ws.entities) ent.doStep(ws);
    },
    consumeActions: function(ws) {
      
      let count = 0;
      while (ws.actions.length) {
        
        let actions = ws.actions;
        ws.actions = [];
        for (let action of actions) this.processAction(ws, action);
        
        if (count++ > 100) throw Error(`Too many churns`);
        
      }
      
    },
    processAction: function(ws, action) {
      
      let [ pfx ] = this.type.name.split('.');
      let { act, ...params } = action;
      
      if (act === 'addEnt') {
        
        let { hut=null, ...entParams } = params;
        let ent = this.hut.addRecord(`${pfx}.entity`, [ this ], { ...entParams, ms: ws.ms });
        if (hut) hut.addRecord(`${pfx}.ctrlEnt`, [ hut, ent ]);
        ent.doStep({ ...ws, dms: ent.ms - ws.ms });
        
      } else if (act === 'remEnt') {
        
        let { ent=null } = params;
        if (!ent) throw Error(`No Entity provided`);
        ent.end();
        
      } else if (act === 'state') {
        
        params.fn(ws);
        
      } else {
        
        throw Error(`Bad act: "${act}"`);
        
      }
      
    },
    /// =ABOVE}
    
    getInitCtrlSet: function() { return { moveL: 74, moveR: 76, moveU: 87, moveD: 83 }; },
    addControllerHut: function({ dep, hut, real }) {
      
      if (!hut) throw Error(`Missing "hut" param`);
      if (!dep) throw Error(`Missing "dep" param`);
      /// {BELOW=
      if (!real) throw Error(`Missing "real" param`);
      /// =BELOW}
      
      let [ pfx ] = this.type.name.split('.');
      
      /// {ABOVE=
      
      // Initialize controller if none exists
      let controller = hut.relRec(`${pfx}.controller`);
      if (!controller) controller = hut.addRecord(`${pfx}.controller`, [ this, hut ], { ctrlVals: this.getInitCtrlSet() });
      let ctrls = controller.ctrls = controller.getValue().ctrlVals.map( v => ({ mag: 0, ms: 0, lastMs: 0 }) );
      
      /// =ABOVE}
      
      // Enable controller to change ctrl values and activate controls
      // (TODO: probably makes sense to keep actual keycode values BELOW
      // and only encode a list of actions for ABOVE... but then
      // bindings wouldn't be saveable??)
      let modCtrlValsAct = dep(hut.enableAction(`${pfx}.modCtrlVals`, ({ vals }) => {
        /// {ABOVE=
        
        if (!U.isForm(vals, Object)) throw Error(`Ctrl vals should be Object`);
        
        let initSet = this.getInitCtrlSet();
        let issues = vals.toArr((v, k) => {
          if (!initSet.has(k)) return `Unexpected ctrl term "${k}"`;
          if (!U.isForm(v, Number)) return `Ctrl term "${k}" is non-numeric`;
          if (v < 0 || v > 1000) return `Ctrl term "${k}" out of bounds`;
          return C.skip;
        });
        if (issues.length) throw Error(`Invalid ctrl set: ${issues.join(', ')}`);
        
        controller.mod({ ctrlVals: { ...controller.getValue().ctrlVals, ...vals } });
        
        /// =ABOVE}
      }));
      let doCtrlAct = dep(hut.enableAction(`${pfx}.doCtrl`, ({ v: code }, { ms: inputMs }) => {
        /// {ABOVE=
        
        inputMs -= this.ms; // Relative to World time
        let pow = 1;
        for (let [ term ] of controller.getValue().ctrlVals) {
          
          let ctrl = ctrls[term];
          let mag = (code & pow) ? 1 : 0;
          if (mag !== ctrl.mag) Object.assign(ctrl, { mag, ms: inputMs, lastMs: ctrl.ms });
          pow <<= 1;
          
        }
        
        /// =ABOVE}
      }));
      
      // Follow all entities
      dep.scp(this, `${pfx}.entity`, (ent, dep) => {});
      
      /// {BELOW=
      let keySrc = MemSrc.Prm1(Set());
      dep(real.addLayout({ form: 'Art', ...this.artLayoutParams(), animationFn: draw => this.render0(draw, hut), keySrc }));
      
      dep.scp(hut, `${pfx}.controller`, (controller, dep) => {
        
        let ctrls = controller.ctrls = controller.getValue().ctrlVals.map( v => ({ mag: 0, ms: 0, lastMs: 0 }) );
        
        let lastEnc = 0;
        dep(keySrc.route(keys => {
          
          // When active key set changes, update local key values
          // in-place, and encode key set to send to ABOVE for update
          
          let ms = foundation.getMs();
          let { ctrlVals } = controller.getValue();
          
          let enc = 0;
          let pow = 1;
          for (let [ term, code ] of ctrlVals) {
            
            let mag = keys.has(code) ? 1 : 0;
            if (ctrls[term].mag !== mag) {
              ctrls[term].lastMs = ctrls[term].ms;
              ctrls[term].ms = ms;
              ctrls[term].mag = mag;
            }
            
            enc += mag * pow;
            pow <<= 1;
            
          }
          if (enc !== lastEnc) doCtrlAct.act({ v: enc });
          lastEnc = enc;
          
        }));
        
      });
      /// =BELOW}
      
    },
    
    /// {BELOW=
    artLayoutParams: function() { return { pixelDensityMult: 1 }; },
    render0: function(draw, hut) {
      
      let [ pfx ] = this.type.name.split('.');
      
      let ms = foundation.getMs() - this.ms;
      let dms = ms - this.lastMs;
      this.lastMs = ms;
      let entities = this.relRecs(`${pfx}.entity`).toObj(ent => [ ent.uid, ent ]);
      
      this.render({ ms, dms, hut, entities }, draw);
      
    },
    render: function({ ms, dms, entities }, draw) {
    }
    /// =BELOW}
    
  })});
  
  return { World, Entity, TreeEntity, GeomEntity };
  
};
