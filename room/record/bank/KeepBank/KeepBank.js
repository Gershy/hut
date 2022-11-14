global.rooms['record.bank.KeepBank'] = async foundation => {
  
  let AbstractBank = await foundation.getRoom('record.bank.AbstractBank');
  
  return form({ name: 'KeepBank', has: { AbstractBank }, props: (forms, Form) => ({
    
    $getSelectedValue: async keep => serToVal(await keep.access('v').getContent()),
    $casedCmp: term => {
      
      if (term.length > 32) throw Error(`Term "${term}" is too long (max 32 chars)`);
      
      // Map string to [01]; 0 for lower, 1 for upper...
      let mask = [ ...term ].reverse().map(char => (char === char.lower()) ? '0' : '1').join('');
      
      // Simply parse as base-2, and encode as hex
      return term.lower() + '@' + parseInt(mask, 2).toString(16);
      
    },
    $uncasedCmp: term => {
      
      let ind = term.lastIndexOf('@');
      let cmp = term.slice(0, ind);
      let mask = term.slice(ind + 1);
      
      let bits = [ ...parseInt(mask, 16).bits() ];
      return cmp.split('').map((char, i) => bits[i] ? char.upper() : char.lower()).join('');
      
    },
    
    init({ keep, lockTimeoutMs=500, ...args }) {
      
      forms.AbstractBank.init.call(this, args);
      Object.assign(this, {
        
        keep,
        
        // Note intentional use of `Math.random()` instead of an
        // instantiated Random Form; this "lock" value is hopefully as
        // non-deterministic as possible!
        lock: (Number.MAX_SAFE_INTEGER * Math.random()).encodeStr(),
        lockTimeoutMs,
        
        nextUid: null,
        readyPrm: null,
        debug: foundation.conf('bank.keep.debug.on') ? console.log : Function.stub,
        
        // Even a Keep-based Bank occasionally requires "hot" references
        // to Records; a "hot" reference is simply a synchronously
        // available, in-memory reference. These are primarily used for
        // two purposes:
        // 1. Volatile Records are never persisted in the Keep; they are
        //    always persisted via hot references
        // 2. All other Records are temporarily hot until they've been
        //    fully persisted into the Keep (this eliminates a race
        //    condition where a Record is created very close to when it
        //    is queried for; if there was no hot reference it may not
        //    show up in the query, and then be created immediately
        //    after)
        hotRecs: Object.plain({}) // p{ type: p{ uid1: rec1, uid2: rec2, ... } }
        
      });
      
      // TODO: This "locking" mechanism is *still* prone to race
      // conditions. It's possible for a process to think no previous
      // lock exists and to write its own lock, but after writing it may
      // be the case an unexpected lock value has been written; the
      // equivalent of a process like redis(??) is needed here
      this.readyPrm = (async () => {
        
        let infoKeep = await this.keep.seek([ 'meta', 'info' ]);
        let lockKeep = await this.keep.seek([ 'meta', 'lock' ]);
        let accessKeep = await this.keep.seek([ 'meta', 'access' ]);
        let nextKeep = await this.keep.seek([ 'meta', 'next' ]);
        
        if (!(await infoKeep.getContent())) await infoKeep.setContent( valToSer({ v: '0.0.1', created: Date.now() }) );
        if (!(await lockKeep.getContent())) await lockKeep.setContent(this.lock);
        if (!(await accessKeep.getContent())) await accessKeep.setContent(Date.now().encodeStr());
        if (!(await nextKeep.getContent())) await nextKeep.setContent((0).toString(16));
        
        let lock = await lockKeep.getContent('utf8');
        if (lock !== this.lock) {
          let msElapsed = Date.now() - (await accessKeep.getContent('utf8')).encodeInt();
          if (msElapsed < this.lockTimeoutMs) throw Error(`Can't initialize ${getFormName(this)} on Keep ${this.keep.desc()} - it's locked and was accessed ${(msElapsed / 1000).toFixed(2)}s ago`);
        }
        
        await Promise.all([
          
          // Update our "next uid"
          nextKeep.getContent('utf8').then(uid => this.nextUid = uid.encodeInt()),
          
          // Mark the Keep as "locked"
          lockKeep.setContent(this.lock),
          accessKeep.setContent(Date.now().encodeStr())
          
        ]);
        
        return this;
        
      })();
      
    },
    desc() { return `${getFormName(this)}( ${this.keep.desc()} )`; },
    
    getNextUid() {
      
      this.keep.access([ 'meta', 'next' ]).setContent( (this.nextUid + 1).encodeStr() );
      this.debug(`KeepBank generated uid: ${(this.nextUid + 1).encodeStr(String.base62, 8)}`);
      return this.nextUid++;
      
    },
    makeHot(rec) {
      
      let type = rec.type.name;
      let uid = rec.uid;
      if (this.hotRecs[type]?.[uid]) throw Error(`${rec.desc()} is already hot`);
      if (!this.hotRecs[type]) this.hotRecs[type] = Object.plain();
      this.hotRecs[type][uid] = rec;
      
      return () => {
        delete this.hotRecs[type][uid];
        if ({}.empty.call(this.hotRecs[type])) delete this.hotRecs[type];
      };
      
    },
    async syncRec(rec) {
      
      this.debug(`Holding ${rec.desc()}...`);
      
      // Immediately hold this `rec` reference. If `rec` is truly
      // volatile we'll only drop this reference when `rec` ends, but if
      // it's non-volatile we'll wait for it to be stored in the bank
      // before dropping the reference
      let endAvailFn = this.makeHot(rec);
      
      // Always hold volatile Record in memory
      if (rec.volatile) return rec.endWith(endAvailFn);
      
      // Make `rec` retrievable by RelHandlers; need to hold `rec` in
      // `this.volatileRecs` until it has been persisted, at which point
      // it should be immediately removed from `this.volatileRecs`
      try {
        
        let casedUid = Form.casedCmp(rec.uid);
        
        // Either load or do initial storing for `rec` depending on if it
        // was seen before
        let meta = serToVal(await this.keep.access([ 'rec', casedUid, 'm' ]).getContent());
        if (meta) {
          
          let val = serToVal(await this.keep.access([ 'rec', casedUid, 'v' ]).getContent());
          this.debug(`${rec.desc()} has a preexisting value`, val);
          rec.setValue(val);
          
        } else {
          
          this.debug(`${rec.desc()} is being synced from scratch...`);
          
          // Store metadata
          await this.keep.access([ 'rec', casedUid, 'm' ]).setContent(valToSer({
            type: rec.type.name,
            uid: rec.uid,
            mems: rec.group.mems.map(mem => mem.uid),
          }));
          
        }
        
      } finally { endAvailFn(); }
      
      // Reflect any changes to `rec`'s value in the Keep
      rec.valueSrc.route(delta => {
        let value = rec.getValue();
        this.keep.access([ 'rec', casedUid, 'v' ]).setContent(valToSer(value));
        this.debug(`Synced ${rec.desc()}.getValue():`, value);
      }, 'prm');
      
      rec.endWith(() => {
        rec.endedPrm = this.keep.access([ 'rec', casedUid ]).setContent(null);
        this.debug(`Removed ${rec.desc()}`);
      }, 'prm');
      
    },
    async selectUid(uid) {
      
      let childKeep = this.keep.seek('rec', Form.casedCmp(uid));
      let metaKeep = childKeep.access('m');
      let meta = serToVal(await metaKeep.getContent());
      
      if (!meta) return null;
      
      return { rec: null, ...meta, getValue: Form.getSelectedValue.bind(null, childKeep) };
      
    },
    async* select({ activeSignal, relHandler }) {
      
      let { rec: memRec, type, term } = relHandler;
      
      // Find all Records which Group `memRec` under the term `term`
      
      // Find any Hot Records
      let seen = Set();
      for (let uid in this.hotRecs[type.name] ?? {}) {
        
        let rec = this.hotRecs[type][uid];
        if (rec.group.mems[term] !== memRec) continue;
        seen.add(uid);
        yield { rec, uid, type: type.name, mems: rec.group.mems.map(mem => mem.uid) };
        
      }
      
      for await (let [ casedCmp, childKeep ] of this.keep.seek('rec').iterateChildren()) {
        
        let uid = Form.uncasedCmp(casedCmp);
        if (seen.has(uid)) continue;
        
        let meta = serToVal(await childKeep.access('m').getContent());
        if (!meta) continue; // `meta` can return as `null` if it was deleted recently
        
        // Filter out any Records whose Type doesn't match
        if (type.name !== meta.type) continue;
        
        // Only accept Records that have `rec` as a Member under `term`,
        // or under the default term (`rec.type.name`)
        if (meta.mems[term] !== rec.uid) continue;
        
        yield {
          rec: null,
          uid,
          type: meta.type,
          mems: meta.mems,
          getValue: Form.getSelectedValue.bind(null, childKeep)
        };
        
      }
      
    },
    
    cleanup() {
      
      // Unmark the Keep as "locked"
      this.keep.seek([ 'meta', 'lock' ]).then( lockKeep => lockKeep.setContent(null) );
      this.keep.seek([ 'meta', 'access' ]).then( accessKeep => accessKeep.setContent(null) );
      
    }
    
  })});
  
};
