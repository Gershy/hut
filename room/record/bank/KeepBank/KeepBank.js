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
    
    init({ keep, lockTimeoutMs=500, sc, ...args }) {
      
      sc = sc.kid('keepBank');
      
      forms.Endable.init.call(this, args);
      Object.assign(this, {
        
        keep,
        
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
      
      let uid = this.nextUid++;
      this.keep.access([ 'meta', 'next' ]).setData(uid.encodeStr(), 'utf8');
      this.sc.note('nextUid', { uid });
      return uid;
      
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
      
      let syncSc = this.sc.kid('sync');
      syncSc.note({ rec });
      
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
        
        let recKeep = this.keep.access([ 'rec', uid ]);
        if (await recKeep.access('m').exists()) {
          
          // TODO: All notions here need to be voided for the Therapy Loft!!! (Otherwise circular)
          let val = await recKeep.access('v').getData('json');
          
          syncSc.note('preexisting', { val });
          
          rec.setValue(val);
          
        } else {
          
          syncSc.note('fromScratch', {});
          
          // Store metadata
          await recKeep.access('m').setData({
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
        syncSc.note('value', { value });
      }, 'prm');
      
      rec.endWith(() => {
        rec.endedPrm = this.keep.access([ 'rec', uid ]).rem();
        syncSc.note('end', {});
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
      
      // Note the terminology here calls the source Rec the "heldRec", because we are searching for
      // Recs which hold it; such candidate Recs are called "holderRecs" here.
      let { rec: heldRec, type: heldType, term: heldTerm } = relHandler;
      
      // Find all HolderRecs of `heldRec`; these reference `heldRec` via `term`. Note the resulting
      // HolderRecs may have mixed types!
      
      // Find any appropriate HolderRecs amongst our HotRecs
      let seen = Set();
      for (let holderUid in this.hotRecs[heldType.name] ?? {}) {
        
        if (activeSignal.off()) break;
        
        let holder = this.hotRecs[heldType.name][holderUid];
        if (holder.group.mems[heldTerm] !== heldRec) continue;
        seen.add(holderUid);
        
        yield {
          rec: holder,
          uid: holderUid,
          type: holder.type.name,
          mems: holder.group.mems.map(mem => mem.uid),
          getValue: () => holder.getValue()
        };
        
      }
      
      // Find any appropriate HolderRecs amongst our BankedRecs
      if (activeSignal.onn()) {
        
        let holderKeeps = await this.keep.access('rec').getKids();
        
        try { for await (let [ holderUid, holderKeep ] of holderKeeps) {
          
          if (activeSignal.off()) break;
          
          // It's possible the Record is Banked but also Hot, and would have already been yielded
          // earlier - don't yield it again! But also no need to add to `seen`, as BankedRecs can
          // only collide with HotRecs, not other BankedRecs.
          if (seen.has(holderUid)) continue;
          
          // Don't return children with `null` "m" ("meta") content
          let holderMeta = await holderKeep.access('m').getData('json');
          if (!holderMeta) continue; // Maybe `getKids` should lock all children until it completes? If it doesn't, kids which appear in `getKids` may later be nullish when their contents are read
          
          // If the BankedRec has no member under "term", ignore it
          if (!holderMeta.mems[heldTerm]) continue;
          
          // Filter out any Records whose Type doesn't match
          if (holderMeta.type !== heldType.name) continue;
          
          // Only accept Records that have `memRec` as a Member under `term` - note `term` is often
          // not explicitly defined by the consumer, so it defaults to `rec.type.name` (it's only
          // mandatory to explicitly provide terms when multiple members have the same type)
          if (holderMeta.mems[heldTerm] !== heldRec.uid) continue;
          
          yield {
            rec: null,
            uid: holderUid,
            type: holderMeta.type,
            mems: holderMeta.mems,
            getValue: () => holderKeep.access('v').getData('json')
          };
          
        }} finally {
          // Explicitly end the Keep iterator if possible
          if (isForm(holderKeeps.end, Function)) holderKeeps.end();
        }
        
      }
      
    },
    
    cleanup() {
      
      // Unmark the Keep as "locked"
      this.keep.seek([ 'meta', 'lock' ]).then( lockKeep => lockKeep.rem() );
      this.keep.seek([ 'meta', 'access' ]).then( accessKeep => accessKeep.rem() );
      
    }
    
  })});
  
};
