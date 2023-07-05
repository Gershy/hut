global.rooms['record.bank.WeakBank'] = () => form({ name: 'WeakBank', has: { Endable }, props: (forms, Form) => ({
  
  init({ sc=global.subcon('bank.keep') }) {
    forms.Endable.init.call(this);
    Object.assign(this, { recs: Map(), nextUid: 0, sc });
  },
  getNextUid() { return this.nextUid++; },
  syncRec(rec) {
    
    if (rec.off()) throw Error(`Shouldn't sync ${rec.desc()} - it's Ended!`);
    if (this.recs.has(rec.uid)) throw Error(`Double-sync ${rec.desc()}`);
    
    this.recs.set(rec.uid, rec);
    rec.endWith(() => { this.recs.rem(rec.uid); rec.endedPrm = null; });
    
    mmm('transientBankRec', +1);
    rec.endWith(() => mmm('transientBankRec', -1));
    
  },
  syncSer(manager, { add=[], upd=[], rem=[] }) {
    
    // {
    //   add: [
    //     { type: 'loft.myThing1', uid: '001Au2s8', mems: [], val: null },
    //     { type: 'loft.myThing2', uid: '001Au2s9', mems: [ '001Au2s8' ], val: null },
    //     { type: 'loft.myThing1', uid: null, mems: [], val: 'proposed!' } // TODO: Implement this!
    //   ],
    //   upd: [
    //     { uid: '001Au2f1', val: 'newVal for 001Au2f1' },
    //     { uid: '001Au2f2', val: 'newVal for 001Au2f2' }
    //   ],
    //   rem: [
    //     '001Au2h3',
    //     '001Au2h4',
    //     '001Au2h5',
    //     '001Au2h6'
    //   ]
    // }
    
    // Process all "add" operations
    let waiting = add;
    while (waiting.length) {
      
      let attempt = waiting;
      waiting = [];
      
      // Try to fulfill this attempt
      for (let addRec of attempt) {
        
        if (this.recs.has(addRec.uid)) throw Error(`Duplicate id: ${addRec.uid}`).mod({ addRec, add, upd, rem });
        
        let mems = null;
        if (isForm(addRec.mems, Object)) {
          
          mems = {};
          for (let [ term, uid ] of addRec.mems) {
            if      (this.recs.has(uid)) { mems[term] = this.recs.get(uid); }
            else if (uid === null)       { mems[term] = null; }
            else                         { mems = null; break; }
          }
          
        } else if (isForm(addRec.mems, Array)) { // TODO: Does this ever even happen?
          
          // TODO: I'm almost sure this isn't being used - remove!
          mems = [];
          for (let uid of addRec.mems) {
            if (this.recs.has(uid)) mems.push(this.recs.get(uid));
            else                    { mems = null; break; }
          }
          
        } else {
          
          throw Error(`Invalid type for "mems": ${getFormName(addRec.mems)}`);
          
        }
        
        if (!mems) { waiting.push(addRec); continue; } // Reattempt soon
        
        // All members are available - create the Record! Note the
        // following happens *synchronously*:
        // - `addRecord` creates a Record(...) instance (`newRec`)
        // - `newRec.type.manager.bank` is set to `=== this`
        // - `newRec` calls `this.syncRec(newRec)`
        // - `newRec` gets set into `this.recs`
        let newRec = manager.addRecord({ type: addRec.type, group: mems, value: addRec.val, uid: addRec.uid });
        
        /// {ASSERT=
        if (!this.recs.has(newRec.uid)) throw Error(`Didn't synchronously index ${newRec.desc()}`).mod({ uid: newRec.uid, recs: this.recs });
        if (this.recs.get(newRec.uid) !== newRec) {
          this.sc(newRec, this.recs.get(newRec.uid));
          throw Error(`Incorrectly indexed ${newRec.desc()}`);
        }
        /// =ASSERT}
        
      }
      
      // If no item in the batch succeeded we can't make progress
      if (waiting.length === attempt.length) {
        throw Error(`Unresolvable Record dependencies`).mod({ add, recs: this.recs, waiting });
      }
      
    }
    
    // Process all "upd" operations
    for (let { uid, val } of upd) {
      if (!this.recs.has(uid)) throw Error(`Tried to update non-existent Record @ ${uid}`);
      this.recs.get(uid).setValue(val);
    }
    
    // Process all "rem" operations
    for (let uid of rem) this.recs.get(uid)?.end();
    
  },
  
  * select({ activeSignal, relHandler }) {
    
    let { rec: srcRec, type, term } = relHandler;
    
    for (let [ uid, rec ] of this.recs) {
      
      if (rec.type !== type) continue;
      
      // Only accept Records that have `rec` as a Member under `term`,
      // or under the default term (`rec.type.name`)
      if (rec.group.mems[term] !== srcRec) continue;
      
      yield {
        rec,
        uid: rec.uid,
        type: rec.type.name,
        mems: rec.group.mems.map(mem => mem.uid),
        getValue: () => rec.getValue()
      };
      
    }
    
  },
  selectUid(uid) {
    
    let rec = this.recs.get(uid);
    if (!rec) return null;
    
    return {
      rec,
      uid: rec.uid,
      type: rec.type.name,
      mems: rec.group.mems.map(mem => mem.uid)
    };
    
  },
  
})});
