global.rooms['Hut'] = async foundation => {
  
  let { Manager: RecordManager, Record } = await foundation.getRoom('record');
  
  return form({ name: 'Hut', has: { RecordManager, Record }, props: (forms, Form) => ({
    
    init({ uid=null, parHut=null, isHere, isManager, isRec=true, ...moreArgs }={}) {
      
      if (!uid) throw Error('A uid is required');
      
      // TODO: `foundation` is only used to determine here/afar!!
      Object.assign(this, { uid, parHut, isHere, isAfar: !isHere, isManager }); // TODO: are `isHere` and `isManager` always the same?? (Can they be simplified?)
      
      /// {DEBUG=
      this.actionCallback = () => {};
      /// =DEBUG}
      
      // Default prefix to prepend to enableAction keys, etc.
      this.defaultPfx = null;
      
      // Commands mapped to handling functions
      this.roadSrcs = Object.plain({});
      
      // Map RecType names to the class used to represent them
      if (this.isManager) this.typeToClsFns = {};
      
      if (this.isAfar) {
        
        /// {ABOVE= afar -> a local representation of a remote Client
        
        // Track changes to eventually be synced for this AfarHut
        this.pendingSync = { add: {}, upd: {}, rem: {} };
        
        // This resolves when our pending sync is ready to send
        this.throttleSyncPrm = null;
        
        // The most recent version synced to Below
        this.syncTellVersion = 0;
        
        /// =ABOVE}
        /// {BELOW= afar -> a local representation of a remote Server
        
        /// =BELOW}
        
      }
      
      if (this.isHere) {
        
        // If syncs arrive out-of-order we need to buffer the later ones
        // until we receive the earlier ones (and "fill in the gap"). A
        // Map is used to map sync-order values to their corresponding
        // sync payloads
        this.bufferedSyncs = Map();
        
        this.roadSrc('error').route(args => {
          
          gsc('Road error', args);
          
          /// {BELOW=
          // Road Errors can indicate that the user used a Real to
          // perform an Action that no longer existed Above - this is
          // often because of transport desyncs, and especially because
          // of multiple tabs (the single-tab-ensurance logic is very
          // simple; the newest tab simply updates LocalStorage and
          // immediately assumes it is receiving all network events -
          // but if another tab was previously active, it may consume a
          // network event intended for the latest tab, before it closes
          // itself in accordance with single-tab-ensurance... this
          // often results in a "road error" event)
          foundation.restart();
          /// =BELOW}
          
        });
        this.roadSrc('multi').route(({ src, msg, reply /* src, trg, reply, road, ms, msg */ }) => {
          
          // TODO: This isn't being used rn??
          
          let { list=null } = msg;
          
          if (!isForm(list, Array)) return reply({
            command: 'error',
            type: 'invalidMultiList',
            orig: msg
          });
          
          // TODO: If `reply` is available we could swap it with a fn
          // that buffers every Hear result, concatenates it together
          // into a multipart response, and sends the multipart data
          // with the original `reply` function...
          for (let msg of list) this.hear({ src, msg });
          
        });
        
        /// {ABOVE=
        
        this.ownedHutRh = null;
        this.knownRoomDependencies = Set();
        this.knownRealDependencies = Set();
        this.roadSrc('thunThunk').route(({ src, trg, reply, msg }) => { /* nothing */ });
        
        /// =ABOVE} {BELOW=
        
        // The most current version this Hut is waiting to have synced
        this.syncHearVersion = 0;
        
        // Sometimes our Above is locking some Road resource, and
        // decides to discard it without using it (e.g. a long-poll).
        // In this case the Above will use the "fizzle" command
        this.roadSrc('fizzle').route(({ msg }) => { /* nothing */ });
        
        // BelowHuts are always open to syncs from Above
        this.roadSrc('sync').route(({ msg }) => {
          
          try {
            let { v: version, content } = msg;
            if (!isForm(version, Number)) throw Error('Invalid "version"');
            if (!version.isInteger()) throw Error('Invalid "version"');
            if (!isForm(content, Object)) throw Error('Invalid "content"');
            if (version < this.syncHearVersion) throw Error(`Duplicated sync (version: ${version}; current version: ${this.syncHearVersion})`);
            
            // Add this newly arrived sync to the buffer
            this.bufferedSyncs.set(version, content); mmm('bufferSync', +1);
            
            // Now perform as many pending syncs as possible; these must
            // be sequential, and beginning with the very next expected
            // sync (numbered `this.syncHearVersion`)
            let bank = this.type.manager.bank;
            while (this.bufferedSyncs.has(this.syncHearVersion)) {
              
              let sync = this.bufferedSyncs.get(this.syncHearVersion);
              this.bufferedSyncs.rem(this.syncHearVersion); mmm('bufferSync', -1);
              this.syncHearVersion++;
              bank.syncSer(this, sync);
              
            }
            
            if (this.bufferedSyncs.size > 50) throw Error('Too many pending syncs');
            
          } catch (err) {
            
            gsc('Error while Syncing - this can occur if the AboveHut was restarted unexpectedly', err);
            return foundation.restart();
            
          }
          
        });
        
        /// =BELOW}
        
      }
      
      /// {ABOVE=
      if (!this.parHut) { // I think the condition should be `!!this.isManager`, not `!this.parHut`
        
        // If no parent, we are a ParentHut. We have a responsibility
        // to manage ChildHuts.
        
        this.netAddrReputation = Map();
        
         // For managing ChildHuts
        this.roadedHutIdCnt = 0;
        this.roadedHuts = Map(); // Map kidHutUid => { hut: Hut(...), roads: Map( Server(...) => Road(...) ) }
        
        // Track which Records are followed by which Huts
        this.allFollows = Object.plain(/* uid -> { hutId -> FollowTmp } */);
        
      } else {
        
        this.followedRecs = Set(/* Record */);
        
      }
      /// =ABOVE}
      
      // Only initialize as a RecordManager as required
      if (this.isManager) forms.RecordManager.init.call(this, { ...moreArgs });
      
      // Always initialize as a Record
      if (isRec) forms.Record.init.call(this, {
        
        uid: this.uid,
        type: this.getRecMan().getType('hut.hut'),
        group: this.getRecMan().getGroup([]),
        value: {}, // TODO: Could potentially transfer configuration args here instead of embedded in html...
        volatile: this.isAfar
        
      });
      
      /// {ABOVE=
      if (this.isHere) {
        this.ownedHutRh = Tmp.stub;
        this.ownedHutRh = this.relHandler('hut.owned/above'); // Get 'hut.owned' Recs where `this` is the Par
        this.bankedPrm = this.bankedPrm.then(() => this.ownedHutRh.ready());
      }
      /// =ABOVE}
      
      mmm('hut', +1);
      foundation.subcon('hinterland')({ type: 'join', hut: this.desc() });
      
    },
    desc() {
      return [
        this.isHere ? 'Here' : 'Afar',
        this.parHut ? 'Kid' : 'Par',
        getFormName(this),
        `(${this.type?.name ?? '<typeless>'} @${this.uid})`
      ].join('');
    },
    
    /// {ABOVE=
    getHutUid() {
      
      // Note Huts can manage in 2 different ways:
      // 1. Manage Records: create new Records, maintain Record types:
      //    "RecManager"
      // 2. Manage KidHuts: new identities are able to join as KidHuts:
      //    "KidManager"
      // Note that a Hut that does both needs to manage Follows; KidHuts
      // Follow Recs maintained by their ParHut: "FollowManager"
      return [ this.roadedHutIdCnt++, Math.floor(Math.random() * 62 ** 8) /* TODO: Use a stock random instance? */ ]
        .map(v => v.encodeStr(String.base62, 8))
        .join('');
      
    },
    getRoadedHut(server, road, hutId=this.getHutUid()) {
      
      // Note that this always returns a RoadedHut; potentially a fresh
      // instance if `hutId` doesn't correspond to an existing RH. Note
      // that a custom `hutId` can be specified to allow for spoofage.
      
      let trafficSubcon = foundation.subcon('road.traffic');
      
      let newHut = null;
      if (!this.roadedHuts.has(hutId)) {
        
        let Hut = this.Form;
        let hut = newHut = Hut({ uid: hutId, parHut: this, isHere: false, isManager: false, isRec: true });
        
        mmm('roadedHuts', +1);
        this.roadedHuts.set(hutId, { hut, roads: Map(/* Server => Road */) });
        hut.endWith(() => {
          
          let { roads } = this.roadedHuts.get(hutId);
          for (let [ , road ] of roads) road.end();
          
          mmm('roadedHuts', -1);
          this.roadedHuts.rem(hutId);
          
        });
        
        trafficSubcon({ type: 'join', hut: hut.desc() });
        hut.endWith(() => trafficSubcon({ type: 'exit', hut: hut.desc() }));
        
      }
      let roadedHut = this.roadedHuts.get(hutId); // roadedHut ~= { hut: Hut(...), roads: Map(Server => Session/Road) }
      
      if (!roadedHut.roads.has(server)) {
        
        // Map Server->Road for this RoadedHut
        let { roads, hut } = roadedHut;
        
        // Track the new Road
        mmm('roads', +1);
        roads.set(server, road);
        
        // When a Road Ends we additionally check to see if there are
        // any Roads remaining - if not we end the KidHut as well!
        road.endWith(() => { roads.rem(server); mmm('roads', -1); roads.empty() && hut.end(); });
        
        // Subcon output
        if (trafficSubcon.enabled) {
          let netAddrs = () => Set(...roads.toArr(road => road.knownNetAddrs)).toArr(v => v);
          trafficSubcon({ type: 'hold', hut: hut.desc(), numRoads: roads.size, netAddrs: netAddrs(), server: server.desc() });
          road.endWith(() => trafficSubcon({ type: 'drop', hut: hut.desc(), numRoads: roads.size, netAddrs: netAddrs(), server: server.desc() }));
        }
        
      }
      
      // Do this last so that Roads are all in place before the new Hut
      // propagates to any Holders
      if (newHut) this.getRecMan().addRecord({ type: 'hut.owned', group: { par: this, kid: newHut }, uid: `!owned@${this.uid}@${newHut.uid}` });
      
      return roadedHut;
      
    },
    getRoadFor(hut) {
      
      if (hut === this) throw Error(`Supplied self (${this.desc()})`);
      
      let road = null
      let cost = Infinity;
      for (let roadedHut of [ this.roadedHuts?.get(hut.uid), hut.roadedHuts?.get(this.uid) ]) {
        if (!roadedHut) continue;
        for (let r of roadedHut.roads.values()) {
          let curCost = r.currentCost();
          if (curCost < cost) { road = r; cost = curCost; }
        }
      }
      
      return road;
      
    },
    getKnownNetAddrs() {
      
      if (!this.parHut) return Set.stub;
      
      let roadedHut = this.parHut.roadedHuts.get(this.uid);
      if (!roadedHut) return Set();
      
      return Set(roadedHut.roads.toArr(road => road.netAddr));
      
    },
    strike(amt, reason=null) {
      
      if (!this.parHut) throw Error(`Should only call "strike" on KidHuts`);
      
      let ms = Date.now();
      let naRep = this.parHut.netAddrReputation;
      for (let netAddr of this.getKnownNetAddrs()) {
        
        let rep = naRep.get(netAddr);
        if (!rep) {
          naRep.set(netAddr, rep = { total: 0, window: 0, strikes: [] });
          mmm('netAddrRep', +1);
        }
        
        if (rep.window < 1) { // Don't bother with struck-out NetworkAddresses
          
          mmm('netAddrStrike', +1);
          rep.strikes.push({ reason, amt, ms });
          rep.total += amt;
          rep.window += amt;
          while ((ms - rep.strikes[0].ms) > (1000 * 60 * 15)) { // Remember strike for 15min
            rep.window -= rep.strikes[0].amt; // Relieve this strike
            rep.strikes.shift();
            mmm('netAddrStrike', -1);
          }
          
        }
        
        if (rep.window >= 1) this.end();
        
      }
      
      foundation.subcon('warning')('STRIKE!', this.getKnownNetAddrs().toObj(v => [ v, naRep.get(v) ]));
      
    },
    /// =ABOVE}
    
    // Transport
    hear({ src, road=null, reply=null, ms=foundation.getMs(), msg }) {
      
      // Causes `this` to tell `trg` a Message
      // Note that `ms` should typically be provided, and should
      // represent the high-precision time at which the tell occurred
      
      // How communication happens
      // | SrcHut  | TrgHut  | Road
      // |---------|---------|-----------------
      // | Here    | Here    | Not needed - direct is possible
      // | Here    | Afar    | **Default to cheapest Road available**
      // | Afar    | Here    | REQUIRED - Afar must have used Road
      // | Afar    | Afar    | N/A - we cannot direct two AfarHuts!
      // | None    | Here    | Road must not be provided
      // | None    | Afar    | N/A - Error!
      // | Any     | None    | N/A - Error!
      
      // Note that "unrelated" Huts are two Huts such that neither is
      // the other's descendant
      // Note that "disjoint" Huts are non-neighbours (they require a
      // Road to communicate)
      
      let trg = this;
      
      if (hasForm(msg, Error)) {
        foundation.subcon('warning')(`Error reply`, foundation.formatError(msg));
        msg = { command: 'error', type: 'application', msg: msg.message };
      }
      
      if (!msg) return;
      if (!src && road) throw Error(`Can't provide Road without SrcHut (who is on the other end of that Road??)`);
      if (!src && reply) throw Error(`Can't omit "src" and provide "reply" (who would receive that reply??)`);
      if (src && src.parHut !== trg && trg.parHut !== src) {
        throw Error(String.baseline(`
          | Supplied unrelated Huts (neither is the other's parent)
          | Src: ${src?.desc?.() ?? null}
          | Trg: ${trg?.desc?.() ?? null}
        `));
      }
      
      foundation.subcon('road.traffic')(() => ({
        type: 'comm',
        src: src?.desc() ?? null,
        trg: trg.desc(),
        msg: hasForm(msg, Keep) ? msg.desc() : msg
      }));
      
      if (!src && trg.isAfar) throw Error(`Can't tell TrgAfarHut when SrcHut is null`);
      if (!src) return trg.actOnTell({ src: null, road: null, reply: null, ms, msg });
      
      if (src.isAfar && trg.isAfar) throw Error('Supplied two AfarHuts');
      
      // Handle two local Huts communicating; this is trivial as they
      // both exist in the same js context
      if (src.isHere && trg.isHere) {
        
        // TODO: Conceptualize two HereHuts as NEIGHBOURS - they're
        // so close you don't need to take a Road to pass between them
        if (road) throw Error(`Provided two HereHuts but also a Road`);
        if (!reply) reply = msg => trg.tell({ trg: src, road, reply: null, ms, msg });
        return trg.actOnTell({ src, road, reply, ms, msg });
        
      }
      
      // Handle a remote/afar Hut Telling a local/here Hut; note this
      // entails that the Tell from the AfarHut is already available
      // locally, and referenced by `msg`
      if (src.isAfar && trg.isHere) {
        
        if (!road) {
          road = src.getRoadFor(trg);
          if (!road) throw Error(`Supplied AfarSrcHut but omitted Road, and no Road could be automatically selected`);
        }
        
        if (!reply) reply = msg => trg.tell({ trg: src, road, reply: null, ms, msg });
        return trg.actOnTell({ src, road, reply, ms, msg });
        
      }
      
      // Handle a local/here Hut Telling a remote/afar Hut - this is the
      // trickiest option because the Tell has to be shipped Afar; this
      // means a Road is absolutely required (and if none has been
      // explicitly provided we will select the available Road with the
      // lowest cost)
      if (src.isHere && trg.isAfar) {
        
        if (reply) throw Error(`Can't provide "reply" for HereHut -> AfarHut`);
        
        // Find the cheapest available Road if none provided
        if (!road) {
          road = src.getRoadFor(trg);
          if (!road) throw Error(`Couldn't determine a Road`);
        }
        
        // Send the Tell using the Road
        return road.tell.send(msg);
        
      }
      
      throw Error(`Couldn't communicate between Huts`);
      
    },
    tell({ trg, road=null, reply=null, ms=foundation.getMs(), msg }) {
      
      if (!trg) throw Error(`Must supply a TrgHut`);
      return trg.hear({ src: this, road, reply, ms, msg });
      
    },
    actOnTell({ src, road, reply, ms, msg }) {
      
      // Huts act on a Tell by applying the RoadSrc which corresponds to
      // the Tell's Message's "command" property
      
      let { command: cmd=null } = msg ?? {};
      if (!cmd) throw Error(`No Command provided`);
      if (cmd === 'lubdub') return;
      
      let roadSrc = null;
      let ptr = (src.parHut === this) ? src : this; // The KidHut may have more specialized functionality (note either `this.parHut === src`, or `src.parHut === this`)
      while (ptr && !roadSrc) [ roadSrc=null, ptr ] = [ ptr.roadSrcs[cmd], ptr.parHut ];
      if (roadSrc) return roadSrc.send({ src, trg: this, road, reply, ms, msg });
      
      /// {BELOW=
      
      throw Error(`Failed to handle command "${cmd}"`).mod({ data: msg });
      
      /// =BELOW} {ABOVE=
      
      let errMsg = {
        command: 'error',
        type: 'invalidCommand',
        reason: `Command "${cmd}" is not available`,
        orig: msg
      };
      if (reply) reply(errMsg);
      else       this.tell({ trg: src, road, msg: errMsg });
      
      /// =ABOVE}
      
    },
    roadSrc(command) {
      
      // TODO: This should initialize `let tmp = Tmp();` to represent
      // the attachment of a RoadSrc to the Hut, and return
      // `Object.assign(tmp, { src: this.roadSrcs[command] });` to
      // expose the RoadSrc to the consumer. Then this function can
      // become the single point where `this.roadSrcs` is populated (as
      // of writing this there's another instance in "enableAction")
      if (!this.roadSrcs[command]) this.roadSrcs[command] = Object.assign(Src(), { desc: () => `Hut ComSrc for "${command}"` });
      return this.roadSrcs[command];
      
    },
    enableAction(command, fn) {
      
      // To be run both ABOVE and BELOW.
      // The dual purpose is to give BELOW a Src for sending Tells, and
      // attach a RoadSrc to ABOVE for hearing such Tells. Note that for
      // a BETWEEN hut a RoadSrc is established and routed, but that
      // route always leads to a command proxying the action upwards.
      // This means that performing an action on a BETWEEN hut overall
      // performs the action ABOVE.
      
      if (!command.has('.')) {
        let pfx = this.getDefaultPfx();
        if (!pfx) throw Error(`Command "${command}" has no prefix`);
        command = `${pfx}.${command}`;
      }
      
      /// {ABOVE=
      if (this.roadSrcs[command]) throw Error(`Hut ${this.uid} already has Tell Sender for "${command}"`);
      /// =ABOVE}
      
      let tmp = Tmp({ name: command, act: ()=>{} });
      let srcHut = null;
      let trgHut = null;
      
      /// {BELOW=
      
      tmp.act = (msg={}) => {
        if (msg.has('command')) throw Error('Reserved property "command" was supplied');
        this.tell({ trg: this.parHut, msg: { ...msg, command } });
      };
      tmp.endWith(() => tmp.act = () => { throw Error(`Action "${command}" unavailable`); });
      
      // This is a bit of a hack to cover the BETWEEN case. ABOVE will
      // set `tmp.act` to Tell `command` from `srcHut` -> `trgHut`, and
      // route any such `command` to `fn`. If we are *not* BELOW, the
      // following lines don't execute, with the result being:
      // 1. The Tell is from a null SrcHut to `this` Hut, indicating
      //    that the action was self-initiated (e.g. `setTimeout`).
      // 2. `fn` is the direct logic itself (to be called as a direct
      //    result of the self-initiated action)
      // If we *are* BETWEEN, both BELOW and ABOVE will execute. Before
      // ABOVE code, the following lines execute. The purpose is to
      // differentiate the result from the ABOVE-only case:
      // 1. The Tell is from `this` Hut to our AboveHut. There will
      //    certainly be an AboveHut, because we are only BETWEEN.
      // 2. `fn` is not direct logic but rather a proxy to perform the
      //    action on the AboveHut - if the action was self-initiated
      //    (which is odd for a BETWEEN Hut, but I don't want to make
      //    it impossible) then `tmp.act(...)` performs a Tell, trying
      //    to run the action ABOVE. If the action is initiated from
      //    BELOW then the RoadSrc will receive the request from BELOW,
      //    and call `fn`, which calls `tmp.act`. Due to the nature of
      //    `tmp.act`, in the case also the action will be forwarded to
      //    be performed ABOVE!
      fn = msg => tmp.act(msg);
      [ srcHut, trgHut ] = [ this, this.aboveHut ];
      
      /// =BELOW} {ABOVE=
      
      // Provide a convenience function to perform the action as if a
      // `null` SrcHut enacted it. This style allows changes to Record
      // data to be externalized nicely. When we simply say
      // `rec.objVal({ action: 'occurred' })` the reason for the action
      // occurring becomes unrecordable, and state-tracing, for example
      // replay-style persistence, goes out of sync. So prefer this:
      //    |     
      //    |     let ts = dep(hut.enableAction('pfx.action', () => {
      //    |       rec.objVal({ action: 'occurred' });
      //    |     }));
      //    |     dep(someReason.route(() => ts.act()));
      //    |     
      // This style successfully captures the reason behind the action,
      // and makes the action generically accessible via "pfx.action".
      tmp.act = msg => srcHut.tell({ trg: trgHut, msg: { ...msg, command } });
      
      // Route any sends from a RoadSrc so that they call `fn`. Note
      // that `safe` allows either a value or an Error to be returned
      // (and makes it so that `return Error(...)` behaves the same as
      // `throw Error` within `fn`). Either the result or Error will be
      // used as a reply. Note that if the result is `C.skip`, `reply`
      // will ensure that no value ever gets sent.
      let hearSrc = this.roadSrcs[command] = Object.assign(Src(), { desc: () => `Hut TellSender for "${command}"` });
      
      tmp.endWith(() => delete this.roadSrcs[command]);
      tmp.endWith(hearSrc.route(async ({ msg, reply, ms, src, trg }) => {
        
        // `result` is either response data or resulting Error
        let result = await safe( () => fn(msg, { ms, src, trg }), err => err );
        if (result === skip) return reply(null);
        if (result === null) return reply(null);
        
        let isReplyData = false
          || [ Object, Array, String, Error ].has(result?.constructor)
          || hasForm(result, Error)
          || hasForm(result, Keep);
        if (isReplyData) return reply(result);
        
        /// {DEBUG=
        throw Error(`Action for "${command}" returned invalid type ${getFormName(result)} (should return response data)`);
        /// =DEBUG}
        
        reply(null);
        
      }));
      
      /// =ABOVE}
      
      /// {DEBUG=
      this.actionCallback(tmp);
      /// =DEBUG}
      
      return tmp;
      
    },
    
    getDefaultPfx() { return this.defaultPfx ?? this.parHut?.getDefaultPfx() ?? null;  },
    
    // Huts perform RecordManager duties either directly (if `isManager`
    // is set), or via their ParHut if one exists - errors are thrown if
    // neither is the case!
    getRecMan() {
      let ptr = this;
      while (ptr && !ptr.isManager) ptr = ptr.parHut;
      if (!ptr) throw Error(`${this.desc()} has no RecordManager capabilities (none of its ancestors are RecordManagers!)`);
      return ptr;
    },
    addTypeFormFn(name, fn, mode='tmp') {
      let recMan = this.getRecMan();
      if (recMan.typeToClsFns.has(name)) throw Error(`Tried to overwrite class function for "${name}"`);
      recMan.typeToClsFns[name] = fn;
      if (mode === 'tmp') return Tmp(() => delete recMan.typeToClsFns[name]);
    },
    findRecordInMemory(uid, opts={}) {
      
      let recMan = this.getRecMan();
      
      /// {ABOVE=
      // Check for `uid` in `this.allFollows`; the `uid` will map to at
      // least one `hutUid` following the Record (keying on `hutUid`
      // returns the Follow, which has a "rec" property); simply iterate
      // a `hutUid` and return the "rec" property of the mapped Follow
      let { allFollows } = recMan;
      if (allFollows[uid]) for (let hutUid in allFollows) return allFollows[hutUid].rec;
      /// =ABOVE}
      
      return forms.RecordManager.findRecordInMemory.call(recMan, uid, opts);
      
    },
    getRecordForm(args /* { type, group, value } */) {
      let recMan = this.getRecMan();
      let name = args.type.name;
      if (recMan.typeToClsFns.has(name)) return recMan.typeToClsFns[name](args);
      return forms.RecordManager.getRecordForm.call(recMan, args);
    },
    getType(...args) {
      return forms.RecordManager.getType.call(this.getRecMan(), ...args);
    },
    addRecord(...args /* type, group, value, uid | { type, group, value, uid } */) {
      return forms.RecordManager.addRecord.call(this.getRecMan(), ...args);
    },
    
    /// {ABOVE=
    
    // Following
    followRec(rec) {
      
      /* ### Following and Syncing ###
      
      Note that the HereHut always exists without needing to be synced;
      this is true both Above and Below; the HereHut is instantiated by
      the Foundation (of course Below the code to instantiate the
      Foundation is technically synced, but this is outside of Record
      syncing behaviour).
      
      So a HereHut always exists. Note that the AboveHereHut will have a
      fixed uid ("!hereHut"), while BelowHereHuts will typically be id'd
      with a uid randomly generated by Above (unless the BelowHereHut is
      spoofed, in which case it gets to pick its own id!)
      
      Note that Above, the AppRecord is anchored to the AboveHereHut.
      The actual AboveHereHut (uid "!hereHut") is never actually synced
      to any Below; instead Belows are intended to treat their own
      BelowHereHut as the AboveHereHut treats itself! The ability to
      reference the AppRecord from the HereHut is replicated Below; this
      is done simply by mapping any uid reference to the AboveHereHut to
      the uid of the BelowHereHut in every sync. So if we have:
          | let aboveHereHut = Hut({ type: 'hut.hut', uid: '!hereHut', ... });
          | let loftRecord = aboveHereHut.addRecord('eg.loft', [ aboveHereHut ], { desc: 'Example App!' });
      and we then sync `appRecord` to Below, we would expect:
          | {
          |   type: 'eg.loft',
          |   uid: '00000000',
          |   value: { desc: 'Example Loft!' },
          |   mems: { 'hut.hut': '!hereHut' }
          | }
      but this would fail to instantiate the AppRecord below; not all
      Members could be loaded, because a Member with uid "!hereHut"
      neither exists Below, nor is included in the sync (because the
      AboveHereHut is never synced anywhere). To address this, if the
      AboveHereHut were ever to be included in a Sync (due to Membership
      in another Record  that's being synced, especially the AppRecord,)
      its uid within the Sync is replaced by the uid of the BelowAfarHut
      that the Sync is addressed to. (TODO: Why not id every HereHut,
      regardless of Above or Below, "!hereHut"? That way no substitution
      is required in the Sync payload!)
      
      OVERALL:
      - The AboveHereHut is never synced
      - Nonetheless the AppRecord can be referenced via any HereHut,
        even a BelowHereHut!
      
      */
      
      if (this.isManager) throw Error(`${this.desc()} is a RecordManager; it shouldn't be Following Records`);
      if (rec.off()) return Tmp.stub; // Always ignore any ended Recs
      if (rec === this) return Tmp.stub; // Huts can't follow themselves
      
      let { allFollows } = this.getRecMan();
      let { uid: hutUid } = this;
      
      let tmp = Tmp({ desc: () => `FollowTree(${rec.desc()})` });
      
      // TODO: The following may be able to be simplified considering
      // that if any of the iterated Records end, `rec` will end too
      // (because a Member of its Group will end, with a cascading
      // effect) - this means we don't need to worry about partial
      // cleanup of the follow if an iterated Rec is Ended - the only
      // case is that the whole thing gets cleaned up at once!
      let followTmps = [ ...rec.iterateDepthFirst() ].map(rec => {
        
        if (rec === this) return skip;       // Don't follow ourself
        if (hasForm(rec, Form)) return skip; // Don't follow Huts
        
        // Ref a pre-existing Follow again; Note Records can be followed
        // via multiple independent Scope chains - just because a single
        // Scope chain ends and `end` is called on its Follow doesn't
        // mean the BelowHut has entirely unfollowed the Record!
        let preexistingFollowTmp = allFollows[rec.uid]?.[hutUid]; // This says "the Follow of `rec` by a Hut, id'd with `hutUid`"
        if (preexistingFollowTmp) return preexistingFollowTmp.ref();
        
        // First time following `rec`!
        let followTmp = Tmp({ rec, desc: () => `FollowSingle(${rec.desc()})` });
        
        mmm('allFollows', +1);
        if (!allFollows[rec.uid]) allFollows[rec.uid] = Object.plain(); // Reference the new Follow #1
        allFollows[rec.uid][hutUid] = followTmp;                        // Reference the new Follow #2
        mmm('followedRecs', +1);
        this.followedRecs.add(rec);                                     // Link the Hut to the Record
        this.toSync('add', rec);                                        // Generate an "add" sync item
        let valRoute = rec.valueSrc.route(delta => {                    // New values become "upd" syncs
          this.toSync('upd', rec, delta);
        });
        
        followTmp.route(() => { // Cleanup when the Follow ends
          
          mmm('allFollows', -1);
          delete allFollows[rec.uid][hutUid];                          // Unreference #1
          let empty = true;                                            // Check if...
          for (let k in allFollows[rec.uid]) { empty = false; break; } // ... no more huts ref this Record...
          if (empty) delete allFollows[rec.uid];                       // ... and if not clear up memory!
          mmm('followedRecs', -1);
          this.followedRecs.rem(rec);                                  // Unlink the Hut from the Record
          this.toSync('rem', rec);                                     // Generate a "rem" sync item
          valRoute.end();                                              // Stop monitoring value changes
          
        }, 'prm');
        
        // Make sure the Follow ends if the Record ends first (note this
        // temporary Route automatically ends if `followTmp` ends first)
        rec.endWith(followTmp, 'tmp');
        
        return followTmp;
        
      });
      
      tmp.endWith(() => { for (let tmp of followTmps) tmp.end(); });
      rec.endWith(tmp, 'tmp');
      this.endWith(tmp, 'tmp');
      return tmp;
      
    },
    
    // Syncing
    toSync(type, rec, delta=null) {
      
      // Use this function to accrue changes to the current Record delta
      // of a specific Hut; calling this function schedules a sync to
      // occur if none is already scheduled
      
      /// {ASSERT=
      if (!this.pendingSync.has(type)) throw Error(`Invalid type: ${type}`);
      /// =ASSERT}
      
      if (this.off()) return;
      
      let { add, upd, rem } = this.pendingSync;
      
      // add, rem: cancel out! No information on Record is sent
      // rem, add: cancel out! Record already present Below, and stays
      
      // Can add and rem occur together? NO  (conflicting messages!)
      // Can add and upd occur together? NO  (redundant!)
      // Can rem and upd occur together? YES (e.g. state is in the midst of change as deletion occurs)
      
      if (type === 'add') {
        
        if (rem.has(rec.uid)) delete rem[rec.uid];
        else {
          if (upd.has(rec.uid)) delete upd[rec.uid];
          add[rec.uid] = rec;
        }
        
      } else if (type === 'rem') {
        
        if (add.has(rec.uid)) delete add[rec.uid];
        else                  rem[rec.uid] = rec;
        
      } else if (type === 'upd') {
        
        if (add.has(rec.uid)) return; // No "upd" necessary: already adding!
        
        if (!upd.has(rec.uid) || !isForm(upd[rec.uid], Object) || !isForm(delta, Object)) {
          upd[rec.uid] = delta;
        } else {
          upd[rec.uid].gain(delta);
        }
        
      }
      
      // Don't schedule a sync if one is already scheduled!
      if (this.throttleSyncPrm) return;
      
      let err = Error('trace');
      let prm = this.throttleSyncPrm = foundation.soon().then(() => {
        
        // Can cancel scheduled sync by setting `this.throttleSyncPrm`
        // to another value
        if (this.throttleSyncPrm !== prm) return;
        this.throttleSyncPrm = null;
        
        // Hut may have dried between scheduling and executing sync
        if (this.off()) return;
        
        let updateTell = this.consumePendingSync(null);
        if (updateTell) this.parHut.tell({ trg: this, msg: updateTell });
        
      });
      
    },
    consumePendingSync(srcHut=null /* provide `srcHut` to sync-from-scratch */) {
      
      /// {ASSERT=
      if (!this.parHut) throw Error(`Don't consume ParHut syncs!`);
      /// =ASSERT}
      
      let pendingSync = this.pendingSync;
      this.pendingSync = { add: {}, upd: {}, rem: {} };
      
      if (srcHut) {
        
        /// {DEBUG=
        foundation.subcon('record.sync')(`${this.desc()} resetting sync-state for ${srcHut.desc()}`);
        /// =DEBUG}
        
        // Reset version and clear the current sync-delta, refreshing it
        // to indicate an "add" for every followed Record - essentially
        // this is "sync-from-scratch" behaviour!
        this.syncTellVersion = 0;
        let { add } = pendingSync = { add: {}, upd: {}, rem: {} };
        for (let rec of this.followedRecs) add[rec.uid] = rec;
        
      }
      
      // Creates sync for the BelowHut and modifies its representation
      // to be considered fully up-to-date
      let add = pendingSync.add.toArr(rec => {
        
        let { terms, mems } = rec.group;
        return {
          type: rec.type.name,
          uid: rec.uid,
          val: rec.getValue(),
          mems: terms.toObj(term => {
            
            if (!mems.has(term)) return [ term, null ];
            let mem = mems[term];
            
            // Both ParHut and KidHut map to KidHut uid
            if (mem === this)        return [ term, this.uid ];
            if (mem === this.parHut) return [ term, this.uid ];
            
            // Any other Huts are never synced
            if (hasForm(mem, Form)) return skip;
            
            // Simply sync any other Records!
            return [ term, mem.uid ];
            
          })
        };
        
      });
      let upd = pendingSync.upd.toArr((val, uid) => ({ uid, val }));
      let rem = pendingSync.rem.toArr(r => r.uid);
      
      let content = { add, upd, rem }.map(v => v.empty() ? skip : v);
      if (content.empty()) return null;
      
      this.throttleSyncPrm = null; // Cancel any previously pending sync (the full-sync will encompass it)
      return { command: 'sync', v: this.syncTellVersion++, content };
      
    },
    
    // Resource preloading
    addKnownRoomDependencies(deps) { for (let dep of deps) this.knownRoomDependencies.add(dep); },
    addKnownRealDependencies(deps) { for (let dep of deps) this.knownRealDependencies.add(dep); },
    
    /// =ABOVE}
    
    cleanup() {
      
      mmm('hut', -1);
      foundation.subcon('hinterland')({ type: 'exit', hut: this.desc() });
      
      forms.Record.cleanup.call(this);
      
      /// {ABOVE=
      let roadedHuts = this.roadedHuts ?? [];
      for (let [ uid, { hut, roads } ] of roadedHuts) for (let [ server, road ] of roads) road.end();
      this.roadedHuts = Map.stub;
      
      this.pendingSync = Object.freeze({ add: Object.stub, upd: Object.stub, rem: Object.stub });
      if (this.isHere) this.ownedHutRh.end();
      /// =ABOVE}
      
    }
    
  })});
  
};
