global.rooms['hasten.gameplay'] = foundation => hut => {
  
  /// {BELOW=
  
  let fullVision = true;
  
  let WorldState = form({ name: 'WorldState', props: (forms, Form) => ({
    
    // TODO: Model world state properly using this Form, then get a
    // quick multiplayer test (controlling a circle) working! Look out
    // for large replay issue (e.g. 50,000ms get replayed)
    
    // Note: This Form is not intialized each step; instead it is
    // updated to reflect the latest data (note that a separate instance
    // will be needed for stepping and rendering!)
    
    init: function(hut=null) {
      
      Object.assign(this, {
        hut,
        ms: 0,
        dms: 0, // TODO: This should potentially not exist!
        uidCount: 0,
        inputState: {},
        entities: {},
        rels: {},
        locus: { x: 0, y: 0, rot: 0, scl: 30, fwd: 0 },
        undos: [],
        actions: [],
        controlledEntity: null
      });
      
    },
    
    getController: function() {
      
      if (!this.hut) return null;
      
      let hutController = this.hut.relRec('tsw.hutController');
      if (!hutController) return null;
      
      return hutController.mems['tsw.controller'];
      
    },
    getInput: function(uid, ms=this.ms) {
      if (ms !== this.ms) throw Error('Unexpected');
      return this.inputState.has(uid) ? this.inputState[uid] : null;
    },
    genUid: function() {
      // Note this happens immediately, not as an Action - whether a
      // WorldState method occurs immediately or is queued using
      // `this.actions.add(() => { ... })` is determined by whether the
      // effect can be visible to any of the Entities in the simulation.
      // Generating a uid never manifests this way, so it can be done
      // immediately
      this.undos.add( () => this.uidCount-- );
      return this.uidCount++;
    },
    addEntity: function(ent) {
      this.actions.add(() => {
        
        this.entities[ent.uid] = ent;
        this.undos.add( () => delete this.entities[ent.uid] );
        
        ent.step(this /* { dms: ent.ms - this.ms } */);
        
      });
      return ent;
    },
    remEntity: function(ent) {
      
      this.actions.add(() => {
        
        delete this.entities[ent.uid];
        this.undos.add( () => this.entities[ent.uid] = ent );
        
        ent.fini(this);
        
        let prevRels = ent.rels.toObj(rel => [ rel, this.rels[rel] ]);
        for (let rel of ent.rels) delete this.rels[rel];
        ent.rels = Set();
        
        this.undos.add( () => {
          for (let [ rel, val ] of prevRels) {
            ent.rels.add(rel);
            this.rels[rel] = val;
          }
        });
        
      });
      
    },
    setRel: function(ent1, ent2, name, val) {
      
      this.actions.add(() => {
        
        let rels = this.rels;
        let [ uid1, uid2 ] = [ ent1.uid, ent2.uid ].sort();
        let key = `${uid1}+${uid2}=${name}`;
        let prevVal = rels.has(key) ? rels[key] : null;
        
        if (val === null) { delete rels[key]; ent1.rels.rem(key); ent2.rels.rem(key); }
        else              { rels[key] = val;  ent1.rels.add(key); ent2.rels.add(key); }
        
        this.undos.add(prevVal === null
          ? () => { delete rels[key];    ent1.rels.rem(key); ent2.rels.rem(key); }
          : () => { rels[key] = prevVal; ent1.rels.add(key); ent2.rels.add(key); }
        );
        
      });
      
    },
    getRel: function(ent1, ent2, name) {
      
      let [ uid1, uid2 ] = [ ent1.uid, ent2.uid ].sort();
      let key = `${uid1}+${uid2}=${name}`;
      return this.rels.has(key) ? this.rels[key] : null;
      
    },
    setProp: function(ent, prop, val) {
      
      this.actions.add(() => {
        
        if (!{}.has.call(ent, prop)) throw Error(`${ent.desc()} has no prop named "${prop}"`);
        let prevVal = ent[prop];
        if (prevVal === val) return;
        
        ent[prop] = val;
        this.undos.add( () => ent[prop] = prevVal );
        
      });
      
    },
    concludeStep: function() {
      
      // Churn until all actions have been applied
      let count = 0;
      while (this.actions.length) {
        
        if (++count > 30) throw Error('Too many churns');
        
        let acts = this.actions;
        this.actions = [];
        
        for (let act of acts) act();
        
      }
      
      let undos = this.undos;
      this.undos = [];
      return undos;
      
    }
    
  })});
  
  let Entity = form({ name: 'Entity', props: (forms, Form) => ({
    
    $tags: Set([]),
    
    init: function({ ws, ms=ws.ms }) {
      
      Object.assign(this, {
        ms,
        uid: ws.genUid(),
        rels: Set()
      });
      
    },
    desc: function() { return `${getFormName(this)}@${this.uid}`; },
    getTags: function(ws) { return this.Form.tags; },
    hasTag: function(ws, tag) { return this.getTags(ws).has(tag); },
    getCollideMass: function(ws) { return null; },
    canCollide: function(ws) { return this.getCollideMass(ws) !== null; },
    canCollideEnt: function(ws, ent) { return true; },
    doCollideEnt: function(ws, ent) {},
    doCollideEnts: function(ws, ents) { for (let ent of ents) this.doCollideEnt(ent); },
    getCollidableGeom: function(ws) { return this.getGeom(ws); },
    
    step: function(ws) {},
    
    renderPriority: function(ws) { return -1; },
    renderVision: function(ws, draw) {},
    renderUi: function(ws, dims, draw) {},
    render: function(ws, draw) {}
    
  })});
  let World = form({ name: 'World', has: { Entity }, props: (forms, Form) => ({
    
    init: function(args) {
      
      forms.Entity.init.call(this, args);
      
      Object.assign(this, {
        
        lasterControllers: {},
        lastMs: foundation.getMs()
        
      });
      
    },
    
    step: function(ws) {
      
      let ms = foundation.getMs();
      this.lastMs = ms;
      
      // Create a Laster for each input uid that doesn't already have
      let ctrlUids = ws.inputState.toArr((v, uid) => uid);
      let spawnUids = ctrlUids.map(uid => this.lasterControllers.has(uid) ? C.skip : uid);
      
      for (let uid of spawnUids) {
        
        let laster = ws.addEntity(Laster({ ws, ctrlUid: uid, x: 0, y: 0, rot: 0 }));
        
        this.lasterControllers[uid] = laster;
        ws.undos.add( () => { delete this.lasterControllers[laster.uid]; console.log('DELETE!!'); } );
        
      }
      
    },
    
    render: function(ws, draw) {
      
      draw.circ(0, 0, 10, { strokeStyle: '#f00', lineWidth: 2 });
      
    }
    
  })});
  let Laster = form({ name: 'Laster', has: { Entity }, props: (forms, Form) => ({
    
    init: function({ ctrlUid, x=0, y=0, rot=0, ...args }) {
      
      forms.Entity.init.call(this, args);
      Object.assign(this, { ctrlUid, x, y, rot });
      
    },
    
    getGeom: function(ws) {
      
      return { x: this.x, y: this.y, rot: this.rot, bound: { type: 'circle', r: 0.5 } };
      
    },
    
    checkSetController: function(ws) {
      
      if (ws.controlledEntity) return;
      
      let controller = ws.getController();
      if (!controller) return;
      if (controller.uid !== this.ctrlUid) return;
      
      ws.controlledEntity = this;
      ws.undos.add( () => ws.controlledEntity = null );
      
    },
    step: function(ws) {
      
      this.checkSetController(ws);
      
      let inp = ws.getInput(this.ctrlUid);
      
      let s = ws.dms * 0.001;
      if (inp.val.moveL) this.x -= 2 * s;
      if (inp.val.moveR) this.x += 2 * s;
      if (inp.val.moveU) this.y += 2 * s;
      if (inp.val.moveD) this.y -= 2 * s;
      
    },
    
    render: function(ws, draw) {
      
      draw.frame(() => {
        
        let { x, y, rot, bound } = this.getGeom(ws);
        draw.trn(x, y);
        draw.rot(rot);
        
        draw.circ(0, 0, bound.r, { fillStyle: '#284' });
        
      });
      
    }
    
  })});
  
  let doHandleOverlaps = ws => {
    
    // Entities that should be considered for overlap handling
    let olEnts = ws.entities.map(ent => ent.canCollide(ws) ? ent : C.skip).toArr(v => v);
    
    // Map an Entity to every other Entity it currently overlaps
    let interactMap = Map();
    
    // Track every individual case of overlapping
    let overlaps = [];
    
    // let wsPast = { ...ws, ms: ws.ms - dms };
    let collC1 = 0;
    let collC2 = 0;
    let num = olEnts.count();
    for (let i = 1; i < num; i++) { for (let j = 0; j < i; j++) {
      
      collC1++;
      
      let ent1 = olEnts[i];
      let ent2 = olEnts[j];
      if (!ent1.canCollideEnt(ws, ent2) || !ent2.canCollideEnt(ws, ent1)) continue;
      
      collC2++;
      
      // TODO: To sweep there should be 2 bounds for each entity; one
      // from `ws.dms` millis ago and the other from now
      //let geom1Head = ent1.getCollidableGeom(wsPast);
      //let geom2Head = ent2.getCollidableGeom(wsPast);
      let geomTail1 = ent1.getCollidableGeom(ws);
      let geomTail2 = ent2.getCollidableGeom(ws);
      
      let overlapVec = this.getOverlapVec(ws, geomTail1, geomTail2); // Points from 1 -> 2
      if (!overlapVec) continue;
      
      if (!interactMap.has(ent1)) interactMap.set(ent1, []);
      if (!interactMap.has(ent2)) interactMap.set(ent2, []);
      interactMap.get(ent1).add(ent2);
      interactMap.get(ent2).add(ent1);
      
      overlaps.add({ ent1, ent2, geomTail1, geomTail2, overlapVec });
      
    }}
    
    for (let [ ent, ents ] of interactMap) ent.doCollideEnts(ws, ents);
    
    for (let { ent1, ent2, geomTail1, geomTail2, overlapVec } of overlaps) {
      
      let m1 = ent1.getCollideMass(ws);
      if (m1 === null) continue;
      
      let m2 = ent2.getCollideMass(ws);
      if (m2 === null) continue;
      
      if (m1 === Infinity && m2 === Infinity) continue;
      
      let amt1 = 0.5;
      let amt2 = 0.5;
      if      (m1 === Infinity) { amt1 = 0; amt2 = 1; }
      else if (m2 === Infinity) { amt1 = 1; amt2 = 0; }
      
      // Note that 1 moves more the heavier 2 is, and vice-versa!
      else                      { let m = 1 / (m1 + m2); amt1 = m2 * m; amt2 = m1 * m; }
      
      if (amt1) ent1.breakMotion(ws, { ...geomTail1,
        x: geomTail1.x + overlapVec.x * amt1,
        y: geomTail1.y + overlapVec.y * amt1
      });
      if (amt2) ent2.breakMotion(ws, { ...geomTail2,
        x: geomTail2.x - overlapVec.x * amt2,
        y: geomTail2.y - overlapVec.y * amt2
      });
      
    }
    
    return `overlaps: ${collC1}, ${collC2}`;
    
  };
  
  let ws = WorldState(hut);
  let stepFn = ({ ms, dms, inputState }) => {
    
    Object.assign(ws, { ms, dms, inputState });
    
    for (let [ uid, ent ] of ws.entities) ent.step(ws);
    
    doHandleOverlaps(ws);
    
    return ws.concludeStep();
    
  };
  
  let locus = { x: 0, y: 0, rot: 0, scl: 30, fwd: 0 };
  let renderFn = ({ ms, dms, inputState }, draw) => {
    
    Object.assign(ws, { ms, dms, inputState });
    
    draw.initFrameCen({ fillStyle: fullVision ? '#000f' : '#0000', globalCompositeOperation: 'copy' }, () => {
      
      let renderEnts = ws.entities.toArr(v => v).sort((a, b) => a.renderPriority() - b.renderPriority());
      
      // Render world
      draw.frame(() => {
        
        if (ws.controlledEntity) locus = {
          ...ws.controlledEntity.getGeom(ws), // { x, y, rot }
          scl: ws.controlledEntity.scoped ? 20 : 30,
          fwd: ws.controlledEntity.scoped ? 8 : 0
        };
        
        draw.scl(locus.scl);
        draw.trn(0, -locus.fwd);
        draw.rot(-locus.rot);
        draw.trn(-locus.x, -locus.y);
        
        // Mark vision pixels
        if (!fullVision) for (let ent of renderEnts) ent.renderVision(ws, draw);
        
        // TODO: Set "globalCompositeOperation" once for all upcoming
        // renders??
        // draw.frame({ globalCompositeOperation: 'source-atop' }, () => {
        for (let ent of renderEnts) ent.render(ws, draw);
        // });
        
      });
      
      // Render UI
      draw.frame(() => {
        
        let { pxW: w, pxH: h } = draw.getDims();
        let dims = { w, h };
        for (let ent of renderEnts) ent.renderUi(ws, dims, draw);
        
      });
      
    });
    
  };
  
  ws.addEntity(World({ ws }));
  ws.concludeStep();
  
  return { stepFn, renderFn };
  
  /// =BELOW} {ABOVE=
  
  return { stepFn: () => {}, renderFn: () => {} };
  
  /// =ABOVE}
  
};
