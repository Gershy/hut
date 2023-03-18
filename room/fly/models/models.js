global.rooms['fly.models'] = async foundation => {
  
  let  { record: { Record } } = await foundation.getRooms([ 'record' ]);
  
  let util = {
    fadeAmt: (v1, v2, amt) => v1 * (1 - amt) + v2 * amt,
    fadeVal: (init, amt=0.5) => {
      let fv = {
        val: init,
        to: trg => fv.val = util.fadeAmt(fv.val, trg, amt)
      };
      return fv;
    },
    incCen: function*(n, stepAmt) {
      let start = -0.5 * stepAmt * (n - 1);
      for (let i = 0; i < n; i++) yield start + i * stepAmt;
    },
    fa: (protos, methodName, fn) => { // "form all"
      
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
      
    }
  };
  let geom = {
    distSqr: (p1, p2) => {
      let dx = p1.x - p2.x;
      let dy = p1.y - p2.y;
      return (dx * dx) + (dy * dy);
    },
    dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
    checkForms: (form1, form2, bound1, bound2) => {
      if (form1 === bound1.form && form2 === bound2.form) return [ bound1, bound2 ];
      if (form1 === bound2.form && form2 === bound1.form) return [ bound2, bound1 ];
      return null;
    },
    doCollidePoint: (p1, p2) => p1.x === p2.x && p1.y === p2.y,
    doCollideCircle: (c1, c2) => {
      
      let dx = c1.x - c2.x;
      let dy = c1.y - c2.y;
      let tr = c1.r + c2.r;
      return (dx * dx + dy * dy) < (tr * tr);
      
    },
    doCollideRect: (r1, r2) => {
      
      let { x: x1, y: y1, w: w1, h: h1 } = r1;
      let { x: x2, y: y2, w: w2, h: h2 } = r2;
      
      return true
        && Math.abs(x1 - x2) < (w1 + w2) * 0.5
        && Math.abs(y1 - y2) < (h1 + h2) * 0.5;
      
    },
    doCollidePointRect: ({ x, y }, r) => {
      let hw = r.w * 0.5;
      let hh = r.h * 0.5;
      x -= r.x; y -= r.y;
      return x > -hw && x < hw && y > -hh && y < hh
    },
    doCollidePointCircle: ({ x, y }, c) => {
      x -= c.x; y -= c.y;
      return (x * x + y * y) < (c.r * c.r);
    },
    doCollideRectCircle: (r, c) => {
      
      let hw = r.w * 0.5;
      let hh = r.h * 0.5;
      let roundingGap = c.r; // Size of gap separating RoundedRect and Rect
      
      // A "plus sign" consisting of two rects, with the notches
      // rounded off by circles, creates a RoundedRect
      // circumscribing the original Rect by a constant gap equal to
      // the radius of the colliding Circle.
      
      return false
        || geom.doCollidePointRect(c, { x: r.x, y: r.y, w: r.w + roundingGap * 2, h: r.h })
        || geom.doCollidePointRect(c, { x: r.x, y: r.y, w: r.w, h: r.h + roundingGap * 2 })
        || geom.doCollidePointCircle(c, { x: r.x - hw, y: r.y - hh, r: roundingGap })
        || geom.doCollidePointCircle(c, { x: r.x + hw, y: r.y - hh, r: roundingGap })
        || geom.doCollidePointCircle(c, { x: r.x + hw, y: r.y + hh, r: roundingGap })
        || geom.doCollidePointCircle(c, { x: r.x - hw, y: r.y + hh, r: roundingGap })
      
    },
    doCollide: (bound1, bound2) => {
      if (bound1.form === bound2.form) {
        if (bound1.form === 'circle') return geom.doCollideCircle(bound1, bound2);
        if (bound1.form === 'rect') return geom.doCollideRect(bound1, bound2);
      } else {
        let [ rect=null, circle=null ] = geom.checkForms('rect', 'circle', bound1, bound2) || [];
        if (rect) return geom.doCollideRectCircle(rect, circle);
      }
      
      throw Error(`No method for colliding ${bound1.form} and ${bound2.form}`);
    },
    containingRect: bound => {
      if (bound.form === 'rect') return bound;
      if (bound.form === 'circle') {
        let size = bound.r << 1;
        return { x: bound.x, y: bound.y, w: size, h: size };
      }
      throw Error(`No clue how to do containing rect for "${bound.form}"`);
    }
  };
  
  // BASE STUFF
  let Entity = form({ name: 'Entity', has: { Record }, props: (forms, Form) => ({
    
    // TODO: This is SO JANKY, but doesn't look like there's another way
    // to achieve the same effect (preventing conflicting prop names).
    // Note that this is awkward to maintain; properties may be renamed,
    // added or removed from `logic.Endable`, `logic.Src`, and
    // `foundation.getRoom('record').Record` - then this list would need
    // to be altered as well! The missing ingredient to implement this
    // correctly is information available on Forms (not on Facts)
    // indicating what instance properties will be assigned to the Fact.
    $conflictPropNames: new Set('cleanup,onn,fns,type,uid,mems,relSrcs,valSrc,allMemsTmp'.split(',')),
    
    initProps({ ms, lsMs=null }) { return { ms, lsMs }; },
    initSyncs() { return [ 'ms' ]; },
    init(args) {
      
      let { type, uid, group, value } = args;
      if (!value) throw Error(`${getFormName(this)} missing "value" param`);
      
      // Get props, and list of sync prop names
      let props = this.initProps(value);
      let sProps = this.initSyncs();
      if (Set(sProps).size !== sProps.length) throw Error(`${getFormName(this)} defines sync properties multiple times (potentially through polymorphism)`);
      for (let spn of sProps) if (!props.has(spn)) throw Error(`${getFormName(this)} missing sync prop "${spn}"`);
      
      // Prevent any properties whose names conflict with the member
      // properties of Rec (and Endable and Tmp, inherited by Rec).
      for (let k in props) if (this[k] !== C.skip || Form.conflictPropNames.has(k))
        throw Error(`Conflicting prop name for ${getFormName(this)}: "${k}"`);
      
      // Move properties from `props` to `syncProps` as appropriate
      let syncProps = {};
      for (let spn of sProps) { syncProps[spn] = props[spn]; delete props[spn]; }
      
      // Attach all local properties
      Object.assign(this, props);
      
      // Define getter+setter for synced properties
      for (let spn in syncProps) {
        Object.defineProperty(this, spn, {
          get() { return this.valueSrc.val[spn]; },
          set(v) { this.setValue({ [spn]: v }); },
          enumerable: true,
          configurable: true
        });
      }
      
      // Initialize as Rec using sync properties
      forms.Record.init.call(this, { type, uid, group, value: { ...syncProps, type: getFormName(this) } });
      
    },
    rel(ud, relName) { return this[relName] || ud.entities[this[`${relName}Uid`]] || null; },
    getAgeMs(ud) { return ud.ms - this.ms; },
    getParent(ud) { return ud.level; },
    getRelGeom: C.noFn('getRelGeom'), // Returns current state, and any events (e.g. births) which occurred during the time delta
    getAbsGeom(ud) {
      let relState = this.getRelGeom(ud);
      let par = this.getParent(ud);
      if (!par) return relState;
      
      let { x, y } = par.getAbsGeom(ud);
      
      relState.x += x;
      relState.y += y;
      return relState;
    },
    getCollideResult: C.noFn('getCollideResult'),
    doStep(ud) {},
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: `solo@${this.uid}`,
      sides: []
    }}; },
    getDieResult(ud) { this.end(); },
    isAlive(ud) {
      if (this.lsMs !== null && this.getAgeMs(ud) > this.lsMs) return false;
      return true;
    },
    
    renderPriority() { return 0.5; },
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      draw.circ(x, y, 10, { fillStyle: '#ff0000' });
    }
    
  })});
  let Mortal = form({ name: 'Mortal', has: { Entity }, props: (forms, Form) => ({
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr, { hpDmg: 0 })),
    getMaxHp() { return 1; },
    getCurrentHp(ud) { return this.getMaxHp(ud) - this.hpDmg; },
    takeDamage(ud, srcEnt=null, amt) {
      let fatalDmg = this.getMaxHp(ud) - this.hpDmg;
      if (amt > fatalDmg) amt = Math.max(0, fatalDmg);
      
      // Mark damage on us
      this.hpDmg += amt;
      
      // Give damage credit to `srcEnt`
      if (srcEnt) srcEnt.scoreDamage += amt;
    },
    isAlive(ud) { return this.hpDmg < this.getMaxHp(ud); }
  })});
  let Mover = form({ name: 'Mover', props: (forms, Form) => ({
    
    $carteParams: (tx, ty) => {
      let dist = Math.sqrt(tx * tx + ty * ty);
      let n = 1 / dist;
      return { nx: tx * n, ny: ty * n, ang: Math.atan2(tx, ty) / (Math.PI * 2), dist };
    },
    $polarParams: (ang, dist=null) => {
      let rad = ang * Math.PI * 2;
      return { nx: Math.sin(rad), ny: Math.cos(rad), ang, dist };
    },
    
    init: C.noFn('init'),
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      
      let { ms, aMs=ms, x, y, ax=x, ay=y, vel=100, acl=0 } = val;
      
      // "nx" and "ny" specify normalized vector motion
      // "tx" and "ty" specify "targetted" motion; the Mover will move
      //   through the point (tx, ty)
      // "ang" and "dist" specify angular motion
      // Note that "ax" and "ay" are "anchor" coords; they store the
      // last location jumped to by this Mover before continuous motion
      // resumed
      
      let calc = null;
      if (val.has('nx') && val.has('ny'))       calc = () => val.slice([ 'nx', 'ny', 'dist' ]);
      else if (val.has('tx') && val.has('ty'))  calc = Form.carteParams.bind(null, val.tx, val.ty);
      else if (val.has('ang'))                  calc = Form.polarParams.bind(null, val.ang, val.dist);
      else                                      calc = () => { throw Error(`Supply either "tx" and "ty", or "ang"`); };
      
      let { nx, ny, dist, ang=Math.atan2(nx, ny) / (Math.PI * 2) } = calc();
      return {}.gain(...arr, { aMs, ax, ay, vel, acl, nx, ny, dist, ang });
      
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'aMs', 'ax', 'ay', 'nx', 'ny', 'dist', 'vel', 'acl', 'ang' ].gain(...arr)),
    getRelGeom(ud, ms=ud.ms) {
      
      // Seconds the most recent anchor move has lasted
      let secs = (ms - this.aMs) * 0.001;
      
      // Non-null `dist` creates a cap on the dist
      let d = this.vel * secs + this.acl * 0.5 * secs * secs; // Distance based on t, vel, acl
      
      let arrived = this.dist !== null && d > this.dist;
      if (arrived) d = this.dist;
      
      return { x: this.ax + this.nx * d, y: this.ay + this.ny * d, arrived };
      
    },
    getAgeMs: C.noFn('getAgeMs'),
    setMoveAnchor(ud) {
      let { x, y } = this.getRelGeom(ud);
      this.aMs = ud.ms; this.ax = x; this.ay = y;
    },
    setMoveSpd(ud, vel, acl=0) {
      
      // Ignore if values are the same
      if (vel === this.vel && acl === this.acl) return;
      
      if (ud) this.setMoveAnchor(ud);
      this.vel = vel;
      this.acl = acl;
    },
    setCarteDest(ud, tx, ty) {
      
      if (ud) this.setMoveAnchor(ud);
      
      let d = Math.hypot(tx, ty);
      this.dist = d;
      
      let n = 1 / d;
      this.nx = tx * n; this.ny = ty * n;
      this.ang = Math.atan2(tx * n, ty * n) / (Math.PI * 2);
      
    },
    setPolarDest(ud, ang, dist=null) {
      
      if (ang === this.ang && dist === this.dist) return;
      
      if (ud) this.setMoveAnchor(ud);
      
      let r = ang * Math.PI * 2;
      Object.assign(this, { nx: Math.sin(r), ny: Math.cos(r), ang, dist });
      
    },
    outOfBoundsTolerance(ud) { return 150; },
    isAlive(ud) {
      
      let { nx, ny } = this;
      let { x, y } = this.getAbsGeom(ud);
      let oobt = this.outOfBoundsTolerance(ud);
      let { r, l, t, b } = ud.bounds.total;
      if (nx > 0 && x > (r + oobt)) return false;
      if (nx < 0 && x < (l - oobt)) return false;
      if (ny > 0 && y > (t + oobt)) return false;
      if (ny < 0 && y < (b - oobt)) return false;
      return true;
      
    }
    
  })});
  let Physical = form({ name: 'Physical', props: (forms, Form) => ({
    init: C.noFn('init'),
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { ms, ax=null, ay=null, aMs=ms, forces=[] } = val;
      return {}.gain(...arr, { ax, ay, aMs, forces });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'ax', 'ay', 'aMs', 'forces' ].gain(...arr)),
    getVelAcl(ud) {
      let vx = 0; let vy = 0;
      let ax = 0; let ay = 0;
      for (let force of this.forces) {
        if (force[1] === 'vel') { vx += force[2]; vy += force[3]; }
        if (force[1] === 'acl') { vx += force[2]; vy += force[3]; ax += force[4]; ay += force[5]; }
      }
      return { vx, vy, ax, ay };
    },
    calcForceState(ud, [ fMs, type, ...params ], durMs=ud.ms - fMs) {
      
      // Return the instantaneous offset of a force that has lasted for
      // `durMs` millis
      
      let secs = durMs * 0.001;
      if (type === 'vel') {
        
        let [ vx, vy ] = params;
        return { fx: vx * secs, fy: vy * secs };
        
      } else if (type === 'acl') {
        
        let aclMult = 0.5 * secs * secs;
        let [ vx, vy, ax, ay ] = params;
        return { fx: vx * secs + ax * aclMult, fy: vy * secs + ay * aclMult }
        
      }
      
      throw Error(`Unknown force type: ${type}`);
      
    },
    calcForce(ud, force) {
      
      let fState = this.calcForceState(ud, force);
      
      // Some forces occurred before the current anchor, but the anchor
      // indicates the moment in time from which forces ought to apply.
      // Each force predating the anchor has its translation reduced by
      // the amount of translation occurring before the anchor - this
      // way a force only applies the amount of translation occurring
      // after the anchor was set!
      let fMs = force[0];
      if (fMs < this.aMs) {
        let { fx, fy } = this.calcForceState(ud, force, this.aMs - fMs);
        fState.fx -= fx;
        fState.fy -= fy;
      }
      
      return fState;
      
    },
    getRelGeom(ud) {
      let fx = 0; let fy = 0;
      
      for (let force of this.forces) {
        let add = this.calcForce(ud, force);
        fx += add.fx; fy += add.fy;
      }
      
      return { x: this.ax + fx, y: this.ay + fy };
    },
    setAnchor(ud, ax, ay) {
      this.ax = ax;
      this.ay = ay;
      this.aMs = ud.ms;
    },
    setForces(ud, forces) {
      
      // A Physical's forces will be managed as a single blob of data
      let isDiff = (() => {
        let len = forces.length;
        let forces0 = this.forces;
        if (len !== forces0.length) return true;
        for (let i = 0; i < len; i++) {
          let f0 = forces[i];
          let f1 = forces0[i];
          if (f0.length !== f1.length) return true;
          for (let j = 0; j < f0.length; j++) if (f0[j] !== f1[j]) return true;
        }
        return false;
      })();
      if (!isDiff) return;
      
      let { x, y } = this.getRelGeom(ud);
      this.setAnchor(ud, x, y);
      this.forces = forces;
      
    }
  })});
  
  // UTIL
  let Bullet = form({ name: 'Bullet', props: (forms, Form) => ({
    
    // An abstract bullet; has a bound and logic for dealing damage but
    // no implementation of motion
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { team, owner=null, dmg=1, pDmg=[0,0], bound={ form: 'circle', r: 4 }, colour='rgba(0, 0, 0, 0.75)' } = val;
      /// {ABOVE=
      if (!owner) throw Error('Bullet missing "owner" property');
      /// =ABOVE}
      if (!isForm(bound, Object) || !bound.has('form') || !isForm(bound.form, String)) throw Error(`Bad bound! (${getFormName(bound)}, ${valToSer(bound)})`);
      return {}.gain(...arr, { team, owner, dmg, pDmg, bound, colour });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'bound', 'colour', 'team' ].gain(...arr)),
    init: C.noFn('init'),
    getCollideResult(ud, tail) {
      if (!hasForm(tail, Mortal)) return;
      let dmg = this.dmg;
      if (this.pDmg[0]) {
        let maxHp = tail.getMaxHp(ud);
        dmg += Math.min(this.pDmg[0] * maxHp, this.pDmg[1] || maxHp);
      }
      tail.takeDamage(ud, this.owner, dmg);
      this.lsMs = 0;
    },
    getRelGeom(ud) { return this.bound; },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: this.team,
      sides: [ 'head' ]
    }}; }
    
  })});
  let MBullet = form({ name: 'MBullet', has: { Entity, Mover, Bullet }, props: (forms, Form) => ({
    
    // A moving bullet
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => ({}).gain(...arr)),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    getRelGeom(ud) { return {
      ...forms.Bullet.getRelGeom.call(this, ud), // Bounding shape
      ...forms.Mover.getRelGeom.call(this, ud)   // x/y translation
    }; },
    getState: forms.Bullet.getState,
    isAlive(ud) {
      return true
        && forms.Entity.isAlive.call(this, ud)
        && forms.Mover.isAlive.call(this, ud);
    },
    render(ud, draw) {
      let bound = this.bound;
      let { x, y } = this.getAbsGeom(ud);
      if (bound.form === 'circle') {
        draw.circ(x, y, bound.r, { fillStyle: this.colour });
      } else if (bound.form === 'rect') {
        draw.rectCen(x, y, bound.w, bound.h, { fillStyle: this.colour });
      } else {
        throw Error(`Bad bound: "${bound.form}"`);
      }
    }
    
  })});
  
  // GOOD GUYS
  let Ace = form({ name: 'Ace', has: { Mortal, Physical }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 8 }, $respawnMs: 2500, $invulnMs: 1500, $spd: 170,
    
    initControlProps(ms) { return {}; },
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { ms, name='<anon>', cx=0, cy=0 } = val;
      return {}.gain(...arr, {
        name, spd: Form.spd, effects: Set(),
        spawnMark: ms,
        invulnMark: ms + Form.invulnMs,
        scoreDamage: 0,
        scoreDeath: 0,
        controls: [ 'l', 'r', 'd', 'u', 'a1', 'a2' ].toObj(k => [ k, [ 0, ms ] ]),
        ...i.initControlProps(ms)
      });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'invulnMark', 'name' ].gain(...arr)),
    getRelGeom(ud) {
      let { x, y } = forms.Physical.getRelGeom.call(this, ud);
      
      let bounded = false;
      if (ud.outcome !== 'win') {
        let pb = ud.bounds.player;
        let tb = ud.bounds.total;
        let { r } = Form.bound;
        if (x < (pb.l - tb.x + r)) { x = (pb.l - tb.x + r); bounded = true; }
        if (x > (pb.r - tb.x - r)) { x = (pb.r - tb.x - r); bounded = true; }
        if (y < (pb.b - tb.y + r)) { y = (pb.b - tb.y + r); bounded = true; }
        if (y > (pb.t - tb.y - r)) { y = (pb.t - tb.y - r); bounded = true; }
      }
      
      return { ...Form.bound, x, y, bounded };
    },
    getCollideResult(ud, tail) {},
    getTeam() { return +1; },
    
    aceDoStep: C.noFn('aceDoStep'),
    doStep(ud) {
      
      // Try to respawn if dead
      if (!this.isAlive(ud)) {
        
        // Dead Aces respawn after timer, or upon victory
        if (ud.ms >= this.spawnMark || ud.outcome === 'win') {
          
          this.hpDmg = 0;
          this.spawnMark = Math.min(this.spawnMark, ud.ms);
          this.invulnMark = this.spawnMark + Form.invulnMs;
          
          let { x, y } = ud.level.getAceSpawnLoc(ud);
          this.setAnchor(ud, x, y);
          
        } else {
          
          // Dead and not respawned; no further behaviour
          return;
          
        }
        
      }
      
      // Maintain invincibility and fly-away-speed upon win
      if (ud.outcome === 'win') {
        if (!this.winTime) this.winTime = ud.ms;
        if (this.invulnMark < ud.ms) this.invulnMark = ud.ms + 10000;
        this.setForces(ud, [ [ this.winTime, 'vel', 0, Form.spd * 4 ] ]);
        return;
      }
      
      let { r, l, u, d, a1, a2 } = this.controls;
      let cx = r[0] - l[0];
      let cy = u[0] - d[0];
      let { spdMult=1, forces=[] } = this.aceDoStep(ud, { cx, cy, a1: a1[0], a2: a2[0] }) || {};
      
      // The calculated speed for this tick
      spdMult *= this.spd;
      
      for (let effect of this.effects) {
        let { mark, type=null, fn=null, endFn=null } = effect;
        if (ud.ms > effect.mark) {
          this.effects.rem(effect);
          if (effect.endFn) effect.endFn(this, ud);
        } else {
          // Note: effects that aren't "spdMult" may need to be added to `forces`
          if (effect.type === 'spdMult') spdMult *= effect.spdMult;
          if (effect.type === 'force') forces.push(effect.force);
          if (effect.fn) effect.fn(this, ud);
        }
      }
      
      // TODO: If moving on both axes normalize speed!
      let msOff = ud.level.globalMsOffset;
      if (r[0]) forces.push([ r[1] - msOff, 'vel', r[0] * +spdMult, 0               ]);
      if (l[0]) forces.push([ l[1] - msOff, 'vel', l[0] * -spdMult, 0               ]);
      if (u[0]) forces.push([ u[1] - msOff, 'vel', 0,               u[0] * +spdMult ]);
      if (d[0]) forces.push([ d[1] - msOff, 'vel', 0,               d[0] * -spdMult ]);
      
      this.setForces(ud, forces);
      
    },
    getState(ud) {
      
      return { tangibility: {
        bound: this.getAbsGeom(ud),
        team: 'ace',
        
        // Aces are not collidable if they're dead, victorious, or in a
        // state of invulnerability
        sides: (!this.isAlive(ud) || ud.outcome === 'win' || this.invulnMark > ud.ms)
          ? []
          : [ 'tail' ]
      }};
      
    },
    getDieResult(ud) {
      // Don't call `forms.Mortal.getDieResult` - that ends the Rec; Ace
      // Recs don't end, they always stick around until the Level ends
      // to track player score
      
      let { ms, level } = ud;
      if (this.spawnMark > ms) return; // This Ace is already respawning
      
      this.scoreDeath += 1;
      if (level.lives > 0) {
        
        // Subtract lives
        level.lives -= 1;
        
        // Respawn in future
        this.spawnMark = ms + Ace.respawnMs;
        
        // Reset state
        let controlProps = this.initControlProps(ms);
        for (let [ k, v ] of controlProps) this[k] = v;
        
        // Reset all effects
        this.effects = Set();
        
      } else {
        this.spawnMark = ms + 100 * 1000;
        level.outcome = 'lose';
      }
      
    },
    
    render(ud, draw) {
      
      if (!this.isAlive(ud)) return;
      
      let size = Form.bound.r << 1;
      let mine = this === ud.myEntity;
      let { x, y } = this.getAbsGeom(ud);
      
      if (ud.ms < this.invulnMark) {
        let outerStyle = mine
          ? { fillStyle: 'rgba(255, 255, 255, 0.30)' }
          : { fillStyle: 'rgba(255, 255, 255, 0.15)' };
        let innerStyle = mine
          ? { fillStyle: 'rgba(255, 255, 255, 0.35)', strokeStyle: 'rgba(255, 255, 255, 0.7)', lineWidth: 3 }
          : { fillStyle: 'rgba(255, 255, 255, 0.15)' };
        draw.circ(x, y, size * 5,   outerStyle);
        draw.circ(x, y, size * 1.6, innerStyle);
        draw.imageCen(this.constructor.imageKeep, x, y, size, size, 0.25);
      } else {
        let indStyle = mine
          ? { fillStyle: 'rgba(255, 140, 140, 0.28)', strokeStyle: 'rgba(255, 100, 100, 0.5)', lineWidth: 3 }
          : { fillStyle: 'rgba(255, 140, 140, 0.20)' };
        draw.circ(x, y, size * 1.6, indStyle);
        draw.imageCen(this.constructor.imageKeep, x, y, size, size);
      }
      
    }
    
  })});
  let JoustMan = form({ name: 'JoustMan', has: { Ace }, props: (forms, Form) => ({
    
    $w1ChargePunishSlow: 0.4, $w1ChargePunishMs: 2000,
    $w1Charge1Ms: 500, $w1Charge2Ms: 2500, $w1Charge3Ms: 4000, // Millis of charging for various jousts
    $w1Charge3Slow: 0.59, $w1Charge3Duration: 2200,
    $w2Delay: 3500, $w2DashSpeed: 500, $w2OrbDps: 25, $w2DurationMs: 300,
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'aceJoust.png' ]),
    
    initControlProps(ms) { return { w1Mark: null, w1State: 0, w2Mark: null }; },
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'w1Mark', 'w1State', 'w2Mark' ].gain(...arr)),
    
    aceDoStep(ud, { cx, cy, a1, a2 }) {
      
      let { aheadDist, ms, spf } = ud;
      
      // Activate weapon 1
      if (a1) {
        
        // Mark the moment weapon 1 was held
        if (!this.w1Mark) this.w1Mark = ms;
        
        // Weapon 1 state depends on how long held
        let duration = ms - this.w1Mark;
        if (duration > Form.w1Charge3Ms)      this.w1State = 3;
        else if (duration > Form.w1Charge2Ms) this.w1State = 2;
        else if (duration > Form.w1Charge1Ms) this.w1State = 1;
        else                                  this.w1State = 0;
        
      } else if (this.w1Mark) {
        
        // Activate the charged ability!!
        if (this.w1State === 0) {
          
          // JoustMan is punished for holding for too short a time
          this.effects.add({ mark: ms + Form.w1ChargePunishMs, type: 'spdMult', spdMult: Form.w1ChargePunishSlow });
          
        } else if (this.w1State === 1) {
          
          // Weapon 1 act 1: Spread shot
          
          let { x, y } = this.getRelGeom(ud);
          let incAng = 0.018;
          let args = { owner: this, team: 'ace', ax: x, ay: y, dmg: 0.75, lsMs: 700, vel: 350, bound: { form: 'circle', r: 6 } };
          for (let ang of util.incCen(9, incAng)) ud.spawnEntity({ type: 'JoustManBullet', ...args, ang });
          
          this.effects.add({ mark: ms + 500, type: 'spdMult', spdMult: 1.1 });
          
        } else if (this.w1State === 2) {
          
          // Weapon 1 act 2: Spheres
          let args = { joustMan: this, lsMs: 1800 };
          let offs = [
            { xOff: -64, yOff: +16, r: 28, dps: 10 },
            { xOff: +64, yOff: +16, r: 28, dps: 10 },
            { xOff: +24, yOff: -30, r: 20, dps: 8 },
            { xOff: -24, yOff: -30, r: 20, dps: 8 }
          ];
          for (let off of offs) ud.spawnEntity({ type: 'JoustManLaserSphere', ...args, ...off });
          
          this.effects.add({ mark: ms + 1000, type: 'spdMult', spdMult: 1.3 });
          
        } else if (this.w1State === 3) {
          
          // Weapon 1 act 3: BIG LASER
          ud.spawnEntity({ type: 'JoustManLaserVert', joustMan: this, lsMs: Form.w1Charge3Duration });
          this.effects.add({ mark: ms + Form.w1Charge3Duration, type: 'spdMult', spdMult: Form.w1Charge3Slow });
          
        }
        
        this.w1State = 0;
        this.w1Mark = 0;
        
      }
      
      // Activate weapon 2
      if (a2 && cx && (!this.w2Mark || ms > this.w2Mark)) {
        
        this.w2Mark = ms + Form.w2Delay;
        
        let dir = cx > 0 ? +1 : -1;
        this.invulnMark = Math.max(this.invulnMark || 0, ms + 250);
        this.effects.add({ mark: ms + 250, type: 'force', force: [ ms, 'vel', Form.w2DashSpeed * dir, 0 ] });
        this.effects.add({ mark: ms + 270, type: 'spdMult', spdMult: 0 });
        
        ud.spawnEntity({ type: 'JoustManLaserHorz', joustMan: this, team: 'ace', lsMs: Form.w2DurationMs, r: 9, dir });
        
      }
      
    },
    render(ud, draw) {
      
      forms.Ace.render.call(this, ud, draw);
      
      let { x, y } = this.getAbsGeom(ud);
      let w1Mark = this.w1Mark;
      let w1State = this.w1State;
      let w2Mark = this.w2Mark;
      
      // Laser reload
      let bar1H = w1Mark ? Math.min(1, (ud.ms - w1Mark) / Form.w1Charge3Ms) * 20 : 0;
      let [ bar1W, col ] = [
        [ 16, 'rgba(0, 0, 0, 1)' ],         // Punished
        [ 16, 'rgba(0, 150, 150, 0.7)' ],   // Spread shot
        [ 8,  'rgba(0, 255, 255, 0.7)' ],   // Butterfly
        [ 12, 'rgba(100, 255, 255, 0.8)' ]  // Laser
      ][w1State];
      draw.rect(x + bar1W * -0.5, y - 8, bar1W, bar1H, { fillStyle: col });
      
      // Flash reload
      let msRemaining = ((w2Mark || ud.ms) - ud.ms);
      let bar2W = (msRemaining > 0)
        ? Math.max(0, Math.min(1, (Form.w2Delay - msRemaining) / Form.w2Delay))
        : 1;
      draw.rectCen(x, y - 12, bar2W * 16, 4, { fillStyle: `rgba(0, 0, 255, ${msRemaining > 0 ? 0.4 : 1})` });
      
    }
    
  })});
  let GunGirl = form({ name: 'GunGirl', has: { Ace }, props: (forms, Form) => ({
    
    $shootSteps: [
      { ms: 1000, ang: -0.01, dmgMult: 1   },  // Inwards
      { ms: 1000, ang: +0.00, dmgMult: 1.4 },  // Parallel again
      { ms: 1500, ang: +0.02, dmgMult: 1   },  // Very slowly increase angle
      { ms: 4000, ang: +0.25, dmgMult: 1   }   // Slowly bend all the way outwards
    ],
    $w1Delay: 90, $bulletDmg: 0.35, $w1LockMs: 850,
    $w1ShortLockPunishSlow: 0.5, $w1ShortLockPunishMs: 250,
    $w1LongLockPunishSlow: 0.80, $w1LongLockPunishMs: 600,
    $w1ReloadBoostMs: 275, $w1ReloadBoostAmt: 1.65, $w1ReloadSlowMs: 450, $w1ReloadSlowAmt: 0.65,
    $w2Delay: 8000, $w2Duration: 2000, $w2DmgMult: 1.05,
    $bulletDmg: 0.3, $bulletSpd: 740, $bulletLsMs: 800,
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'aceGun.png' ]),
    
    initControlProps(ms) { return {
      lockoutPunishMark: null,
      w1Mark: null,                   // Marks when bullet ready to fire
      w1StartMark: null,              // Marks the time the first bullet of the series was fired
      w1LockMark: null,               // Marks when lockout will end
      w2ReadyMark: ms,                // Marks when w2 can be used
      w2Mark: ms,                     // Marks when w2 ends
      w2EffectiveShootDuration: null  // Marks where in the shooting pattern to pause during steroid
    }; },
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'w2ReadyMark' ].gain(...arr)),
    getAngForShootDuration(ms) {
      
      let prevMs = 0;
      let prevAng = 0;
      for (let step of Form.shootSteps) {
        
        let curMs = prevMs + step.ms;
        
        if (ms < curMs) {
          return { ...step, smoothAng: util.fadeAmt(prevAng, step.ang, (ms - prevMs) / step.ms) };
        }
        
        prevMs += step.ms;
        prevAng = step.ang;
        
      }
      
      let result = Form.shootSteps.slice(-1)[0];
      return { ...result, smoothAng: result.ang };
      
    },
    aceDoStep(ud, { cx, cy, a1, a2 }) {
      
      let { aheadDist, ms, mspf, spf } = ud;
      
      // Reset `this.lockoutPunishMark` when the duration ends
      if (this.lockoutPunishMark && ms >= this.lockoutPunishMark) this.lockoutPunishMark = null;
      
      // When main weapon lockout expires reset mark
      if (this.w1LockMark && ms >= this.w1LockMark) this.w1LockMark = null;
      
      // End w2 when the duration elapses
      if (this.w2Mark && ms >= this.w2Mark) this.w2Mark = null;
      
      if (a1 && !this.w1LockMark) {
        
        if (!this.w1StartMark) this.w1StartMark = this.w1Mark = ms;
        
        while ((ms + mspf) > this.w1Mark) {
          
          let { dmgMult: dm, smoothAng: ang } = this.getAngForShootDuration(this.w1Mark - this.w1StartMark);
          
          let args = { owner: this, team: 'ace',
            vel: Form.bulletSpd,
            dmg: Form.bulletDmg * dm * (this.w2Mark ? Form.w2DmgMult : 1),
            bound: { form: 'circle', r: 3 * dm * (this.w2Mark ? Form.w2DmgMult : 1) },
            lsMs: Form.bulletLsMs,
            aMs: this.w1Mark
          };
          
          let { x, y } = this.getRelGeom({ ...ud, ms: this.w1Mark });
          ud.spawnEntity({ type: 'MBullet', ax: x - 4, ay: y + 6, ...args, ang: -ang });
          ud.spawnEntity({ type: 'MBullet', ax: x + 4, ay: y + 6, ...args, ang: +ang });
          
          if (this.w2Mark) {
            let w2StartMs = this.w2Mark - Form.w2Duration;
            let durMs = ms - w2StartMs;
            let offAng = Math.sin(durMs * 0.001 * Math.PI) * 0.03;
            ud.spawnEntity({ type: 'MBullet', ax: x - 8, ay: y + 6, ...args, ang: -(ang + offAng) });
            ud.spawnEntity({ type: 'MBullet', ax: x + 8, ay: y + 6, ...args, ang: +(ang + offAng) });
          }
          
          this.w1Mark += Form.w1Delay * (this.w2Mark ? 0.65 : 1);
          
        }
        
      }
      
      if (!a1 && this.w1StartMark) {
        
        // Just stopped shooting! Lockout!
        this.w1Mark = null;
        this.w1StartMark = null;
        this.w1LockMark = ms + Form.w1LockMs;
        
        this.invulnMark = Math.max(this.invulnMark || 0, ms + Form.w1ReloadBoostMs + 25);
        this.effects.add({ mark: ms + Form.w1ReloadBoostMs, type: 'spdMult', spdMult: Form.w1ReloadBoostAmt, endFn: (i, ud) => {
          
          i.effects.add({ mark: ud.ms + Form.w1ReloadSlowMs, type: 'spdMult', spdMult: Form.w1ReloadSlowAmt });
          
        }});
        
      }
      
      if (a2 && ms >= this.w2ReadyMark) {
        
        if (this.w1LockMark) this.w1LockMark = null; // Instantly unlock
        this.w2ReadyMark = ms + Form.w2Duration + Form.w2Delay;
        this.w2Mark = ms + Form.w2Duration;
        
        this.w2EffectiveShootDuration = ms - (this.w1StartMark || ms);
        
        let incAng = 0.029;
        let { x, y } = this.getRelGeom(ud);
        let bulletArgs = { owner: this, team: 'ace', ax: x, ay: y - 5, vel: 140, dmg: 1.5, bound: { form: 'circle', r: 5 }, lsMs: 2500 };
        for (let ang of util.incCen(15, incAng)) ud.spawnEntity({ type: 'MBullet', ...bulletArgs, ang: 0.5 + ang });
        
      }
      
    },
    
    render(ud, draw) {
      
      forms.Ace.render.call(this, ud, draw);
      
      let { x, y } = this.getAbsGeom(ud);
      let w2MsRemaining = this.w2ReadyMark - ud.ms;
      let barW = Math.min(1, (Form.w2Delay - w2MsRemaining) / Form.w2Delay) * 16;
      draw.rectCen(x, y - 12, barW, 4, { fillStyle: (w2MsRemaining > 0) ? '#6060ff' : '#0000ff' });
      
    }
    
  })});
  let SlamKid = form({ name: 'SlamKid', has: { Ace }, props: (forms, Form) => ({
    
    $slamSpd: 450 / Math.sqrt(2), $slamDelay: 690,
    $slamCharge1Ms: 300, $slamCharge2Ms: 630, $slamCharge3Ms: 750,
    $slamPunishMs: 1500, $slamPunishSlow: 0.25, $slamDecel: 550 / Math.sqrt(2),
    $missileVel: 550, $missileAcl: 800, $missileDmg: 2.1, $missilePDmg: [0.3,4.5],
    $shotgunCnt: 18, $shotgunInitAng: 0.023, $shotgunAng: 0.009,
    $shotgunSpd: 650, $shotgunDmg: 0.082, $shotgunPDmg: [0.09,0.28], $shotgunLsMs: 305,
    $shotgunSlamDelayMult: 0.55,
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'aceSlam.png' ]),
    
    initControlProps(ms) { return { w1Mark: ms, w1StartMark: null, w2Mark: ms, w2StartMark: null };},
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    aceDoStep(ud, { a1, a2 }) {
      
      let { aheadDist, ms, spf } = ud;
      let forces = [];
      
      // Slam Kid is symmetrical; do the same thing in two directions:
      let dirs = [
        [ -1, a1, 'w1Mark', 'w1StartMark' ],
        [ +1, a2, 'w2Mark', 'w2StartMark' ]
      ];
      
      for (let [ mult, act, wMark, wStartMark ] of dirs) {
        
        if (act && ms > this[wMark] && (!this[wStartMark] || ms < this[wStartMark] + Form.slamCharge3Ms)) {
          
          if (!this[wStartMark]) {
            
            this[wStartMark] = ms;
            let inc1 = 10; let inc2 = 20;
            let args = { slamKid: this, team: 'ace', dir: mult };
            ud.spawnEntity({ type: 'SlamKidSlammer', ...args, xOff: +inc2 + (mult * 20), yOff: (-inc2 * mult) + 16 });
            ud.spawnEntity({ type: 'SlamKidSlammer', ...args, xOff: +inc1 + (mult * 20), yOff: (-inc1 * mult) + 16 });
            ud.spawnEntity({ type: 'SlamKidSlammer', ...args, xOff:     0 + (mult * 20), yOff: (    0 * mult) + 16 });
            ud.spawnEntity({ type: 'SlamKidSlammer', ...args, xOff: -inc1 + (mult * 20), yOff: (+inc1 * mult) + 16 });
            ud.spawnEntity({ type: 'SlamKidSlammer', ...args, xOff: -inc2 + (mult * 20), yOff: (+inc2 * mult) + 16 });
            
          }
          
          let duration = ms - this[wStartMark];
          let durFade = Math.pow(util.fadeAmt(1, 0.1, duration / Form.slamCharge3Ms), 0.95);
          let spd = Form.slamSpd;
          forces.push([ this[wStartMark], 'acl', spd * mult, spd, Form.slamDecel * mult * -1, Form.slamDecel * -1 ]);
          
        } else if (this[wStartMark]) {
          
          let duration = ms - this[wStartMark];
          if (duration >= Form.slamCharge3Ms) {
            
            // Nothing right now for exceeding charge duration
            this[wMark] = ms + Form.slamDelay;
            
          } else if (duration >= Form.slamCharge2Ms) {
            
            // No effect for releasing in the last part of the charge
            this[wMark] = ms + Form.slamDelay;
            
          } else if (duration >= Form.slamCharge1Ms) {
            
            // Missile!!
            let { x, y } = this.getRelGeom(ud);
            let missileArgs = {
              owner: this, team: 'ace',
              ax: x + (mult * 9), ay: y,
              vel: Form.missileVel, acl: Form.missileAcl,
              dmg: Form.missileDmg, pDmg: Form.missilePDmg,
              bound: { form: 'rect', w: 5, h: 18 },
              lsMs: 2000
            };
            ud.spawnEntity({ type: 'MBullet', ...missileArgs, ang: 0.0 });
            ud.spawnEntity({ type: 'MBullet', ...missileArgs, ang: 0.5 });
            
            this.effects.add({ mark: ms + 150, type: 'force', force: [ ms, 'vel', 0, -220 ] });
            this[wMark] = ms + Form.slamDelay;
            
          } else {
            
            // Shotgun!
            let { x, y } = this.getRelGeom(ud);
            let shotgunArgs = {
              aheadDist, ms, owner: this, team: 'ace', ax: x + mult * 7, ay: y - 7,
              dmg: Form.shotgunDmg, pDmg: Form.shotgunPDmg,
              vel: Form.shotgunSpd,
              lsMs: Form.shotgunLsMs,
              bound: { form: 'circle', r: 2 }
            };
            for (let ang of util.incCen(Form.shotgunCnt, Form.shotgunAng)) ud.spawnEntity({
              type: 'MBullet', ...shotgunArgs, ang: mult * (0.125 + ang)
            });
            
            this.effects.add({ mark: ms + 300, type: 'spdMult', spdMult: 1.2 });
            this.effects.add({ mark: ms + 300, type: 'force', force: [ ms, 'vel', -50 * mult, -50 ] });
            
            this[wMark] = ms + Form.slamDelay * Form.shotgunSlamDelayMult;
            
          }
          
          this[wStartMark] = null;
          
        }
        
      }
      
      let spdMult = (this.w1StartMark || this.w2StartMark) ? 0.55 : 1;
      return { spdMult, forces };
      
    }
    
  })});
  let SalvoLad = form({ name: 'SalvoLad', has: { Ace }, props: (forms, Form) => ({
    
    $comboDelayMs: 800, $comboPunishDelayMs: 1000,
    $decampDelayMs: 1200, $decampDurationMs: 350, $decampSpdMult: 0.5, $decampSpd: 430,
    $diveDelayMs: 600, $diveMs: 690, $diveSpdMult: 0.60, $diveFwdMult: 450, $diveBombLsMs: 1200,
    $missileDelayMs: 600, $missileDmg: 1, $missilePDmg:  [0.1,3.9],
    $suppressDelayMs: 600, $suppressDmg: 0.4,
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'aceSalvo.png' ]),
    
    initControlProps(ms) { return {
      // "a1Up" and "a2Up" help ensure one entry per key press
      readyMark: null, combo: '', a1Up: false, a2Up: false
    }; },
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr, { comboMapping: {
      '<<<': i.comboDecamp.bind(i, -1),
      '>>>': i.comboDecamp.bind(i, +1),
      
      '<<>': i.comboDiveBomb.bind(i, -1),
      '>><': i.comboDiveBomb.bind(i, +1),
      
      '<>>': i.comboMissiles.bind(i, -1),
      '><<': i.comboMissiles.bind(i, +1),
      
      '<><': i.comboSuppress.bind(i, -1),
      '><>': i.comboSuppress.bind(i, +1)
    }})),
    
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'readyMark', 'combo' ].gain(...arr)),
    comboDecamp(dir, ud) {
      
      this.invulnMark = Math.max(this.invulnMark || 0, ud.ms + Form.decampDurationMs);
      this.effects.add({ mark: ud.ms + Form.decampDurationMs, type: 'force', force: [ ud.ms, 'vel', Form.decampSpd * dir, 0 ] });
      this.effects.add({ mark: ud.ms + Form.decampDurationMs, type: 'spdMult', spdMult: Form.decampSpdMult });
      
      let { x, y } = this.getRelGeom(ud);
      let missileArgs = { salvoLad: this, team: 'ace', ax: x, ay: y };
      ud.spawnEntity({ type: 'SalvoLadDumbBomb', ...missileArgs, ang: 0.5 + dir * 0.000, vel:  15, lsMs:  400, kaboomArgs: { dps: 4.75, lsMs: 1900 } });
      ud.spawnEntity({ type: 'SalvoLadDumbBomb', ...missileArgs, ang: 0.5 + dir * 0.005, vel: 120, lsMs:  700, kaboomArgs: { dps: 4.75, lsMs: 2300 } });
      ud.spawnEntity({ type: 'SalvoLadDumbBomb', ...missileArgs, ang: 0.5 - dir * 0.005, vel: 150, lsMs: 1050, kaboomArgs: { dps: 4.75, lsMs: 2150 } });
      
      return { delayMs: Form.decampDelayMs };
      
    },
    comboDiveBomb(dir, { ms, spf, aheadDist }) {
      
      this.effects.add({ mark: ms + Form.diveMs, type: 'spdMult', spdMult: Form.diveSpdMult });
      this.effects.add({ mark: ms + Form.diveMs, type: 'force', force: [ ms, 'acl', 140 * dir, 0, 0, 710 ] });
      this.effects.add({ mark: ms + Form.diveMs, endFn: (i, ud) => {
        
        let { x, y } = i.getRelGeom(ud);
        let lsMsMult = this.controls.d[0] ? 0.65 : (this.controls.u[0] ? 1.5 : 1);
        
        let missileArgs = { type: 'SalvoLadDumbBomb', salvoLad: i, team: 'ace', ax: x, ay: y };
        ud.spawnEntity({ ...missileArgs, ang: dir * 0.109, vel: 140, lsMs: Form.diveBombLsMs * lsMsMult * 1.010, kaboomArgs: { dps: 4.75, lsMs: 1900 } });
        ud.spawnEntity({ ...missileArgs, ang: dir * 0.078, vel: 158, lsMs: Form.diveBombLsMs * lsMsMult * 1.000, kaboomArgs: { dps: 4.75, lsMs: 2300 } });
        ud.spawnEntity({ ...missileArgs, ang: dir * 0.030, vel: 148, lsMs: Form.diveBombLsMs * lsMsMult * 0.989, kaboomArgs: { dps: 4.75, lsMs: 2150 } });
        
        this.effects.add({ mark: ud.ms + 350, type: 'force', force: [ ud.ms, 'vel', 0, -150 ] });
        
      }});
      return { delayMs: Form.diveDelayMs };
      
    },
    comboMissiles(dir, ud) {
      
      let args = {
        owner: this, team: 'ace',
        w: 6, h: 20, vel: 700, ang: 0,
        dmg: Form.missileDmg, pDmg: Form.missilePDmg,
        step1Ang: 0.30 * dir
      };
      (3).toArr(n => n).each(n => {
        this.effects.add({ mark: ud.ms + n * 200, endFn: (i, ud) => {
          
          let { x, y } = i.getRelGeom(ud);
          ud.spawnEntity({
            type: 'SalvoLadMissile', ...args, x: x + 10 * dir, y: y - 15,
          });
          
        }});
      });
      return { delayMs: Form.missileDelayMs };
      
    },
    comboSuppress(dir, ud) {
      
      this.effects.add({ mark: ud.ms + 500, type: 'spdMult', spdMult: 1.5 });
      
      let args = { team: 'ace', ang: dir * 0.11, dmg: Form.suppressDmg, bound: { form: 'circle', r: 4 }, lsMs: 500, vel: 360, acl: 800 };
      for (let i = 0; i < 11; i++) {
        let alt = i % 4;
        this.effects.add({ mark: ud.ms + 50 + i * alt * 18, endFn: (i, ud) => {
          let { x, y } = i.getRelGeom(ud);
          x += 6 * alt * dir;
          y += 30 - 12 * alt
          ud.spawnEntity({ type: 'MBullet', owner: i, ...args, ax: x, ay: y });
        }});
      }
      return { delayMs: Form.suppressDelayMs };
      
    },
    aceDoStep(ud, { a1, a2 }) {
      
      let { ms, spf } = ud;
      
      if (this.readyMark && ms >= this.readyMark) { this.readyMark = null; this.combo = ''; }
      
      if (!this.readyMark) {
        
        if (a1) {
          if (!this.a1Up && !a2) { this.combo += '<'; this.a1Up = true; }
        } else if (this.a1Up) {
          this.a1Up = false;
        }
        
        if (a2) {
          if (!this.a2Up && !a1) { this.combo += '>'; this.a2Up = true; }
        } else if (this.a2Up) {
          this.a2Up = false;
        }
        
        if (this.comboMapping.has(this.combo)) {
          let comboResult = this.comboMapping[this.combo](ud);
          this.readyMark = ms + comboResult.delayMs;
        } else if (this.combo.length >= 5) {
          this.effects.add({ mark: ms + Form.comboPunishDelayMs, type: 'spdMult', spdMult: 0.45 });
          this.readyMark = ms + Form.comboDelayMs;
        }
        
      }
      
    },
    
    render(ud, draw) {
      
      forms.Ace.render.call(this, ud, draw);
      
      let { x, y } = this.getAbsGeom(ud);
      let readyMark = this.readyMark;
      let combo = this.combo;
      
      let waitMs = readyMark - ud.ms;
      let dispY = y - 16;
      let indSize = 8;
      let comboW = combo.length * indSize;
      
      if (waitMs > 0) {
        
        let waitAmt = Math.min(waitMs / 750, 1);
        if (combo.length < 3) comboW = 3 * indSize;
        draw.rectCen(x, dispY, waitAmt * (comboW + 4), indSize + 4, { fillStyle: 'rgba(80, 80, 80, 0.4)' });
        
      }
      if (combo.length > 0) {
      
        let hIndSize = indSize >> 1;
        let comboW = combo.length * indSize;
        draw.rectCen(x, dispY, comboW + 4, indSize + 4, { strokeStyle: 'rgba(80, 80, 80, 0.4)', lineWidth: 1 });
        
        let dispX = x - (comboW >> 1);
        for (let c of combo) {
          draw.path({ fillStyle: '#000000' }, ({ jump, draw }) => {
            if (c === '<') {
              jump(dispX + indSize, dispY - hIndSize);
              draw(dispX, dispY);
              draw(dispX + indSize, dispY + hIndSize);
            } else if (c === '>') {
              jump(dispX, dispY - hIndSize);
              draw(dispX + indSize, dispY);
              draw(dispX, dispY + hIndSize);
            }
          });
          dispX += indSize;
        }
        
      };
      
    }
    
  })});
  
  // GOOD GUY UTIL
  let JoustManBullet = form({ name: 'JoustManBullet', has: { MBullet }, props: (forms, Form) => ({
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      let r = this.bound.r;
      draw.circ(x, y, r,       { fillStyle: 'rgba(0, 255, 255, 0.65)' });
      draw.circ(x, y, r * 0.6, { fillStyle: 'rgba(255, 255, 255, 0.4)' });
    }
  })});
  let JoustManLaserSphere = form({ name: 'JoustManLaserSphere', has: { Entity }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { xOff, yOff, r, dps, joustMan=null, joustManUid=joustMan.uid } = val;
      return {}.gain(...arr, { xOff, yOff, r, dps, joustMan, joustManUid });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'xOff', 'yOff', 'r', 'joustManUid' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) tail.takeDamage(ud, this.rel(ud, 'joustMan'), this.dps * ud.spf);
    },
    getRelGeom(ud) {
      let { x, y } = this.rel(ud, 'joustMan').getRelGeom(ud);
      return { form: 'circle', r: this.r, x: x + this.xOff, y: y + this.yOff };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'ace',
      sides: [ 'head' ]
    }}; },
    isAlive(ud) {
      return true
        && forms.Entity.isAlive.call(this, ud)
        && this.rel(ud, 'joustMan').isAlive(ud);
    },
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      let r = this.r;
      draw.circ(x, y, r, { fillStyle: 'rgba(0, 255, 255, 0.65)' });
      draw.circ(x, y, r * 0.6, { fillStyle: 'rgba(255, 255, 255, 0.4)' });
    }
    
  })});
  let JoustManLaserVert = form({ name: 'JoustManLaserVert', has: { Entity }, props: (forms, Form) => ({
    
    $dps: 23, $w: 22, $h: 1200,
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { joustMan=null, joustManUid=joustMan.uid } = val;
      return {}.gain(...arr, { joustMan, joustManUid });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'joustManUid' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) tail.takeDamage(ud, this.rel(ud, 'joustMan'), Form.dps * ud.spf);
    },
    getClippedHeight(ud) {
      
      let joustMan = this.rel(ud, 'joustMan');
      let { x: relX, y: relY } = joustMan.getRelGeom(ud);
      let { x: absX, y: absY } = joustMan.getAbsGeom(ud);
      
      // A bound from JoustMan all the way until the top of the viewport
      let boundH = ud.bounds.total.t - absY;
      let absBigBound = {
        form: 'rect',
        w: Form.w,
        h: boundH,
        x: absX,
        y: absY + boundH * 0.5
      };
      
      // Find all valid Entities struck by the laser, and return their
      // bottom (this is where the laser should cease since it has hit
      // something physical)
      let lowestBottom = ud.bounds.total.t;
      for (let [ uid, ent ] of ud.entities) {
        
        // This actually prevents stack-overflow! TODO: This is janky!!
        // Should be able to query `team` and `sides` individually,
        // without needing to get them as part of a bound+team+sides
        // package deal. This is necessary because we can't afford to
        // get our own (`this` Entity's) "package deal" as it will
        // contain bounding information, and `getClippedHeight` must
        // resolve in order to get that bounding information - circular!
        if (ent.constructor === this.constructor) continue;
        
        let { tangibility: { bound, team, sides } } = ent.getState(ud);
        
        // Ignore friendlies and unbounded/non-tail-collidable Entities
        if (team === 'ace' || !bound || !bound.has('form') || !sides.has('tail')) continue;
        
        // Ignore anything not clipping the laser
        if (!geom.doCollide(absBigBound, bound)) continue;
        
        let entRect = geom.containingRect(bound);
        let bottom = entRect.y - (entRect.h * 0.5);
        
        if (bottom < lowestBottom) lowestBottom = bottom;
        
      }
      
      return lowestBottom - absY;
      
    },
    getRelGeom(ud) {
      let { x, y } = this.rel(ud, 'joustMan').getRelGeom(ud);
      let h = this.getClippedHeight(ud) + 10;
      return { form: 'rect', w: Form.w, h, x, y: y + 8 + (h * 0.5) };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'ace',
      sides: [ 'head' ]
    }}; },
    isAlive(ud) {
      return true
        && forms.Entity.isAlive.call(this, ud)
        && this.rel(ud, 'joustMan').isAlive(ud);
    },
    
    render(ud, draw) {
      let { x, y, h } = this.getAbsGeom(ud);
      draw.rectCen(x, y, Form.w, h, { fillStyle: 'rgba(0, 255, 255, 0.65)' });
      draw.rectCen(x, y, Form.w * 0.6, h, { fillStyle: 'rgba(255, 255, 255, 0.4)' });
    }
    
  })});
  let JoustManLaserJoust = form({ name: 'JoustManLaserJoust', has: { MBullet }, props: (forms, Form) => ({
    $bound: { form: 'rect', w: 34, h: 20 },
    $vel: 800,
    $lsMs: 650,
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr, { bound: Form.bound, vel: Form.vel, lsMs: Form.lsMs, ang: 0 })),
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      draw.rectCen(x, y, Form.bound.w, Form.bound.h, { fillStyle: 'rgba(0, 255, 255, 0.64)' });
      draw.rectCen(x, y, Form.bound.w * 0.6, Form.bound.h, { fillStyle: 'rgba(255, 255, 255, 0.4)' });
    }
  })});
  let JoustManLaserHorz = form({ name: 'JoustManLaserHorz', has: { Entity }, props: (forms, Form) => ({
    
    $dps: 30, $w: 125, $h: 12,
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { joustMan=null, joustManUid=joustMan.uid, team, dir } = val;
      return {}.gain(...arr, { joustMan, joustManUid, team, dir });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'joustManUid', 'dir' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) tail.takeDamage(ud, this.rel(ud, 'joustMan'), Form.dps * ud.spf);
    },
    getRelGeom(ud) {
      let { x, y } = this.rel(ud, 'joustMan').getRelGeom(ud);
      return { form: 'rect', w: Form.w, h: Form.h, x: x + Form.w * -0.5 * this.dir, y };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: this.team && this.team,
      sides: [ 'head' ]
    }}; },
    isAlive(ud) {
      return true
        && forms.Entity.isAlive.call(this, ud)
        && this.rel(ud, 'joustMan').isAlive(ud);
    },
    render(ud, draw) {
      let { x: jx, y: jy } = this.rel(ud, 'joustMan').getAbsGeom(ud);
      let { x, y } = this.getAbsGeom(ud);
      draw.circ(jx, jy, 20, { fillStyle: 'rgba(0, 255, 255, 0.5)' });
      draw.rectCen(x, y, Form.w, Form.h, { fillStyle: 'rgba(0, 255, 255, 0.65)' });
      draw.rectCen(x, y, Form.w, Form.h * 0.6, { fillStyle: 'rgba(255, 255, 255, 0.4)' });
    }
    
  })});
  let SlamKidSlammer = form({ name: 'SlamKidSlammer', has: { Entity }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 7 }, $dmg: 1.4,
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { team, slamKid=null, slamKidUid=slamKid.uid, dir, xOff, yOff, integrity=1 } = val;
      return {}.gain(...arr, { team, slamKid, slamKidUid, dir, xOff, yOff, integrity });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'slamKidUid', 'xOff', 'yOff' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) {
        tail.takeDamage(ud, this.rel(ud, 'slamKid'), Form.dmg);
        this.integrity = 0;
      }
    },
    getRelGeom(ud) {
      let { x, y } = this.rel(ud, 'slamKid').getRelGeom(ud);
      return { ...Form.bound, x: x + this.xOff, y: y + this.yOff };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: this.team,
      sides: [ 'head' ]
    }}; },
    isAlive(ud) {
      if (this.integrity <= 0) return false;
      let sk = this.rel(ud, 'slamKid');
      return true
        && sk.isAlive(ud) // SlamKid is alive
        && sk[(this.dir === -1) ? 'w1StartMark' : 'w2StartMark'] // Slammer is held
    },
    
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      draw.circ(x, y, Form.bound.r, { fillStyle: '#ff8000' });
    },
    
  })});
  let SalvoLadDumbBomb = form({ name: 'SalvoLadDumbBomb', has: { Entity, Mover }, props: (forms, Form) => ({
    
    $r: 13,
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { team=null, salvoLad=null, kaboomArgs={} } = val;
      return {}.gain(...arr, { team, salvoLad, kaboomArgs });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    getRelGeom(ud) { return { form: 'circle', r: Form.r, ...forms.Mover.getRelGeom.call(this, ud) }; },
    getState(ud) {
      return { tangibility: {
        bound: this.getAbsGeom(ud),
        team: this.team,
        sides: []
      }};
    },
    getDieResult(ud) {
      forms.Entity.getDieResult.call(this, ud);
      
      let { x, y } = this.getRelGeom(ud);
      ud.spawnEntity({ type: 'SalvoLadKaboom', team: this.team, salvoLad: this.rel(ud, 'salvoLad'), ax: x, ay: y, ...this.kaboomArgs });
    },
    isAlive: forms.Entity.isAlive
  })});
  let SalvoLadKaboom = form({ name: 'SalvoLadKaboom', has: { Entity, Physical }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { team=null, salvoLad=null, r=0, dps=3.1, sizePerSec=30 } = val;
      return {}.gain(...arr, { team, salvoLad, r, dps, sizePerSec });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'sizePerSec' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) tail.takeDamage(ud, this.salvoLad, this.dps * ud.spf);
    },
    getRelGeom(ud) {
      let { x, y } = forms.Physical.getRelGeom.call(this, ud);
      return { form: 'circle', x, y, r: this.sizePerSec * this.getAgeMs(ud) * 0.001 };
    },
    doStep(ud) {
      this.setForces(ud, [ [ this.ms, 'vel', 0, ud.level.getVelAcl(ud).vy * -0.5 ] ]);
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: this.team,
      sides: [ 'head' ]
    }}; },
    
    render(ud, draw) {
      let { x, y, r } = this.getAbsGeom(ud);
      draw.circ(x, y, r, { fillStyle: 'rgba(255, 50, 30, 0.2)', strokeStyle: '#ff8400' });
    }
    
  })});
  let SalvoLadMissile = form({ name: 'SalvoLadMissile', has: { MBullet }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      
      let args = { horzSpd: 0, horzMs: 400, step1Ang: 0.5, ang: 0, bound: { form: 'rect', w: 6, h: 18 } };
      
      // Any properties in `val` replace those in `args`
      return ({}).gain(...arr, args.map((v, k) => val.has(k) ? val[k] : v));
      
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'horzSpd', 'horzMs' ].gain(...arr)),
    doStep(ud) {
      
      let durMs = this.getAgeMs(ud);
      if (durMs < this.horzMs) {
        this.setMoveSpd(ud, 250, -500);
        this.setPolarDest(ud, this.step1Ang);
      } else {
        this.setMoveSpd(ud, -200, +3500);
        this.setPolarDest(ud, 0);
      }
      
    }
    
  })});
  
  // BAD GUYS
  let clean = 0;
  if (clean) {
    
    let Enemy = form({ name: 'Enemy', has: { Mortal }, props: (forms, Form) => ({
      
      initProps() { return { scoreDamage: 0 }; },
      initSyncs() { return []; },
      
      getCollideResult(ud, ent) {
        console.log(`${getFormName(this)} -> ${getFormName(ent)}`);
        if (hasForm(ent, Mortal)) ent.takeDamage(ud, this, 1);
      },
      getRot(ud) { return 0; },
      getImgKeep(ud) { return this.constructor.imageKeep; },
      getMaxHp(ud) { return this.constructor.maxHp; },
      getBound(ud) { return this.constructor.bound; },
      getState(ud) { return { tangibility: {
        bound: { ...this.getBound(), ...this.getAbsGeom(ud) },
        team: 'enemy',
        sides: [ 'head', 'tail' ]
      }}; },
      
      render(ud, draw) { draw.frame(() => {
        let { x, y } = this.getAbsLoc(ud);
        draw.trn(x, y);
        draw.rot(this.getRot(ud));
        
        let imgKeep = this.getImgKeep(ud);
        let bound = this.getBound(ud);
        if (imgKeep) {
          let rect = geom.containingRect(bound);
          draw.imageCen(imgKeep, 0, 0, rect.w, rect.h);
        } else {
          let style = { fillStyle: '#f00', strokeStyle: '#800', lineWidth: 3 };
          if (bound && [ 'rect', 'circle' ].has(bound.form)) {
            if (bound.form === 'rect')  draw.rectCen(0, 0, bound.w, bound.h, style);
            else                        draw.circ(0, 0, bound.r, style);
          } else {
            draw.circ(0, 0, 10, { fillStyle: '#f00' });
          }
        }
        
      }); }
      
    })});
    let WaveMotion = form({ name: 'WaveMotion', props: (forms, Form) => ({
      
      initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
        let { x, y, ax=x, ay=y, spd=100, delayMs=0, phase=0, swingHz=0, swingAmt=0 } = val;
        if (swingHz < 0) throw Error(`Negative "swingHz" param; use negative "swingAmt" instead`);
        return {}.gain(...arr, { ax, ay, spd, delayMs, phase, swingHz, swingAmt });
      }),
      initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'ax', 'ay', 'spd', 'delayMs', 'phase', 'swingHz', 'swingAmt' ].gain(...arr)),
      getRelGeom(ud) {
        let durMs = this.getAgeMs(ud);
        let { ax, ay, spd, delayMs, phase, swingHz, swingAmt } = this;
        return {
          x: (durMs >= delayMs)
            ? ax + Math.sin((Math.PI * 2) * (phase + (durMs - delayMs) * 0.001 * swingHz)) * swingAmt
            : ax,
          y: ay + spd * durMs * 0.001
        };
      },
      isAlive(ud) {
        let { y } = this.getAbsGeom(ud);
        if (this.spd > 0 && y > ud.bounds.total.t + 30) return false;
        if (this.spd < 0 && y < ud.bounds.total.b - 30) return false;
        return true;
      }
      
    })});
    
  }
  
  let Enemy = form({ name: 'Enemy', has: { Mortal }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr, { scoreDamage: 0 })),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    getCollideResult(ud, ent) {
      console.log(`${getFormName(this)} -> ${getFormName(ent)}`);
      if (hasForm(ent, Mortal)) ent.takeDamage(ud, this, 1);
    },
    getState(ud) { return { tangibility: {
      bound: { form: 'circle', r: 30, ...this.getAbsGeom(ud) },
      team: 'enemy',
      sides: [ 'head', 'tail' ]
    }}; },
    
    render(ud, draw) {
      
      let { x, y, r=null } = this.getAbsGeom(ud);
      
      if (r === null && this.constructor.bound && this.constructor.bound.r) r = this.constructor.bound.r;
      if (r === null) r = 8;
      draw.circ(x, y, r, { fillStyle: '#00a000' });
      
    }
    
  })});
  let Spawner = form({ name: 'Spawner', props: (forms, Form) => ({
    
    init: C.noFn('init'),
    getSpawnTypes() { return { spawn: { type: this.constructor.name } }; },
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      
      let { ms } = val;
      let spawnTypes = i.getSpawnTypes();
      let props = {};
      for (let st in spawnTypes) {
        
        props[`${st}Mode`] = val.has(`${st}Mode`)
          ? val[`${st}Mode`]
          : 'steady';
        
        props[`${st}DelayMs`] = val.has(`${st}DelayMs`)
          ? val[`${st}DelayMs`]
          : 2500;
        
        props[`${st}Props`] = spawnTypes[st].gain(val.has(`${st}Props`)
          ? val[`${st}Props`]
          : {});
        
        props[`${st}Mark`] = ms + (val.has(`${st}InitDelayMs`)
          ? val[`${st}InitDelayMs`]
          : props[`${st}DelayMs`]);
        
      }
      
      let r = {}.gain(...arr, props, { spawnTypes: spawnTypes.toArr((v, k) => k) });
      return r;
    }),
    doSpawn(ud, spawnType, props) {
      let { ms } = ud;
      let { x, y } = this.getRelGeom(ud);
      return ud.spawnEntity({ ms, ...props, owner: this, x, y });
    },
    doStep(ud) {
      
      for (let st of this.spawnTypes) {
        
        let mode = this[`${st}Mode`];
        let delayMs = this[`${st}DelayMs`];
        let mark = this[`${st}Mark`];

        let spawnCnd = (mode === 'steady')
          ? (ud.ms >= mark)
          : (ud.random.genQ() < ((ud.spf * 1000) / delayMs));
        
        if (spawnCnd) {
          let props = this[`${st}Props`];
          if (props.has('fn')) props = { ...props, ...props.fn(this, ud) };
          
          this.doSpawn(ud, st, props);
          this[`${st}Mark`] += delayMs;
        }
        
      }
      
    }
    
  })});
  
  let Winder = form({ name: 'Winder', has: { Enemy }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 20 }, $hp: 1,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyWinder.png' ]),
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { x, y, ax=x, ay=y, spd=100, delayMs=0, phase=0, swingHz=0, swingAmt=0 } = val;
      if (swingHz < 0) throw Error(`Negative "swingHz" param; use negative "swingAmt" instead`);
      return {}.gain(...arr, { ax, ay, spd, delayMs, phase, swingHz, swingAmt });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'ax', 'ay', 'spd', 'delayMs', 'phase', 'swingHz', 'swingAmt' ].gain(...arr)),
    getMaxHp(ud) { return this.constructor.hp; },
    getRelGeom(ud) {
      let durMs = this.getAgeMs(ud);
      let ax = this.ax; let ay = this.ay;
      let spd = this.spd;
      let delayMs = this.delayMs;
      let phase = this.phase;
      let swingHz = this.swingHz;
      let swingAmt = this.swingAmt;
      
      return {
        ...this.constructor.bound,
        x: (durMs >= delayMs)
          ? ax + Math.sin((Math.PI * 2) * (phase + (durMs - delayMs) * 0.001 * swingHz)) * swingAmt
          : ax,
        y: ay + spd * durMs * 0.001
      };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'enemy',
      sides: [ 'head', 'tail' ]
    }}; },
    isAlive(ud) {
      if (!forms.Enemy.isAlive.call(this, ud)) return false;
      
      let { y } = this.getAbsGeom(ud);
      if (this.spd > 0 && y > ud.bounds.total.t + 30) return false;
      if (this.spd < 0 && y < ud.bounds.total.b - 30) return false;
      
      return true;
    },
    
    render(ud, draw) {
      
      let { x, y } = this.getAbsGeom(ud);
      let ext = this.constructor.bound.r * 2;
      draw.frame(() => {
        draw.trn(x, y);
        draw.rot((this.spd <= 0) ? Math.PI : 0);
        draw.imageCen(this.constructor.imageKeep, 0, 0, ext, ext);
      });
      
    }
    
  })});
  let Weaver = form({ name: 'Weaver', has: { Winder }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 34 }, $hp: 8,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyWeaver.png' ]),
    
  })});
  let Furler = form({ name: 'Furler', has: { Winder, Spawner }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 24 }, $hp: 4,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyFurler.png' ]),
    
    getSpawnTypes() {
      return {
        shoot: { type: 'MBullet', vel: 150, ang: 0.5, dmg: 1, lsMs: 3000, bound: { form: 'rect', w: 3, h: 12 } }
      };
    },
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr)),
    syncProps: utils.fa(forms, 'syncProps', (i, arr) => [].gain(...arr)),
    doStep: forms.Spawner.doStep,
    doSpawn(ud, spawnType, props) {
      
      if (spawnType !== 'shoot')
        return forms.Spawner.doSpawn.call(this, ud, spawnType, props);
      
      let { x, y } = this.getRelGeom(ud);
      let b1 = ud.spawnEntity({ ...props, team: 'enemy', owner: this, ax: x - Form.bound.r * 0.55, ay: y });
      let b2 = ud.spawnEntity({ ...props, team: 'enemy', owner: this, ax: x + Form.bound.r * 0.55, ay: y });
      
    },
    
  })});
  let Gunner = form({ name: 'Gunner', has: { Winder }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 24 }, $hp: 6,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyGunner.png' ]),
    
    // Outer timer tracks delay between bursts; inner timer tracks delay
    // between individual shots within the burst
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => ({ shotTimer: Timer(1000, Timer(100)) }).gain(...arr)),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr, val) => ([]).gain(...arr)),
    
    doStep(ud) {
      
      let target = ud.entities.find(ent => {
        let { tangibility: { team, sides } } = ent.getState(ud);
        return team === 'ace' && sides.has('tail');
      }).val;
      
      let events = this.shotTimer.getTimings(ud);
      if (target) {
        for (let { ms } of events) {
          ud.spawnEntity({
            type: 'MBullet', ...({})
          });
        }
      }
      
      
    }
    
    
  })});
  let Rumbler = form({ name: 'Rumbler', has: { Enemy, Mover }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 16 }, $hp: 7,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyRumbler.png' ]),
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => ({}).gain(...arr, {})),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    
    outOfBoundsTolerance(ud) { return 300; },
    getMaxHp(ud) { return this.constructor.hp; },
    isAlive: utils.fa(forms, 'isAlive', (i, arr) => arr.all()),
    getRelGeom(ud) {
      let { x, y, ...args } = forms.Mover.getRelGeom.call(this, ud);
      return { ...Form.bound, x, y };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'enemy',
      sides: [ 'head', 'tail' ]
    }}; },
    doStep(ud) {
      let { arrived } = forms.Mover.getRelGeom.call(this, ud);
      if (!arrived) return;
      
      let { tangibility: { bound: b } } = this.getState(ud);
      let aces = ud.entities.toArr(ent => {
        if (!ent.isAlive(ud)) C.skip;
        
        let { tangibility: { bound, team, sides } } = ent.getState(ud);
        if (team !== 'ace') return C.skip;
        if (!sides.has('tail')) return C.skip;
        
        return bound;
      })
        .sort((b1, b2) => geom.distSqr(b, b1) - geom.distSqr(b, b2));
      
      if (aces.length) {
        
        let { x, y } = aces[0];
        let ang = Math.atan2(x - b.x, y - b.y);
        let vec = { x: Math.sin(ang), y: Math.cos(ang) };
        let rAng = ang + Math.PI * 0.5 * ud.random.genSign();
        let rVec = { x: Math.sin(rAng), y: Math.cos(rAng) };
        
        let [ dc, dr, oc, or ] = [ 60, 100, 0, 20 ];
        
        let d = dc + ud.random.genQ() * dr;
        let o = oc + ud.random.genQ() * or;
        this.setCarteDest(ud, vec.x * d + rVec.x * o, vec.y * d + rVec.y * o);
        
      } else {
        this.setPolarDest(ud, ud.random.genQ(), 20);
      }
      
    },
    getDieResult(ud) {
      
      let { x, y } = this.getRelGeom(ud);
      ud.spawnEntity({ type: 'RumblerKaboom', ax: x, ay: y, lsMs: 3000 });
      forms.Enemy.getDieResult.call(this, ud);
      
    },
    
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      draw.frame(() => {
        draw.trn(x, y);
        draw.rot(this.ang * Math.PI * 2);
        draw.imageCen(this.constructor.imageKeep, 0, 0, Form.bound.r  * 2);
      });
    }
    
  })});
  let RumblerKaboom = form({ name: 'RumblerKaboom', has: { Entity, Physical }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { r=0, sizePerSec=30 } = val;
      return {}.gain(...arr, { r, sizePerSec });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'sizePerSec' ].gain(...arr)),
    getCollideResult(ud, tail) {
      if (hasForm(tail, Mortal)) tail.takeDamage(ud, null, 1);
    },
    getRelGeom(ud) {
      let { x, y } = forms.Physical.getRelGeom.call(this, ud);
      return { form: 'circle', x, y, r: this.sizePerSec * this.getAgeMs(ud) * 0.001 };
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'enemy',
      sides: [ 'head' ]
    }}; },
    
    render(ud, draw) {
      let { x, y, r } = this.getAbsGeom(ud);
      draw.circ(x, y, r, { fillStyle: 'rgba(100, 155, 0, 0.5)', strokeStyle: '#50a500' });
    }
    
  })});
  
  let Drifter = form({ name: 'Drifter', has: { Enemy, Mover }, props: (forms, Form) => ({
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyDrifter.png' ]),
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { initHp=2, minSize=16, hpPerSec=1.33, sizeMult=1.75 } = val;
      return {}.gain(...arr, { initHp, minSize, hpPerSec, sizeMult, dist: null });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'initHp', 'hpDmg', 'minSize', 'hpPerSec', 'sizeMult' ].gain(...arr)),
    getRelGeom(ud) {
      
      let { x, y } = forms.Mover.getRelGeom.call(this, ud);
      let hpDmg = this.hpDmg;
      let sizeMult = this.sizeMult;
      let minSize = this.minSize;
      return { form: 'circle', x, y, r: minSize + (this.getMaxHp(ud) - hpDmg) * sizeMult };
      
    },
    getMaxHp(ud) {
      return this.initHp + this.hpPerSec * this.getAgeMs(ud) * 0.001;
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'enemy',
      sides: [ 'head', 'tail' ]
    }}; },
    isAlive(ud) {
      return true
        && forms.Enemy.isAlive.call(this, ud)
        && forms.Mover.isAlive.call(this, ud);
    },
    
    render(ud, draw) {
      let { x, y, r } = this.getAbsGeom(ud);
      draw.frame(() => {
        draw.trn(x, y);
        draw.rot((this.ny <= 0) ? Math.PI : 0);
        draw.imageCen(this.constructor.imageKeep, 0, 0, r * 2, r * 2);
      });
    }
    
  })});
  let Wanderer = form({ name: 'Wanderer', has: { Enemy, Mover }, props: (forms, Form) => ({
    
    $bound: { form: 'circle', r: 22 }, $maxHp: 4.5,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyWanderer.png' ]),
    $render: (draw, ud, { x, y, vy }) => {
      Form.parents.Enemy.render(draw, ud, { imageKeep: Form.imageKeep, x, y,
        w: Form.bound.r << 1,
        rot: (vy <= 0) ? Math.PI : 0
      });
    },
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { ms, mode='steady', shootDelayMs=2500, shootDelayInitMs=shootDelayMs, bulletArgs={} } = val;
      return {}.gain(...arr, { mode, shootDelayMs, bulletArgs, shootMark: ms + shootDelayInitMs });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    /*
    getMaxHp() { return Form.maxHp; },
    getStepResult(ud) {
      let { x, y } = this.getRelGeom(ud);
      let { ms, spf } = ud;
      let birth = [];
      
      let shootCondition = (this.mode === 'steady')
        ? (ms >= this.shootMark)
        : (ud.random.genQ() < ((spf * 1000) / this.shootDelayMs));
      
      if (shootCondition) {
        ud.spawnEntity({ type: 'SimpleBullet', ms, owner: this, x, y,
          spd: -380, dmg: 1, w: 8, h: 20,
          lsMs: 3000
        });
        this.shootDelayMs += this.delayMs;
      }
      
      return { tangibility: {
        bound: { ...Form.bound, x, y },
        team: 'enemy',
        sides: [ 'head', 'tail' ]
      }};
      
    },
    */
    isAlive: utils.fa(forms, 'isAlive', (i, arr) => !arr.find(alive => !alive).found)
    
  })});
  let WinderMom = form({ name: 'WinderMom', has: { Enemy, Spawner, Mover }, props: (forms, Form) => ({
    
    $bound: { form: 'rect', w: 160, h: 160 }, $maxHp: 110,
    
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyWinderMom.png' ]),
    
    getSpawnTypes() {
      return { spawn: { type: 'Winder', spd: -100, swingHz: 0, swingAmt: 0 } };
    },
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr)), //C.noFn('initProps'),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)), //C.noFn('initSyncs'),
    getMaxHp() { return Form.maxHp; },
    getRelGeom(ud) { return { ...Form.bound, ...forms.Mover.getRelGeom.call(this, ud) }; },
    doStep: forms.Spawner.doStep,
    doSpawn(ud, spawnType, props) {
      
      if (spawnType !== 'spawn')
        return forms.Spawner.doSpawn.call(this, ud, spawnType, props);
      
      let { x, y } = this.getRelGeom(ud);
      
      ud.spawnEntity({ ...props,
        team: 'enemy', owner: this,
        ax: x + this.Form.bound.w * 0.55 * ud.random.genSign(),
        ay: y
      });
      
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: 'enemy',
      sides: [ 'head', 'tail' ]
    }}; },
    
    isAlive(ud) {
      return true
        && forms.Enemy.isAlive.call(this, ud)
        && forms.Mover.isAlive.call(this, ud);
    },
    render(ud, draw) {
      let { x, y } = this.getAbsGeom(ud);
      let { w, h } = this.Form.bound;
      draw.frame(() => {
        draw.trn(x, y);
        draw.rot((this.ny <= 0) ? Math.PI : 0);
        draw.imageCen(this.Form.imageKeep, 0, 0, w, h);
      });
    }
    
  })});
  let WandererMom = null && form({ name: 'WandererMom', has: { Enemy, Spawner, Mover }, props: (forms, Form) => ({
    
    $bound: { form: 'rect', w: 150, h: 210 },
    $maxHp: 110, $numBullets: 7, $bulletSpd: 330,
    $imageKeep: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'enemyWandererMom.png' ]),
    $render: (draw, ud, { x, y }) => {
      Form.parents.Enemy.render(draw, ud, { imageKeep: Form.imageKeep, x, y,
        w: Form.bound.w, h: Form.bound.h
      });
    },
    
    initProps: utils.fa(forms, 'initProps', (i, arr) => ({}).gain(...arr)), //C.noFn('initProps'),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)), //C.noFn('initSyncs'),
    getMaxHp() { return Form.maxHp; },
    updateAndGetResult(ud) {
      
      let { aheadDist, ms, spf } = ud;
      let birth = [];
      
      // Try to spawn a Wanderer
      if (ms >= this.spawnMark) {
        
        let args = {
          tx: 0, ty: 1,
          ms, x: this.x, y: this.y, spd: 70, mode: 'random',
          ...this.spawnArgs
        };
        args.tx += this.x;
        args.ty += this.y;
        
        birth.gain([ Wanderer(args) ]);
        
        this.spawnMark = ms + this.spawnMs;
        
      }
      
      // Try to shoot `Form.numBullets` bullets
      if (ud.random.genQ() < ((spf * 1000) / this.shootDelayMs)) {
        
        let bulletArgs = { aheadDist, ms, owner: this, x: this.x, y: this.y, vel: Form.bulletSpd, dmg: 1, r: 8 };
        birth.gain(Form.numBullets.toArr(() => MBullet({
          ...bulletArgs, ang: 0.5 + ((ud.random.genQ() - 0.5) * 2 * 0.05), lsMs: 3000
        })));
        
      }
      
      return { x: this.x, y: this.y, ...Form.bound, birth };
      
    },
    isAlive(ud) {
      return true
        && forms.Enemy.isAlive.call(this, ud)
        && forms.Mover.isAlive.call(this, ud);
    }
    
  })});
  
  // LEVEL
  let Level = form({ name: 'Level', has: { Entity, Physical }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      
      let { moments=[] } = val;
      
      let { ms, flyHut, lives=5, outcome='none' } = val;
      let { tw=280, th=350, px=0, py=0, pw=280, ph=350, visiMult=1, globalMsOffset } = val;
      
      return {}.gain(...arr, {
        flyHut,
        momentsDef: moments.toArr(v => v),
        currentMoment: null, resolveTimeout: null,
        lives, outcome,
        tw, th, px, py, pw, ph, visiMult,
        globalMsOffset
      });
      
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'lives', 'tw', 'th', 'px', 'py', 'pw', 'ph', 'visiMult', 'outcome' ].gain(...arr)),
    
    getBounds(ud) {
      
      // Total bound values
      let { x, y } = forms.Physical.getRelGeom.call(this, ud);
      let px = this.px;
      let py = this.py;
      let pw = this.pw;
      let ph = this.ph;
      let tw = this.tw;
      let th = this.th;
      let thw = tw * 0.5; let tl = x - thw; let tr = x + thw;
      let thh = th * 0.5; let tb = y - thh; let tt = y + thh;
      
      // Player bound values
      px += x; py += y;
      let phw = pw * 0.5; let pl = px - phw; let pr = px + phw;
      let phh = ph * 0.5; let pb = py - phh; let pt = py + phh;
      
      return {
        total: { form: 'rect',
          x, y, w: tw, h: th,
          l: tl, r: tr, b: tb, t: tt
        },
        player: { form: 'rect',
          x: px, y: py, w: pw, h: ph,
          l: pl, r: pr, b: pb, t: pt
        }
      };
      
    },
    getAceSpawnLoc(ud) {
      let { total: { y: ty }, player: { y: py, w, h } } = this.getBounds(ud);
      return { x: (ud.random.genQ() * w * 0.6) - w * 0.3, y: (py - ty) - h * 0.25 };
    },
    getRelGeom(ud) { return {
      form: 'rect',
      w: this.tw, h: this.th,
      ...forms.Physical.getRelGeom.call(this, ud)
    }; },
    getParent(ud) { return null; },
    
    async doStep({ ms, mspf, spf, random }) {
      
      /// {ABOVE=
      
      let timingMs = foundation.getMs();
      
      // TODO: Do we need this snapshot AND `updateData.entities`? Just use `updateData.entities` in place of this snapshot???
      let [ entities, playersWithEntities ] = await Promise.all([
        this.rh('fly.entity').getRecs(),
        this.rh('fly.levelPlayer').getRecs()
          .then(levelPlayers => Promise.all(levelPlayers.map(async levelPlayer => {
            return {
              player: levelPlayer.m('fly.player'),
              entity: (await levelPlayer.rh('fly.levelPlayerEntity').getRec()).m('fly.entity')
            };
          })))
      ]);
      
      let ud = { // "Update data"
        ms, mspf, spf, random,
        level: this,
        entities: entities.toObj(rec => [ rec.uid, rec ]),
        bounds: null,
        outcome: this.outcome,
        spawnEntity: vals => this.flyHut.addRecord('fly.entity', [ this ], { ms, spf, random, ...vals })
      };
      ud.bounds = this.getBounds(ud);
      
      // Step 1: Update all Entities (tracking collidables and births)
      let collideTeams = {};
      for (let ent of entities) {
        
        // Allow the Model to update
        
        ent.doStep(ud);
        let { tangibility: { bound=null, team='???', sides=[] } } = ent.getState(ud);
        
        /// stepResult := {
        ///   // events: [
        ///   //   { type: 'birth', birth: { type: 'Winder', x: 0, y: +100, swingHz: 0.01, swingAmt: +200 } },
        ///   //   { type: 'birth', birth: { type: 'Winder', x: 0, y: +100, swingHz: 0.01, swingAmt: -200 } }
        ///   // ],
        ///   tangibility: {
        ///     bound: { form: 'circle', x: 0, y: 0, r: 16 },
        ///     team: 'ace',
        ///     sides: [ 'head', 'tail' ],
        ///   }
        /// }
        
        // Track this Model
        if (bound && ent.isAlive(ud) && sides.length > 0) {
          if (!collideTeams.has(team)) collideTeams[team] = { head: [], tail: [] };
          let coll = { ent, bound };
          for (let side of sides) collideTeams[team][side].push(coll);
        }
        
      }
      
      // Step 2: Collide all Teams against each other
      let tryCollide = (ud, headCd, tailCd) => {
        
        // Note that `collideTeams` won't initially contain any dead
        // Entities, but an Entity may experience multiple collisions
        // in a single collision step. Even if the Entity dies or
        // somehow becomes "invalid" in an earlier collision it still
        // gets to experience all collisions on this step
        if (!geom.doCollide(headCd.bound, tailCd.bound)) return;
        headCd.ent.getCollideResult(ud, tailCd.ent);
        
      };
      collideTeams = collideTeams.toArr(v => v);
      let len = collideTeams.length;
      for (let i = 0; i < len - 1; i++) { for (let j = i + 1; j < len; j++) {
        
        let team1 = collideTeams[i]; let team2 = collideTeams[j];
        for (let head of team1.head) for (let tail of team2.tail) tryCollide(ud, head, tail);
        for (let head of team2.head) for (let tail of team1.tail) tryCollide(ud, head, tail);
        
      }}
      
      for (let entity of entities) {
        if (!entity.isAlive(ud)) entity.getDieResult(ud);
      }
      
      // Step 4: Check for initial loss frame (`!this.resolveTimeout`)
      if (this.outcome === 'lose' && !this.resolveTimeout) {
        
        // Update LevelPlayers with the stats from their Models
        for (let { player, entity } of playersWithEntities) {
          if (entity.isAlive(ud)) entity.hpDmg = 1;
          player.setValue(v => (v.score = entity.scoreDamage, v.deaths = entity.scoreDeath, v));
        }
        
        this.resolveTimeout = setTimeout(() => this.end(), 2500);
        
      }
      
      let initMoment = (ud, prevMoment, def) => {
        
        console.log(`Beginning new moment: ${def.name} (${def.type})`);
        let moment = ud.spawnEntity({ ...def, prevMoment })
        
        // Apply global effects and update bounds
        moment.applyLevelEffects(this);
        ud.bounds.gain(this.getBounds(ud));
        
        moment.doSetup(ud, prevMoment);
        
        return moment;
        
      };
      
      // Step 6: Advance as many Moments as possible (some may instantly cease standing)
      let currentMoment = this.currentMoment;
      let momentsDef = this.momentsDef;
      while (momentsDef.length && (!currentMoment || !currentMoment.isStanding(ud))) {
        currentMoment = initMoment(ud, currentMoment, momentsDef.shift());
      }
      
      // Step 7: Check victory condition; no Moments remaining
      let alreadyResolved = false
        || this.outcome !== 'none'
        || this.resolveTimeout;
      if (!alreadyResolved && (!currentMoment || !currentMoment.isStanding(ud))) {
        
        currentMoment = initMoment(ud, currentMoment, {
          type: 'MomentAhead',
          name: 'victory',
          dist: 100 * 1000,
          models: [],
          prevMoment: currentMoment
        });
        
        // Mark that victory has occurred
        this.outcome = 'win';
        this.resolveTimeout = setTimeout(() => {
          
          // Transfer Model stats to fly.player Records
          for (let { player, entity } of playersWithEntities) {
            player.setValue(v => (v.score = entity.scoreDamage, v.deaths = entity.scoreDeath, v));
          }
          
          // Update the Lobby taking this win into account
          this.getMember('fly.lobby').setValue(v => {
            v.levelMetadata.gain({
              dispName: v.levelMetadata.dispName + ' - COMPLETE',
              dispDesc: v.levelMetadata.dispWin
            });
            return v;
          });
          
          // End the Record (back to lobby)
          this.end();
          
        }, 3000);
        
      }
      
      if (currentMoment !== this.currentMoment) this.currentMoment = currentMoment;
      this.setForces(ud, currentMoment.getLevelForces(ud));
      
      for (let ent of entities) {
        
        let bound = ent.getState(ud).tangibility.bound;
        let alive = ent.isAlive(ud);
        
        // Manage sprite visibility
        let isBounded = alive && bound;
        
        let visible = false;
        
        try {
          visible = isBounded && geom.doCollideRect(ud.bounds.total, geom.containingRect(bound));
        } catch (err) {
          console.log(`Bad bound:`, { type: ent.getValue('type'), bound, ent });
        }
        
        if (visible && !ent.sprite) {
          ent.sprite = this.flyHut.addRecord('fly.sprite', [ this, ent ], 'visible');
        } else if (!visible && ent.sprite) {
          ent.sprite.end();
          ent.sprite = null;
        }
        
      }
      
      if (ud.random.genQ() < (0.1 * spf)) {
        console.log(`Processed ${entities.length} entities in ${Math.round(foundation.getMs() - timingMs)}ms:`);
        let types = Map();
        for (let entity of entities) {
          let t = getFormName(entity);
          types.set(t, (types.get(t) || 0) + 1);
        }
        for (let [ t, n ] of types) console.log(`    ${n.toString().padHead(3, ' ')} x ${t}`);
      }
      
      /// =ABOVE}
      
    }
    
  })});
  let Moment = form({ name: 'Moment', has: { Entity }, props: (forms, Form) => ({
    
    $imageKeeps: {
      meadow:         foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'bgMeadow.png' ]),
      meadowToPlains: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'bgMeadowToPlains.png' ]),
      plains:         foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'bgPlains.png' ]),
      plainsToMeadow: foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'bgPlainsToMeadow.png' ]),
      techno:         foundation.seek('keep', 'static', [ 'room', 'fly', 'resource', 'bgTechno.png' ])
    },
    $tileExt: 250,
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { name, models=[], terrain=null, bounds=null, visiMult=1 } = val;
      if (bounds === null) bounds = val.prevMoment.bounds;
      if (terrain === null) terrain = val.prevMoment.terrain;
      return {}.gain(...arr, { name, models, terrain, bounds, visiMult, entities: [] });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'name', 'terrain', 'bounds' ].gain(...arr)),
    getMinY: C.noFn('getMinY'),
    getMaxY: C.noFn('getMaxY'),
    getParent(ud) { return null; },
    getRelGeom(ud) {
      let minY = this.getMinY(ud);
      let maxY = this.getMaxY(ud);
      return {
        form: 'rect',
        x: 0, y: (minY + maxY) * 0.5,
        w: ud.bounds.total.w, h: maxY - minY
      };
    },
    applyLevelEffects(level) {
      
      // TODO: Really should transition from previous bounds to new
      // ones. Right now the Ace could be sitting in some previous
      // Moment, when the new one shows its first lowest pixels. That
      // means that the Ace immediately snaps into the new bounds -
      // very janky!
      
      let { total, player } = this.bounds;
      level.setValue(v => v.gain({
        tw: total.w, th: total.h,
        px: player.x, py: player.y, pw: player.w, ph: player.h,
      }));
      
      if (this.visiMult !== null) level.setValue(v => v.gain({ visiMult: this.visiMult }));
      
    },
    doSetup(ud, prevMoment) {
      
      // Y-coordinate is relative to the top of the screen!
      let relY = ud.bounds.total.h * 0.5;
      for (let modelDef of this.models) {
        // Make the "y" property relative to the Moment's bottom
        this.entities.add(ud.spawnEntity({ ud: ud, ...modelDef, y: relY + modelDef.y }));
      }
      
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: null,
      sides: []
    }}; },
    isStanding: C.noFn('isStanding'),
    isAlive: C.noFn('isAlive'),
    
    renderPriority() { return 1; },
    render(ud, draw) {
      
      let terrain = this.terrain;
      let minY = this.getMinY(ud);
      let maxY = this.getMaxY(ud);
      let tb = ud.bounds.total;
      
      if (!terrain) return;
      
      let tExt = Form.tileExt;
      let imgKeep = Form.imageKeeps[terrain];
      if (!imgKeep) throw Error(`Invalid terrain: ${terrain}`);
      
      let endMaxY = Math.min(maxY, tb.t);
      let y = (minY > tb.b)
        // Bottom of this Moment is visible; simply start from it!
        ? minY
        // Bottom of the Moment is cut off; subtract the cut amount
        : (tb.b - ((tb.b - minY) % Form.tileExt));
      
      // If y lands right on `endMaxY` (before accounting for rounding
      // errors) stop drawing - favour `endMaxY` to avoid cut-off pixels
      let x;
      while (y < (endMaxY - 0.0001)) {
        
        x = 0;
        while (x > tb.l) { draw.image(imgKeep, x - tExt, y, tExt, tExt); x -= tExt; }
        x = 0;
        while (x < tb.r) { draw.image(imgKeep, x, y, tExt, tExt); x += tExt; }
        y += tExt;
        
      }
      
    }
    
  })});
  let MomentAhead = form({ name: 'MomentAhead', has: { Moment }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let { ms, name, bounds, dist, prevMoment=null, startY=null, aheadSpd=100 } = val;
      if (startY === null) startY = prevMoment ? prevMoment.getMaxY({ ms }) : bounds.total.h * -0.5;
      return {}.gain(...arr, { dist, startY, aheadSpd });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [ 'aheadSpd', 'dist', 'startY' ].gain(...arr)),
    getLevelForces(ud) {
      return this.aheadSpd
        ? [ [ this.ms, 'vel', 0, this.aheadSpd ] ]
        : [];
    },
    getState(ud) { return { tangibility: {
      bound: this.getAbsGeom(ud),
      team: null,
      sides: []
    }}; },
    getMinY(ud) { return this.startY; },
    getMaxY(ud) { return this.startY + this.dist; },
    isStanding(ud) {
      // A MomentAhead stands while its top hasn't become visible
      return this.getMaxY(ud) > ud.bounds.total.t;
    },
    isAlive(ud) {
      // A MomentAhead lives while its top hasn't been passed entirely
      // TODO: Keep MomentAhead instances alive for an additional 500
      // units??
      return (this.getMaxY(ud) + 500) > ud.bounds.total.b;
    }
    
  })});
  let MomentConditional = form({ name: 'MomentConditional', has: { MomentAhead }, props: (forms, Form) => ({
    
    initProps: utils.fa(forms, 'initProps', (i, arr, val) => {
      let props = {}.gain(...arr);
      let { bounds } = props;
      let { standingCondition } = val;
      
      // MomentConditionals always fill the total bounds, and have a
      // height that is a perfect multiple of the Moment tiling size
      let dist = Math.ceil(bounds.total.h / Moment.tileExt) * Moment.tileExt;
      return props.gain({ standingCondition, dist });
    }),
    initSyncs: utils.fa(forms, 'initSyncs', (i, arr) => [].gain(...arr)),
    
    getLevelForces(ud) {
      let prevMomentAmtShow = this.getMinY(ud) - ud.bounds.total.b;
      
      // Advance the Level until the previous Moment is fully scrolled
      // away (and when the condition is beaten, this Moment will cease
      // to stand and any further scrolling will be governed by the
      // following Moment)
      return prevMomentAmtShow > 0 && this.aheadSpd
        ? [ [ this.ms, 'vel', 0, this.aheadSpd ] ]
        : [];
    },
    isStanding(ud) {
      return true
        && forms.MomentAhead.isStanding.call(this, ud)
        && this.standingCondition(this, ud);
    }
    
  })});
  
  return {
    MBullet,
    JoustMan, JoustManBullet, JoustManLaserSphere, JoustManLaserVert, JoustManLaserHorz, JoustManLaserJoust,
    GunGirl,
    SlamKid, SlamKidSlammer,
    SalvoLad, SalvoLadDumbBomb, SalvoLadKaboom, SalvoLadMissile,
    Winder, Weaver, Furler, WinderMom, WandererMom, Drifter, Wanderer, Gunner, Rumbler,
    RumblerKaboom,
    Level, Moment, MomentAhead, MomentConditional
  };
  
};
