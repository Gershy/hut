global.rooms['record'] = async () => {
  
  let MemSrc = await getRoom('logic.MemSrc');
  
  let Manager = form({ name: 'Manager', props: (forms, Form) => ({
    
    // TODO:
    // "Manager" -> "Archivist"
    // "Manager" -> "Registrar"
    // "Manager" -> "Auditor"
    // "Manager" -> "Clerk"
    // "Manager" -> "Librarian" ("Record" -> "Book"??)
    // "Manager" -> "Curator"
    
    init({ sc=subcon('manager'), bank }) {
      
      Object.assign(this, {
        
        sc,
        recordSc: sc.kid('record'),
        
        recSearches: Set(/* functions which return either `Record(...)` or `null` */),
        bank,
        
        // To avoid race conditions all Records in the middle of being
        // created are keyed here temporarily (keys map to Promises
        // resolving to the Record). If a Record is "live" (already
        // available in RAM, and not to be re-created in a separate
        // instance) it must be returned by a `findRecordInMemory` call
        // of the corresponding id (which must be configured by setting
        // the correct search functions using `addRecordSearch`!)
        recPrmCacheMs: 5000,
        recPrms:        Object.plain({ /* uid -> Promise(Record(...)) */ }),
        recPrmTimeouts: Object.plain({ /* uid -> Timeout(...) */ }),
        types:          Object.plain({ /* typeName -> Type(...) */ }),
        formFns:        Object.plain({ /* typeName -> Function */ })
        
      });
      
      denumerate(this, 'recPrms');
      denumerate(this, 'recPrmTimeouts');
      denumerate(this, 'types');
      denumerate(this, 'formFns');
      
      if (this.bank) {
        this.getNextUid = () => this.bank.getNextUid().encodeStr(String.base62, 8);
      } else {
        let uidCnt = 0;
        this.getNextUid = () => (uidCnt++).encodeStr(String.base62, 8);
      }
      
    },
    getType(name) {
      if (!this.types[name]) this.types[name] = Type({ manager: this, name });
      return this.types[name];
    },
    getGroup(mems) { return Group(this, mems); },
    getRecordForm({ type, group, value }) {
      return this.formFns[type.name]?.(value) ?? Record;
    },
    addFormFn(typeName, fn) {
      /// {DEBUG=
      if (this.formFns.has(typeName)) throw Error(`Duplicate Form function for Type named "${typeName}"`);
      /// =DEBUG}
      this.formFns[typeName] = fn;
      return Tmp(() => delete this.formFns[typeName]);
    },
    addRecord(...args /* type, group, value, uid, volatile | { type, group, value, uid, volatile } */) {
      
      // `Manager(...).addRecord` is basically `Manager.getRecord(...)`
      // but you need to supply `group`+`value`, and `uid` is optional
      
      // TODO: If caller supplied `group` and `value` but the `uid` is
      // hot and a pre-existing Record is returned, should *validate*
      // that the group is exactly the same, and should *consider*
      // comparing the pre-existing value and value supplied to this
      // `addRecord` call!
      
      let { type=null, group=Group(this, {}), value=null, uid: specifiedUid=null, volatile=false } =
        (args.length === 1 && isForm(args[0], Object))
          ? args[0]
          : [ 'type', 'group', 'value', 'uid', 'volatile' ].toObj((key, n) => [ key, args[n] ]);
      
      return this.getRecordFromCacheOrPlan(specifiedUid ?? this.getNextUid(), uid => {
        
        if (!type) throw Error(`No Type provided`);
        
        if ([ Object, Array ].any(Cls => isForm(group, Cls))) group = this.getGroup(group);
        /// {DEBUG=
        if (!isForm(group, Group)) throw Error(`Unexpected "group" value: "${getFormName(group)}"`);
        /// =DEBUG}
        
        if (isForm(type, String)) {
          if (!type.has('.')) {
            let pfxs = Set(group.mems.toArr(mem => mem.type.getPrefix()));
            /// {DEBUG=
            if (pfxs.size !== 1) throw Error(`Group prefixes are [${pfxs.toArr(v => v).join(',')}]; no default available`);
            /// =DEBUG}
            type = `${[ ...pfxs ][0]}.${type}`;
          }
          type = this.getType(type);
        }
        /// {DEBUG=
        if (!isForm(type, Type)) throw Error(`Unexpected "type" value: "${getFormName(type)}"`);
        /// =DEBUG}
        
        // If the "addRecord" call included a specific `uid` the Record
        // may already exist in memory! (Consider an `addRecord` call
        // which occurs unconditionally every time an App is started;
        // the first time no preexisting Record will exist, but if
        // storage is enabled a Record will preexist every time after!)
        // Note that if no specific uid was supplied then `uid` is the
        // result of `this.getNextUid` (which certainly will not exist
        // in the cache!)
        
        if (specifiedUid) {
          let inMemoryRec = this.findRecordInMemory(uid);
          if (inMemoryRec) return inMemoryRec;
        }
        
        let RecordForm = this.getRecordForm({ type, group, value });
        return RecordForm({ type, uid, group, value });
        
      });
      
    },
    
    addRecordSearch(itFn) {
      
      this.recSearches.add(itFn);
      return Endable(() => this.recSearches.rem(itFn));
      
    },
    findRecordInMemory(uid) {
      
      // Depending on the Manager implementation it may have multiple
      // logical chains that result in Records being stored in memory
      // (for example, Hut [which is a superform of Manager] holds any
      // followed Records in memory); we need to make sure that a Record
      // is never reinstantiated if it already exists in memory, so a
      // Manager needs to be able to supply the instance of any
      // preexisting, in-memory Record by its uid!
      
      for (let search of this.recSearches) {
        let rec = search(uid);
        if (rec) return rec;
      }
      
      return null;
      
    },
    renewRecordCacheTimeout(uid) {
      clearTimeout(this.recPrmTimeouts[uid]);
      this.recPrmTimeouts[uid] = setTimeout(() => {
        delete this.recPrmTimeouts[uid];
        delete this.recPrms[uid];
      }, this.recPrmCacheMs);
    },
    getRecordFromCacheOrPlan(uid, recPlan) {
      
      // Note that the PLAN, IF RUN, IS RESPONSIBLE TO CHECK FOR `uid`
      // IN MEMORY! We can't perform the expensive in-memory check here
      // due to the non-trivial performance hit - often the Plan can
      // avoid the in-memory check - e.g., because a Selection includes
      // an immediately-available "rec" property! Note the Plan doesn't
      // need to wait for its returned Record's `bankedPrm` because the
      // timeout to clear `uid` from the cache is only initiated after
      // the `bankedPrm` resolves (so we're guaranteed that if `uid`
      // hasn't entered the RecordTree [becoming "in-memory"] it's still
      // in the cache!)
      
      if (this.recPrms[uid]) {
        
        // Renew timeout (only if it's set! We don't want the timeout to
        // begin timing before the RecPrm resolves!)
        if (this.recPrmTimeouts[uid]) this.renewRecordCacheTimeout(uid);
        
        // Return cached Record
        return this.recPrms[uid];
        
      }
      
      return this.recPrms[uid] = then(
        
        recPlan(uid),
        
        rec => {
          
          /// {DEBUG=
          if (rec.uid !== uid) throw Error(`Promised uid "${uid}" but RecordPlan delivered "${rec.uid}"`);
          /// =DEBUG}
          
          // We only want to uncache `uid` after the Plan resolves to a
          // Record AND the Record's `bankedPrm` resolves! This avoids a
          // sequence like:
          // 1. `uid` set in cache
          // 2. `recPlan()` resolves to some `rec`
          //    - But `rec` isn't Banked yet
          //    - Note the cache currently maps `uid` to `rec`
          //    - Note there's no bound on how long `rec` may bank for
          // 3. Timeout causes `uid` to be removed from cache
          // 4. A new `getRecordFromCacheOrPlan` request for the same
          //    uid comes in
          //    - It doesn't see `uid` in the cache
          //    - It can't find `uid` in-memory, because `rec` hasn't
          //      finished Banking (and hasn't informed its Holders)
          // 5. This 2nd `getRecordFromCacheOrPlan` call creates another
          //    duplicate instance to `rec`! (OH NO!!)
          // 6. The original `rec` finishes Banking, and realizes it's a
          //    duplicate. OWWWWW!!
          // 
          // The trick is to wait for `rec.bankedPrm` to resolve in
          // between steps #2 and #3! That way there is never a moment
          // where `rec` is in neither the cache nor memory!
          
          // After the Plan completes AND `rec` is Banked, set a timeout
          // to uncache `uid`
          rec.bankedPrm.then(() => this.renewRecordCacheTimeout(uid));
          rec.route(() => {
            clearTimeout(this.recPrmTimeouts[uid]);
            delete this.recPrmTimeouts[uid];
            delete this.recPrms[uid];
          }, 'prm');
          
          // Replace any Promise-resolving-to-Record with the Record
          return this.recPrms[uid] = rec;
          
        },
        
        err => {
          
          // Immediately uncache any Record that failed to be created
          delete this.recPrms[uid];
          delete this.recPrmTimeouts[uid];
          throw err;
          
        }
        
      );
      
    },
    ensureRecord(uid, preselected=null) {
      
      let err = Error('trace');
      
      return this.getRecordFromCacheOrPlan(uid, async () => { try {
        
        // THE PLAN (earliest successful step short-circuits):
        // - Cache the fact that `uid` is being recovered
        // - Try to return Preselection Record instance ("rec" prop)
        // - Try to find Record instance in memory
        // - Create Selection for `uid` if no Preselection available
        // - Try to use Record instance from Selection
        // - Create new Record instance for `uid`
        //   - Causes multiple recursive `ensureRecord` calls that
        //     initialize all Members of the `uid` Record
        
        // Try Preselection for Record instance
        if (preselected && preselected.rec) {
          if (preselected.rec.uid !== uid) throw Error('OWWWWW HOLY COWWWW');
          return preselected.rec;
        }
        
        // Try to find Record instance in memory
        let inMemoryRec = this.findRecordInMemory(uid);
        if (inMemoryRec) return inMemoryRec;
        
        // Ensure a Selection exists
        let selected = preselected || await this.bank.selectUid(uid);
        
        /// {DEBUG=
        // Ensure Selection exists, and its uid conforms as expected
        if (!selected) throw Error(`Can't ensure uid ${uid} (can't determine its Members due to an absence of Bank info)`);
        if (selected.rec && selected.rec.uid !== uid) throw Error('OWWWWW OOF SOOOO BADDD (the Bank is BUSTED)');
        /// =DEBUG}
        
        // If the Selection has a Record instance simply return it
        if (selected.rec) return selected.rec;
        
        /// {ASSERT=
        if (selected.uid !== uid) throw Error('OWWWW OW OW');
        /// =ASSERT}
        
        // Load Members (recursively) and value from Selection
        let [ mems, value ] = await Promise.all([
          Promise.all(selected.mems.map( uid => this.ensureRecord(uid) )),
          selected.getValue()
        ]);
        
        // Initialize Record with correct dynamic Form!
        let type = this.getType(selected.type);
        let group = this.getGroup(mems);
        let RecordForm = this.getRecordForm({ type, group, value });
        return RecordForm({ type, group, uid, value });
        
      } catch (cause) { err.propagate({ cause, msg: `Failed to get Record from Cache or Plan` }); } });
      
    }
    
  })});
  
  let Type = form({ name: 'Type', props: (forms, Form) => ({
    
    // Camel-case namespace separated with "." from camel-case type name
    $nameRegex: /^[a-z][a-zA-Z0-9]*[.][a-z][a-zA-Z0-9]*$/,
    
    init({ manager, name }) {
      
      if (!manager) throw Error(`No "manager" provided`);
      if (!Form.nameRegex.test(name)) throw Error(`Invalid Type name: "${name}"`);
      if (manager.types[name]) throw Error(`Instantiated Type with duplicate name: "${name}"`);
      
      // Doen't hurt to have the Type mapped immediately!
      manager.types[name] = Object.assign(this, { name, manager, termTypes: {} });
      denumerate(this, 'manager');
      denumerate(this, 'termTypes');
      
    },
    getPrefix() { return this.name.cut('.')[0] },
    
    updateTypeTerms(typeTerms /* { term1: type1, term2: type2 ... } */) {
      
      // This is an all-or-nothing operation; results are buffered until
      // success is confirmed
      let results = {};
      
      for (let [ term, type ] of typeTerms) {
        
        // If the term has never been seen before simply populate
        if (!this.termTypes.has(term)) { results[term] = type; continue; }
        
        // If the term has been seen but type is unestablished, populate
        if (this.termTypes[term] === null) { results[term] = type; continue; }
        
        // term->type mapping already exists; ensure consistent usage;
        // note Terms ending with "?" indicate polymorphic Members!
        if (this.termTypes[term] !== type && !term.hasTail('?')) {
          throw Error(`Type "${this.name}" already has ${term}->${this.termTypes[term].name}; tried to supply ${term}->${type.name}`);
        }
        
      }
      
      this.termTypes.gain(results);
      
    }
    
  })});
  
  let Group = form({ name: 'Group', props: (forms, Form) => ({
    
    // A Group is simply a mapping of MemberTerms to Member instances
    
    init(...args /* Manager(...) (, [ rec1, rec2 ] | { term1: rec1, term2: rec2 }) */) {
      
      // Provide 1 or 2 args
      // 1 arg: mems (at least one Member must have a Manager)
      // 2 args: manager, mems
      
      // Specify a set of Members as Array or Object. Arrays will be
      // mapped to an Object where each Member's Type name is used as
      // the key (for this reason Array Members must be of unique Types)
      // Any base10-number-like Object keys will be renamed to the type
      // name of the corresponding Record
      
      if (args.length < 1 || args.length > 2) throw Error(`Need either 1 or 2 args`);
      let [ manager, mems ] = (args.length === 1)
        ? [ null, args[0] ]
        : args;
      
      let terms = null;
      
      // Coalesce Array of Mems to Object
      if (isForm(mems, Array)) {
        
        // Collect Rec names that appear more than once in `mems`
        let dups = mems.categorize(rec => rec.type.name).map((k, v) => (v.length > 1) ? k : skip);
        
        /// {DEBUG=
        if (mems.find(v => !v).found) throw Error(`No nulls allowed in Array-style Group Members`);
        if (dups.length) throw Error(`Array-style GroupMembers has collisions for Type names: [ ${dups.join(', ')} ]`);
        /// =DEBUG}
        
        mems = mems.toObj(rec => [ rec.type.name, rec ]);
        terms = Set(mems.toArr((v, k) => k));
        
      } else if (isForm(mems, Object)) {
        
        /// {DEBUG=
        for (let [ term, rec ] of mems) {
          if (!rec && !term.hasTail('?')) throw Error(`Null Members may only appear under Terms suffixed with "?" (invalid term: "${term}")`);
        }
        /// =DEBUG}
        
        // Resolve numeric keys to type names, then collect all Terms,
        // then remove `null` Members!
        /// {DEBUG=
        let origMems = { ...mems };
        /// =DEBUG}
        mems = mems.mapk((rec, term) => [ /^[0-9]+$/.test(term) ? rec.type.name : term, rec ]);
        /// {DEBUG=
        if (mems.count() !== origMems.count())
          throw Error('Api: conflicting keys when Group supplied as Object with numeric keys')
            .mod({ keyTypes: origMems.map(rec => rec.type.name) });
        /// =DEBUG}
        terms = Set(mems.toArr((v, k) => k));
        mems = mems.map(rec => rec ?? skip); // Remove `null` Members
        
      }
      if (!isForm(mems, Object)) throw Error(`Unexpected GroupMembers type: "${getFormName(mems)}"`);
      
      // Make sure there's no mixing of Managers
      let managers = Set();
      if (manager) managers.add(manager);
      for (let [ k, rec ] of mems) rec.type.manager && managers.add(rec.type.manager);
      if (managers.count() !== 1) throw Error(`Exactly 1 unique Manager is required; got ${managers.count()}`);
      
      Object.assign(this, { manager, mems, terms });
      
    },
    async withRh(...args) {
      
      // Poor-man's way would be to register a RelHandler with any
      // member of the Group, then filter items coming from that rh such
      // that the item has every Group Record as a Member...
      
      throw Error(`Not implemented!`);
      
    }
    
  })});
  
  let RelHandler = form({ name: 'RelHandler', has: { Endable, Src }, props: (forms, Form) => ({
    
    $AuditSrc: form({ name: 'RelHandler.AuditSrc', has: { Src }, props: (forms, Form) => ({
      
      // Sends an overview of a RelHandler's current state, including
      // the current number of Records handled. AuditSrcs do *not*
      // reflect Record adds which occur mid-selection; they only Send
      // after a Selection is complete, at which point a single Send
      // is Sent representing the aggregate change! Note that Record
      // removals may be Sent even during a Selection process.
      // Note the "all" property needs lazy behaviour but can't directly
      // be an iterator (because multiple Routes may compete to consume
      // the iterator); instead it's a Function returning any iterable
      
      init(rh) {
        forms.Src.init.call(this);
        Object.assign(this, { rh });
      },
      
      * getGen() { for (let hrec of this.rh.hrecs.values()) yield hrec.rec; },
      
      mod({ num=this.rh.hrecs.size, add, delta=[], all=()=>this.getGen() }) {
        this.send({ num, add, delta, all });
      },
      newRoute(fn) {
        
        // Avoid Sending anything to a new Route if the RelHandler is still in the middle of a
        // Selection - `fn` will get called when the next Selection begins (TODO: that's ok??)
        if (this.rh.activeSignal.onn()) return;
        
        let num = this.rh.hrecs.size;
        fn({ num, add: +num, delta: () => this.getGen(), all: () => this.getGen() });
        
      }
      
    })}),
    
    init(manager, { key, rec, type, term, offset=0, limit=2**8, filter, fixed }={}) {
      
      forms.Endable.init.call(this);
      forms.Src.init.call(this);
      
      /// {BELOW=
      
      // Below receives a pre-processed list of Hrecs; there's never a
      // need for Below to do more filtering! Below should always simply
      // collect all possible Hrecs (TODO: Can remove any logic related
      // to unfixed RelHandlers from Below??)
      
      [ offset, limit, filter, fixed ] = [ 0, Infinity, null, true ];
      
      /// =BELOW}
      
      Object.assign(this, {
        
        // Relation definition
        manager, key, rec, type, term,
        
        // Selection controls
        fixed, offset, limit, filter,
        
        auditSrc: null,
        
        activeSignal: Tmp.stub,
        
        hrecs: Map(/* uid -> hrec */)
        
      });
      
      // Fire-and-forget
      let err = Error('trace');
      this.mod({ offset, limit, filter })
        .then(() => err = null)
        .fail(cause => err.propagate({ cause, msg: `Failed initial mod for ${this.desc()}` }));
      
      // Fixed RelHandlers call `mod` and then immediately clobber it
      if (this.fixed) C.def(this, 'mod', () => Error(`Can't mod fixed ${this.desc}`).propagate());
      
    },
    desc() {
      return (this.term !== this.rec.type.name)
        ? `${getFormName(this)}( ${this.rec.desc()} <--[${this.term}]--- ${this.type.name} )`
        : `${getFormName(this)}( ${this.rec.desc()} <-- ${this.type.name} )`;
    },
    
    srcFlags: { memory: true, multi: false, tmpsOnly: true },
    newRoute(fn) { for (let hrec of this.hrecs.values()) fn(hrec); },
    countSent() { return this.hrecs.size; },
    getSent() { return this.hrecs.values(); },
    
    getAuditSrc() {
      if (!this.auditSrc) this.auditSrc = Form.AuditSrc(this);
      return this.auditSrc;
    },
    async mod({ filter=null, offset, limit }) {
      
      // Change the parameterization for this RelHandler - this means that any previous Hrecs may
      // be ended due to changed filters/limits/offsets
      
      /// {DEBUG=
      if (filter && !hasForm(filter, Function)) throw Error(`Api: "filter" must be a Function (got ${getFormName(filter)})`);
      /// =DEBUG}
      
      let err = Error('trace');
      
      // Signal a previously active generator to stop
      this.activeSignal.end();
      let activeSignal = this.activeSignal = Tmp();
      
      let hrecs = this.hrecs;
      let newHrecPrms = [];
      
      Object.assign(this, { filter, offset, limit });
      
      let addedRecs = [];
      try {
        
        let selection = null;
        
        // If the Infinite RelHandler is available for this relation it
        // already computed an exhaustive list of relevant Records! Note
        // there's a good chance that `this` is the Infinite RelHandler
        let precompRh = this.rec.relHandlers[`${this.type.name}/${this.term}/0:Infinity`] ?? null;
        if (precompRh && precompRh.off()) precompRh = null;              // Can't use it if it's off
        if (precompRh && precompRh.activeSignal.onn()) precompRh = null; // Can't use it if it's mid-selection
        
        if (!precompRh) {
          
          // If no "precomputed" RelHandler already exists we need to
          // process the full selection using our Bank
          
          selection = await this.manager.bank.select({ activeSignal, relHandler: this });
          
        } else {
          
          // We have a precomputed RelHandler which already has refs to
          // the exhaustive list of relevant Records
          
          // Take a snapshot of these Records
          let recs = precompRh.hrecs.toArr(hrec => hrec.rec);
          
          selection = filter
            // Need to provide full range of `selected` properties if a
            // filter was provided, because the filter might reference
            // those properties
            ? (function*() {
                for (let rec of recs) yield {
                  rec,
                  uid: rec.uid,
                  type: rec.type.name,
                  mems: rec.group.mems.map(mem => mem.uid),
                  getValue: () => rec.getValue()
                };
              })()
            
            // If no filter was provided all we need is a "rec" property
            // which is already conveniently set on each `hrec`!
            : (function*() { for (let rec of recs) yield { rec }; })();
            
        }
          
        // Skip `offset` items! (Note that filtered items don't count towards offset items)
        let count = 0;
        for await (let selected of selection) {
          
          // Stop selecting if `activeSignal` is no longer active
          if (activeSignal.off()) return;
          
          // Ignore `selected` if it gets filtered out (it won't effect `offset` either!)
          if (filter && !(await filter(selected))) continue;
          
          count++;
          
          // Skip until `count > offset`
          if (count <= offset) continue;
          
          // Stop selecting if sufficient items have been selected
          if (count > offset + limit) break;
          
          // Resolve `selected` to a Record - some Banks provide
          // `selected` Objects with a "rec" property referencing the
          // Record(...) itself - use this if available! Otherwise check
          // to see if there is already a Promise resolving to the
          // desired Record (mapped by uid). If there isn't, use the
          // `manager` to ensure the Record exists (this will search the
          // full RecordTree, and if the Record still isn't found it
          // will initialize it based on its value in the Bank)
          
          if (selected.rec) {
            
            /// {DEBUG=
            if (hrecs.has(selected.rec.uid) && hrecs.get(selected.rec.uid).rec !== selected.rec)
              throw Error(`OWWWWWW Bank probably incorrectly instantiated a dupicate Record`).mod({ selected });
            /// =DEBUG}
            
            this.handleRec(selected.rec) && addedRecs.push(selected.rec);
            
          } else if (hrecs.has(selected.uid)) {
            
            // This RelHandler is already handling the uid - do nothing!
            // We don't even need to check if a duplicate instance was
            // instantiated, because there's no reason to think the
            // Bank's process of Selecting created any Record instance!
            
          } else {
            
            newHrecPrms.push(then(
              this.manager.ensureRecord(selected.uid, selected),
              rec => this.handleRec(rec) && addedRecs.push(rec), // TODO: What if Selection is ended early, finally block sends all
              cause => err.propagate({ cause, msg: `Couldn't ensure "${selected.uid}" during selection` })
            ));
            
          }
          
        }
        
        // Wait for all new hrecs to be handled
        await Promise.all(newHrecPrms);
        
        this.auditSrc?.mod({ add: +addedRecs.length, delta: addedRecs });
        
      } finally {
        
        // Note that an Error is probably fatal if `this.auditSrc` is
        // set, because it will have short-circuited the `try` block
        // before the change was sent to `this.auditSrc`!
        
        activeSignal.end();
        
      }
      
    },
    handleRec(rec) {
      
      /// {ASSERT=
      if (this.hrecs.has(rec.uid) && this.hrecs.get(rec.uid).rec !== rec) throw Error('OWWWWWWW FRICKKKK');
      /// =ASSERT}
      
      // Ignore any Records that are Ended or already handled
      if (rec.off()) return;
      if (this.hrecs.has(rec.uid)) return null;
      
      // Create `hrec` and ensure that if `rec` ends, `hrec` ends too
      let hrec = Tmp({ rec, desc: () => `HandledRecord(${rec.desc()})` });
      
      mmm('hrecs', +1);
      this.hrecs.add(rec.uid, hrec);
      let recEndHrecRoute = rec.route(() => hrec.end());
      
      hrec.endWith(() => {
        
        // Remove the Record; inform the AuditSrc; sever the relation
        // that `rec` ends `hrec`
        this.hrecs.rem(rec.uid); mmm('hrecs', -1);
        this.auditSrc && this.auditSrc.mod({ add: -1, delta: [ rec ] });
        recEndHrecRoute.end();
        
      });
      
      // Send `hrec`, and if an AuditSrc exists and no Selection is
      // currently running send an Audit too
      this.send(hrec);
      if (this.auditSrc && this.activeSignal.off()) this.auditSrc.mod({ add: +1, delta: [ rec ] });
      
      // Remove earlier Hrecs until we're back below the limit
      while (this.hrecs.size > this.limit) this.hrecs.values().next().value.end();
      
      return hrec;
      
    },
    
    ready() {
      if (this.activeSignal.off()) return;
      if (!this.activeSignal['~prm']) this.activeSignal['~prm'] = Promise(rsv => this.activeSignal.route(rsv, 'prm'));
      return this.activeSignal['~prm'];
    },
    getRecs() {
      return then(this.ready(), () => this.hrecs.toArr(hrec => hrec.rec));
    },
    getRec() {
      return then(this.ready(), () => {
        for (let hrec of this.hrecs.values()) return hrec.rec;
        return null;
      });
    },
    async findRecs(fn) {
      await Promise(rsv => this.activeSignal.route(rsv));
      return this.hrecs.toArr(hrec => fn(hrec.rec) ? hrec.rec : skip);
    },
    async findRec(fn) {
      await Promise(rsv => this.activeSignal.route(rsv));
      for (let hrec of this.hrecs.values()) if (fn(hrec.rec)) return hrec.rec;
      return null;
    },
    
    cleanup() {
      
      mmm('relHandlerRef', -1);
      delete this.rec.relHandlers[this.key];
      
      let hrecs = this.hrecs;
      this.hrecs = Map.stub;
      for (let [ uid, hrec ] of hrecs) hrec.end();
      this.activeSignal.end();
      
    }
    
  })});
  
  let Record = form({ name: 'Record', has: { Tmp }, props: (forms, Form) => ({
    
    // Records can simultaneously be thought of as Groups and Members.
    // Thinking of a Record as a Group means we consider the Members
    // that are concretely fixed as inseparable from that Record; i.e.,
    // a Group cannot be in memory unless its Members are all in memory!
    // 
    // When considering a Member we can think of all the Groups that
    // contain that Member. Note that a Member can exist in memory
    // without any of the Groups that contain it also being loaded.
    // Querying Groups given a Member can be complex; e.g. LIMIT+OFFSET
    // kinda stuff, filters, etc.
    // 
    // A Record has a set of Members (if considered as a Group) and a
    // set of Holders (the Groups containing the Record, when considered
    // as a Member)
    
    $relHandlerMethods: Object.plain({
      all: rh => rh.getRecs(),
      one: rh => rh.getRec()
    }),
    $ValuePropSrc: form({ name: 'ValuePropSrc', has: { MemSrc, Endable }, props: (forms, Form) => ({
      
      init(valueSrc, prop) {
        forms.MemSrc.init.call(this);
        forms.Endable.init.call(this);
        
        if (!isForm(prop, String)) throw Error(`Must provide a String property`);
        
        Object.assign(this, { srcRoute: null });
        
        let lastVal = skip;
        this.srcRoute = valueSrc.route(delta => {
          
          // TODO: Would be much nicer if we used `delta` but there is an
          // issue involving a Routing setup where at the moment that the
          // Send goes out `this.valueSrc.val` is perfectly in-sync with
          // `delta`, but some Route before this one mutates
          // `this.valueSrc.val` so that it goes out-of-sync with `delta`;
          // overall this means `this.valueSrc.val` holds a more reliable
          // value than `delta`
          
          let val = valueSrc.val;
          if (!isForm(val, Object)) return;
          if (!val.has(prop)) return;
          if (val[prop] === lastVal) return;
          
          this.send(lastVal = val[prop]);
          
        });
        
      },
      cleanup() { this.srcRoute.end(); }
      
    })}),
    
    init({ type, uid, group=Group(type.manager, {}), value=null, volatile=false }) {
      
      /// {DEBUG=
      let offMem = group.mems.find( mem => mem.off() ).val;
      if (offMem) throw Error('Api: Record created with ended Member').mod({ member: offMem });
      if (!isForm(type, Type)) throw Error(`Api: "type" must be Type; got ${getFormName(type)}`).mod({ type });
      if (!isForm(uid, String)) throw Error(`Api: "uid" must be String; got ${getFormName(uid)}`).mod({ uid });
      /// =DEBUG}
      
      forms.Tmp.init.call(this);
      
      // Update info about the Group associated with this Type
      type.updateTypeTerms( group.mems.map(mem => mem.type) );
      
      // A Record is always volatile if any of its Members are
      if (!volatile) volatile = group.mems.find(mem => mem.volatile).found;
      
      // Assign instance props
      Object.assign(this, {
        
        type, uid, group,
        valueSrc: MemSrc(value), // TODO: Use Src(function newRoute(...) { ... }) to remove MemSrc dependency
        volatile,
        relHandlers: Object.plain(),
        
        endWithMemRoutes: group.mems.toArr(mem => mem.route(() => this.end())),
        bankedPrm: null
        
      });
      denumerate(this, 'group');
      denumerate(this, 'relHandlers');
      denumerate(this, 'endWithMemRoutes');
      denumerate(this, 'bankedPrm');
      
      mmm('record', +1);
      this.endWith(() => mmm('record', -1));
      
      this.type.manager.recordSc(() => `INIT ${this.desc()}`);
      
      // Apply Banking
      let err = Error('');
      this.bankedPrm = (async () => {
        
        // Consider:
        //  | let scp = Scope(..., (dep) => {
        //  |   
        //  |   let chooser = dep(Chooser.noneOrSome(rec.rh('eg.type')));
        //  |   dep.scp(chooser.srcs.off, (noRec, dep) => {
        //  |     let createAct = dep(hut.enableAction('eg.createRec', () => hut.addRecord('eg.type', ...)));
        //  |   });
        //  |   
        //  | });
        // This type of pattern had wonderful elegance before the Bank
        // changes, because the "eg.createRec" Act would only be
        // available until it was run, as running it would create the
        // Record, the Chooser would turn "onn", and `chooser.srcs.off`
        // `dep` would End the Act - SYNCHRONOUSLY, so there was never
        // a possibility of multiple Acts running in quick succession
        // and creating more "eg.type" Recs beyond the first. Want to
        // maintain this pattern after the Banking changes; for that
        // reason the Rec is synchronously propagated to all its Holders
        // before `syncPrm` gets `await`ed
        
        try {
          
          let syncPrm = this.type.manager.bank.syncRec(this);
          
          // Now that this Record has been Banked we can inform all
          // Members of their new Holder, `this`. Note we only inform
          // Members with an active RelHandler handling `this`!
          for (let [ term, mem ] of this.group.mems) for (let k in mem.relHandlers) {
            
            let rh = mem.relHandlers[k];
            
            // Skip RelHandlers that aren't for our Type
            if (rh.type !== this.type) continue;
            
            // Skip RelHandlers that are irrelevant to the Term
            if (rh.term !== term) continue;
            
            // TODO: Right now `rec` is rejected if the RelHandler is at
            // its capacity - but technically it's possible that Records
            // which the RelHandler is only newly aware of outprioritize
            // pre-existing Records; this occurs when the new Record has
            // an earlier offset. Technically if `rec` would be ignored
            // due to the RelHandler being full we need to check if it
            // should be ordered ahead of any of the already-handled
            // hrecs (could also try calling `this.mod(this)` to
            // repopulate the RelHandler from scratch)
            
            // Skip the RelHandler if it's already full
            if (rh.hrecs.size >= rh.limit) continue;
            
            rh.handleRec(this);
            
          }
          
          this.type.manager.recordSc(() => `PROP ${this.desc()}`); // "propagate" to all Holders...
          await syncPrm;
          this.type.manager.recordSc(() => `SYNC ${this.desc()}`); // The Record was valid for every Holder!
          
        } catch (cause) {
          
          // Any Errors upon Banking / informing Holders result in the
          // Record Ending immediately
          
          this.type.manager.recordSc(() => `FAIL ${this.desc()}`, err);
          
          try { this.end(); }
          catch (endCause) {
            err.propagate({
              msg: `Failed banking Record, and failed ending it`,
              cause: [ cause, endCause ], // TODO: Would be nice to provide this as { bank: cause, end: endcause }
              record: this,
            });
          }
          
          err.propagate({ msg: `Failed to bank Record, but ended it successfully`, cause, record: this });
          
        }
        
        return this;
        
      })();
      
    },
    desc() { return `${getFormName(this)}${this.volatile ? '??' : ''}(${this.type.name}, ${this.uid})`; },
    * iterateBreadthFirst() {
      
      let nextRecs = [ this ];
      let recs = [];
      while (nextRecs.length) {
        
        [ recs, nextRecs ] = [ nextRecs, [] ];
        
        for (let rec of recs) {
          yield rec;
          nextRecs.gain(rec.group.mems.toArr(mem => mem));
        }
        
      }
      
    },
    * iterateDepthFirst() {
      yield this;
      for (let [ , mem ] of this.group.mems) yield* mem.iterateDepthFirst();
    },
    * iterateAll(seen=Set()) {
      
      // Iterates as many Records as can be referenced from `this` as
      // possible, including both Members and all Records of Hrecs of
      // all available RelHandlers
      
      if (seen.has(this)) return;
      seen.add(this);
      
      // Yield Member tree
      yield this;
      for (let [ k, rec ] of this.group.mems) yield* rec.iterateAll(seen);
      
      // Yield active Holder tree
      for (let k in this.relHandlers) for (let [ uid, hrec ] of this.relHandlers[k].hrecs) {
        
        yield* hrec.rec.iterateAll(seen);
        
      }
      
    },
    
    // Low-level relationship handling
    resolveTypeAndTerm(args /* type | 'eg.type/term' | { type, term=null, ...opts } */) {
      
      // `type` is the Type of the Record that Groups `this`
      // `term` is the Term Records must use to Group `this`
      let { type, term=null, ...opts } = isForm(args, Object) ? args : { type: args };
      
      // Takes either a String, or `{ type: '...', term: '...' }`, and
      // returns `{ type: Type(), term: '...' }`. Note that in the
      // String case the String may embed both type and term, separated
      // by "/" (e.g. "loft.recType/recTerm")
      
      // At this point a "type" value needs to have been provided
      if (!type) throw Error(`"type" required`);
      
      // If `type` was provided as a String we'll resolve it to `Type()`
      if (isForm(type, String)) {
        
        // Apply default prefix if none provided
        if (!type.has('.')) type = `${this.type.getPrefix()}.${type}`;
        
        // If `type` includes "/" then it embeds `term` too (in which
        // case it's illegal to also supply `term` directly).
        if (type.has('/')) {
          if (term !== null) throw Error(`Can't provide dual-component "type" along with "term"`);
          [ type, term ] = type.cut('/', 1);
        }
        
        // TODO: Can we immediately initialize a new Type if none exists
        // and return it, with persist-loading any previous details of
        // that type lazily? I think it should work since all consumers
        // should agree on Type details regardless of whether they
        // received those details from a Src or from the persistence
        // layer
        type = this.type.manager.getType(type);
        
      }
      
      // TODO: `isForm` or `hasForm`? Would `Type` ever be extended??
      if (!isForm(type, Type)) throw Error(`"type" must be a Type(...); got a ${getFormName(type)}(...)`);
      
      // If no `term` available yet (it wasn't embedded in the String or
      // provided directly) we'll guess the best value for it!
      if (term === null) {
        
        // Assume we only have a single RelSrc of type `type`. Search
        // `type.termTypes` for RecType; if it's been seen before use
        // the existing term. If not, use the type name as the term.
        
        // Try to get `term` as a key that has already been used to map
        // `this.type` to `type`
        term = type.termTypes.find(preexistingType => preexistingType === this.type).key;
        if (!term) {
          
          // First mention of this Type, and no Term specified; use the
          // Type's name as the Term. Also ensure that `type` remembers
          // that a relationship under this `term` exists!
          term = this.type.name;
          type.updateTypeTerms({ [term]: this.type });
          
        }
        
      }
      
      // Sanity check
      if (!isForm(term, String)) throw Error(`Invalid "term" of type ${getFormName(term)}`);
      
      return { type, term, ...opts };
      
    },
    relHandler(args /* type | 'eg.type/term' | { type, term=null, offset=0, limit=Infinity, fixed=null, opts={} } */) {
      
      // `type` is the Type of the Record that Groups `this`
      // `term` is the Term Records must use to Group `this`
      let { type, term, offset=0, limit=Infinity, fixed=null, opts={} } = this.resolveTypeAndTerm(args);
      
      if (fixed === null) fixed = opts.empty();
      
      /// {DEBUG=
      if (fixed && !opts.empty()) throw Error(`Pretty sure if fixed, opts must be empty!`);
      /// =DEBUG}
      
      // If `fixed === false`, `key` must be a value that isn't already set in `this.relHandlers`.
      // Note we must maintain a reference even to "unfixed"/"dynamic" RelHandlers, as in order to
      // correctly propagate newly created Records to their Members we must iterate all RelHandlers
      // of all Members in memory.
      // 
      // Note that both Type and Term need to be included in the unique key. If only Term were
      // provided, the following:
      // 
      //    | // Note `loftRec.type.name === 'eg.loft'`
      //    | loftRec.relHandler({ type: 'eg.type1' });
      //    | loftRec.relHandler({ type: 'eg.type2' });
      // 
      // would create the same key: "eg.loft/0:Infinity" (because both Types Group `loftRec` under
      // the same Term, e.g. "eg.loft")
      // 
      // If only Type were provided, the following:
      //  
      //    | let myA1 = Record('eg.a');
      //    | 
      //    | let myB1 = Record('eg.b', { a1: myA1, a2: anotherA });
      //    | let myB2 = Record('eg.b', { a1: anotherA, a2: myA1 });
      //    | 
      //    | myA1.relHandler({ type: 'eg.b', term: 'a1' }); // Expected hrecs: [ myB1 ]
      //    | myA1.relHandler({ type: 'eg.b', term: 'a2' }); // Expected hrecs: [ myB2 ]
      // 
      // would create the same key: "eg.b/0:Infinity" (the RelHandlers are more specific than just
      // the Type: it must be the Type PLUS its link via a specific Term. Need to capture this
      // information in the `key`, or else a pre-existing RelHandler for a separate, unrelated Term
      // (but coincidentally same Type) could be returned when we want a RelHandler for the same
      // Type, but distinct Term)
      let key = fixed
        ? `${type.name}/${term}/${offset}:${limit}`
        : `${type.name}/${term}/u:${Math.random().toString(16).slice(2)}`;
      
      if (!this.relHandlers[key]) {
        
        this.relHandlers[key] = RelHandler(this.type.manager, {
          key, rec: this, type, term,
          offset, limit, fixed,
          ...opts
        });
        mmm('relHandlerRef', +1);
        
      } else {
        
        this.relHandlers[key].hold();
        
      }
      
      return this.relHandlers[key];
      
    },
    rh(args) { return this.relHandler(args); },
    withRh(...args /* Same args as relHandler but Object takes "fn" prop, and simple list can end with Function */) {
      
      let fn = null;
      let rhArgs = null;
      
      if (args.length === 1) {
        
        /// {DEBUG=
        if (!isForm(args[0], Object)) throw Error(`Api: single argument must be Object; got ${getFormName(args[0])}`);
        /// =DEBUG}
        
        let { fn: fn0='all', ...rhArgs0 } = args[0];
        fn = fn0;
        rhArgs = [ rhArgs0 ];
        
      } else {
        
        fn = args.at(-1);
        rhArgs = args.slice(0, -1);
        
      }
      
      let defaultLimit1 = true
        && fn === 'one'
        && args.length === 1
        && isForm(args[0], Object)
        && !args[0].has('limit');
      if (defaultLimit1) args[0].limit = 1;
      
      if (fn?.constructor === String) fn = Form.relHandlerMethods[fn];
      if (!hasForm(fn, Function)) throw Error(`"fn" should be Function but got ${getFormName(fn)}`).mod({ fn });
      
      let rh = this.rh(...rhArgs);
      
      // TODO: Using `global.safe` + `global.then` removes need for `async`??:
      let result;
      try { result = fn(rh); } catch (err) { rh.end(); throw err; }
      
      return then(result,
        val => (rh.end(), val),
        err => (rh.end(), err.propagate())
      );
      
      // TODO: Is the above a fine replacement for this?
      //try     { return await fn(rh); }
      //finally { rh.end(); }
      
    },
    
    // Higher-level api
    getMember(term) {
      
      // Try to get the Member directly by the Term
      
      if (this.group.mems.has(term)) return this.group.mems[term];
      if (this.group.terms.has(term)) return null; // TODO: Just store `null` in `group.mems` and return `group.mems[term]`??
      
      // Perhaps `term` is a Type's name, without the shortname prefix?
      // Add the shortname prefix and check for a matching member...
      if (!term.has('.')) {
        let pfxTerm = `${this.type.getPrefix()}.${term}`;
        if (this.group.mems.has(pfxTerm)) return this.group.mems[pfxTerm];
        if (this.group.terms.has(term)) return null;
      }
      
      throw Error(`${this.desc()} has no Member Termed "${term}"`);
      
    },
    m(term) { return this.getMember(term); },
    getValue(key=null) {
      
      if (!key) return this.valueSrc.val;
      
      // Return the value of some member in breadth-first fashion. This
      // is more memory intensive than depth-first, but the results are
      // much more intuitive (for a complex GroupRec, it is much easier
      // to understand how "far away" some indirect value is, than the
      // depth-wise iteration order that would occur otherwise).
      for (let mem of this.iterateBreadthFirst()) {
        let val = mem.valueSrc.val;
        if (isForm(val, Object) && val.has(key)) return val[key];
      }
      
      return null;
      
    },
    getValues(...keys) { return keys.toObj(key => [ key, this.getValue(key) ]); }, // TODO: This could be more efficient
    getValuePropSrc(prop) {
      
      // TODO: ValuePropSrcs should be tracked and reused! So multiple
      // requests for the same ValuePropSrc return the same instance,
      // using refs to make sure ending 1 use doesn't end all. Then make
      // sure that Records clean up their ValuePropSrcs when they end!
      // Note this will remove the need to perform the second line in
      // every case like:
      //    | let propSrc = rec.getValuePropSrc('prop');
      //    | rec.endWith(propSrc);
      // but may require any Routes created on the ValuePropSrc to be
      // "tmp" (whereas previously it was safe to make them "prm", as
      // each ValuePropSrc was a unique instance and confined in scope).
      // Note this will also require all tracked ValuePropSrcs to be
      // ended when the Record is cleaned up!
      
      return Form.ValuePropSrc(this.valueSrc, prop);
      
    },
    setValue(value) {
      
      let curVal = this.valueSrc.val;
      let curIsObj = isForm(curVal, Object);
      
      // Functions resolve to a transformation on the current value; if
      // the current value is an Object a snapshot of it is passed; this
      // allows the passed param to be modified and returned in-place,
      // which can shorten the code required in some use-cases
      if (isForm(value, Function)) {
        let passVal = curIsObj ? { ...curVal } : curVal; // TODO: Deep copy required? (Yes!)
        value = value(passVal);
        if (value === skip) value = passVal;
      }
      
      if (curIsObj && value === curVal) throw Error(`Can't provide identity for ${this.desc()}.setValue`);
      if (value === skip) throw Error(`Can't provide skip for ${this.desc()}.setValue`);
      
      // Note that an Object-delta-style value update can't be performed
      // if either the previous or new value is a non-Object!
      if (!isForm(value, Object) || !curIsObj) return this.valueSrc.send(value);
      
      // Reduce `delta` to only props that currently mismatch
      let delta = value.map( (v, k) => (v === curVal[k]) ? skip : v );
      if (!delta.empty()) {
      
        // Mutate `curVal` to sync it with the full current value, but only Send `delta`!
        Object.assign(curVal, delta); // `curVal` is a reference to `this.valueSrc.val`
        Src.prototype.send.call(this.valueSrc, delta); // `this.valueSrc.val` is untouched; `delta` is Sent
        
      }
      
    },
    
    end() { forms.Tmp.end.call(this); return this.endedPrm; },
    cleanup() {
      
      this.type.manager.recordSc(() => `FINI ${this.desc()}`);
      
      for (let endWithMemRoute of this.endWithMemRoutes) endWithMemRoute.end();
      
      let rhs = Object.values(this.relHandlers);
      this.relHandlers = Object.stub;
      for (let rh of rhs) rh.end();
      
    }
    
  })});
  
  return { Manager, Type, Group, Record };
  
};
