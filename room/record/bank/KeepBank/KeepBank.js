global.rooms['record.bank.KeepBank'] = async () => {
  
  return form({ name: 'KeepBank', has: { Endable }, props: (forms, Form) => ({
    
    // TODO: It's KeepBank's responsibility to make indexing and offsetting possible:
    // - Indexing can be done by maintaining separate indices in the root `KeepBank(...).keep`
    // - Offsetting can be done, without relying on OS-level offsetting, by splitting Recs of a
    //   Type across multiple different nodes, e.g. "0..99", "100..199", "200..299" etc.
    //   - Choose an arbitrary partition size? E.g. 100???
    //   - Tricky, as Rec deletions may necessitate defragging such nodes (or, we could decide to
    //     *never* defrag nodes? Could lead to many empty directories, e.g. all the way up to
    //     "52100..52199")
    
    // TODO: Does a KeepBank still need to do its own ownership locking?? (Even if it's sitting on a
    // Keep which has its own ownership guarantees?)
    
    init({ keep, lockTimeoutMs=500, encoding='json', sc=global.subcon('bank.keep'), ...args }) {
      
      forms.Endable.init.call(this, args);
      Object.assign(this, {
        
        keep,
        encoding,
        
        // Note intentional use of `Math.random()` (backing `String.id`) instead of an instantiated
        // Random Form; this "lock" value is hopefully as non-deterministic as possible!
        lock: String.id(10),
        lockTimeoutMs,
        
        nextUid: null,
        readyPrm: null,
        sc,
        
        // Even a Keep-based Bank occasionally requires "hot" references to Records; a "hot"
        // reference is simply a synchronously available, in-memory reference. These are primarily
        // used for two purposes:
        // 1. Volatile Records are never persisted via Keep; only via hot references
        // 2. All other Records are temporarily hot until they've been fully persisted into the
        //    Keep (eliminating a race condition where Records are queried very soon after being
        //    created; without a hot reference it would not show up in the query, and then be
        //    created immediately after)
        hotRecs: Object.plain() // { type: { uid1: rec1, uid2: rec2, ... } }
        
      });
      
      this.readyPrm = (async () => {
        
        let infoKeep =   await this.keep.dive([ 'meta', 'info' ]);
        let lockKeep =   await this.keep.dive([ 'meta', 'lock' ]);
        let accessKeep = await this.keep.dive([ 'meta', 'access' ]);
        let nextKeep =   await this.keep.dive([ 'meta', 'next' ]);
        
        if (!(await infoKeep.getData('json')))   await infoKeep.setData({ v: '0.0.1', created: Date.now() }, 'json');
        if (!(await lockKeep.getData('utf8')))   await lockKeep.setData(this.lock, 'utf8');
        if (!(await accessKeep.getData('utf8'))) await accessKeep.setData(Date.now().encodeStr(), 'utf8');
        if (!(await nextKeep.getData('utf8')))   await nextKeep.setData((0).toString(16), 'utf8');
        
        let lock = await lockKeep.getData('utf8');
        if (lock !== this.lock) {
          let msElapsed = Date.now() - (await accessKeep.getData('utf8')).encodeInt();
          if (msElapsed < this.lockTimeoutMs) throw Error(`Can't initialize ${getFormName(this)} on Keep ${this.keep.desc()} - it's locked and was accessed ${(msElapsed / 1000).toFixed(2)}s ago`);
        }
        
        await Promise.all([
          
          // Update our "next uid"
          nextKeep.getData('utf8').then(uid => this.nextUid = uid.encodeInt()),
          
          // Mark the Keep as "locked"
          lockKeep.setData(this.lock, 'utf8'),
          accessKeep.setData(Date.now().encodeStr(), 'utf8')
          
        ]);
        
        return this;
        
      })();
      
    },
    desc() { return `${getFormName(this)}( ${this.keep.desc()} )`; },
    
    getNextUid() {
      
      this.keep.access([ 'meta', 'next' ]).setData((this.nextUid + 1).encodeStr(), 'utf8');
      this.sc(`KeepBank generated uid: ${(this.nextUid + 1).encodeStr(String.base62, 8)}`);
      return this.nextUid++;
      
    },
    makeHot(rec) {
      
      let { uid, type: { name: type } } = rec;
      if (this.hotRecs[type]?.[uid]) throw Error(`${rec.desc()} is already hot`);
      if (!this.hotRecs[type]) this.hotRecs[type] = Object.plain();
      this.hotRecs[type][uid] = rec;
      
      return Endable(() => {
        delete this.hotRecs[type][uid];
        if ({}.empty.call(this.hotRecs[type])) delete this.hotRecs[type];
      });
      
    },
    async syncRec(rec) {
      
      this.sc(`Holding ${rec.desc()}...`);
      
      // Immediately hold this `rec` reference. If `rec` is truly volatile we'll only drop this
      // reference when `rec` ends, but if it's non-volatile we'll wait for it to be stored in the
      // Bank before dropping the reference
      
      let hotTmp = this.makeHot(rec);
      
      // Always hold volatile Record in memory
      if (rec.volatile) return rec.endWith(hotTmp);
      
      let { uid } = rec;
      
      // Make `rec` retrievable by RelHandlers; need to hold `rec` in `this.volatileRecs` until it
      // gets persisted, at which point it should be immediately removed from `this.volatileRecs`
      try {
        
        // Load initially store `rec` depending on if it was seen before
        let meta = await this.keep.access([ 'rec', uid, 'm' ]).getData('json');
        if (meta) {
          
          let val = await this.keep.access([ 'rec', uid, 'v' ]).getData('json');
          this.sc(`${rec.desc()} has a preexisting value`, val);
          rec.setValue(val);
          
        } else {
          
          this.sc(`${rec.desc()} is being synced from scratch...`);
          
          // Store metadata
          await this.keep.access([ 'rec', uid, 'm' ]).setData({
            type: rec.type.name,
            uid: rec.uid,
            mems: rec.group.mems.map(mem => mem.uid),
          }, 'json');
          
        }
        
      } finally { hotTmp.end(); }
      
      // Reflect any changes to `rec`'s value in the Keep
      rec.valueSrc.route(delta => {
        let value = rec.getValue();
        this.keep.access([ 'rec', uid, 'v' ]).setData(value, 'json');
        this.sc(`Synced ${rec.desc()}.getValue():`, value);
      }, 'prm');
      
      rec.endWith(() => {
        rec.endedPrm = this.keep.access([ 'rec', uid ]).rem();
        this.sc(`Removed ${rec.desc()}`);
      }, 'prm');
      
    },
    async selectUid(uid) {
      
      let childKeep = this.keep.seek('rec', uid);
      let metaKeep = childKeep.access('m');
      let meta = await metaKeep.getData('json');
      if (!meta) return null;
      
      return { rec: null, ...meta, getValue: () => childKeep.access('v').getData('json') };
      
    },
    
    async* select({ activeSignal, relHandler }) {
      
      let { rec: memRec, type, term } = relHandler;
      
      // Find all Records which Group `memRec` under the term `term`
      
      // Find any Hot Records
      let seen = Set();
      for (let uid in this.hotRecs[type.name] ?? {}) {
        
        if (activeSignal.off()) break;
        
        let rec = this.hotRecs[type.name][uid];
        if (rec.group.mems[term] !== memRec) continue;
        seen.add(uid);
        yield {
          rec,
          uid,
          type: type.name,
          mems: rec.group.mems.map(mem => mem.uid),
          getValue: () => rec.getValue()
        };
        
      }
      
      if (activeSignal.onn()) {
        
        let keeps = await this.keep.dive('rec').getKids();
        try { for await (let [ uid, childKeep ] of keeps) {
          
          if (activeSignal.off()) break;
          
          // It's possible the Record is Banked but also Hot, and would
          // have already been yielded earlier - don't yield it again!
          if (seen.has(uid)) continue;
          
          // Don't return children with `null` "m" ("meta") content
          let meta = await childKeep.access('m').getData(this.encoding);
          if (!meta) continue; // `meta` may be `null` if it was deleted recently
          
          // Filter out any Records whose Type doesn't match
          if (type.name !== meta.type) continue;
          
          // Only accept Records that have `rec` as a Member under `term`,
          // or under the default term (`rec.type.name`)
          if (meta.mems[term] !== uid) continue;
          
          yield {
            rec: null,
            uid,
            type: meta.type,
            mems: meta.mems,
            getValue: () => childKeep.access('v').getData(this.encoding)
          };
          
        }} finally { keeps.end?.(); }
        
      }
      
    },
    
    cleanup() {
      
      // Unmark the Keep as "locked"
      this.keep.seek([ 'meta', 'lock' ]).then( lockKeep => lockKeep.rem() );
      this.keep.seek([ 'meta', 'access' ]).then( accessKeep => accessKeep.rem() );
      
    }
    
  })});
  
};
