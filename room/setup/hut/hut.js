global.rooms['setup.hut'] = async () => {
  
  let { Record } = await getRoom('record');
  
  let Hut = form({ name: 'Hut', has: { Record }, props: (forms, Form) => ({
    
    // Huts connect by Roads to other Huts, have the ability to Tell and
    // Hear to/from other Huts, and can react to what they Hear
    
    $handleCommError: (handlerHut, comm, err) => {
      
      // Errors can occur when processing Comms from other Huts; when
      // this happens we ideally inform the other Hut of the Error, and
      // if this isn't possible we ensure
      
      let msg = { command: 'error', type: 'failed', orig: comm.msg };
      let isExpectedError = err.message?.startsWith?.('Api: ') ?? false;
      msg.detail = isExpectedError ? err.message : 'Logic error';
      
      /// {BELOW=
      isExpectedError = false;
      msg.detail = err.message;
      /// =BELOW}
      
      // If the Error couldn't be communicated back or if the Error was
      // unexpected, we need awareness of it
      if (!isExpectedError) gsc(err.mod( m => ({ message: `${handlerHut.desc()} failed to handle Comm!\n${m}`, comm }) ));
      
      /// {ABOVE=
      // Above should inform Below of the failure so Below can react
      comm.reply?.(err.mod({ e: msg }));
      /// =ABOVE}
      
    },
    $commandHandlerWrapper: async (handlerHut, handlerTmp, comm) => {
      
      try         { await handlerTmp.fn(comm); }
      catch (err) { Form.handleCommError(handlerHut, comm, err); }
      
    },
    
    init({ isHere=false, hid, uid, heartbeatMs, ...recordProps }) {
      
      if (!hid && !uid) throw Error(`Api: supply either "hid" or "uid" (they're synonyms)`);
      if (!hid) hid = uid;
      if (!uid) uid = hid;
      if (uid !== hid) throw Error(`Api: "hid" and "uid" must have same value`);
      
      Object.assign(this, {
        hid,
        isHere, isAfar: !isHere,
        commandHandlers: Object.plain(),
        heartbeatMs
      });
      denumerate(this, 'commandHandlers');
      
      forms.Record.init.call(this, { uid, ...recordProps, volatile: true });
      
    },
    desc() { return `${this.isHere ? 'Here' : 'Afar'}${forms.Record.desc.call(this)}`; },
    
    hear({ src, road, reply, ms=getMs(), msg }) { return src.tell({ trg: this, road, reply, ms, msg }); },
    tell({ trg, road, reply, ms=getMs(), msg }) {
      
      // Causes `this` to tell `trg` a Message
      // Note that `ms` should typically be provided, and should
      // represent the high-precision time at which the tell occurred
      // Note that the action resulting from the Tell is implemented in
      // `actOnComm`
      // Note that `actOnComm` is always called with a `reply` function
      // unless the Comm was Srcless (e.g. self-initiated)
      
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
      
      if (hasForm(msg, Error)) {
        subcon('warning')(`Error reply`, msg);
        msg = { command: 'error', type: 'application', msg: msg.message };
      }
      if (!msg) return;
      
      let src = this;
      /// {DEBUG=
      if (!src && road) throw Error(`Can't provide Road without SrcHut (who is on the other end of that Road??)`);
      if (!src && reply) throw Error(`Can't omit "src" and provide "reply" (who would receive that reply??)`);
      if (src && src.aboveHut !== trg && trg.aboveHut !== src) {
        throw Error(String.baseline(`
          | Supplied unrelated Huts (neither is the other's parent)
          | Src: ${src?.desc?.() ?? null}
          | Trg: ${trg?.desc?.() ?? null}
        `));
      }
      /// =DEBUG}
      
      subcon('road.traffic')(() => ({
        type: 'comm',
        src: src?.desc() ?? null,
        trg: trg.desc(),
        msg: hasForm(msg, Keep) ? msg.desc() : msg
      }));
      
      if (!src && trg.isAfar) throw Error(`Can't tell TrgAfarHut when SrcHut is null`);
      if (!src) return trg.actOnComm({ src: null, road: null, reply: null, ms, msg });
      
      if (src.isAfar && trg.isAfar) throw Error('Supplied two AfarHuts');
      
      // Handle two local Huts communicating; this is trivial as they
      // both exist in the same js context
      if (src.isHere && trg.isHere) {
        
        // TODO: Conceptualize two HereHuts as NEIGHBOURS - they're
        // so close you don't need to take a Road to pass between them
        if (road) throw Error(`Provided two HereHuts but also a Road`);
        if (!reply) reply = msg => trg.tell({ trg: src, road, reply: null, ms, msg });
        return trg.actOnComm({ src, road, reply, ms, msg });
        
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
        return trg.actOnComm({ src, road, reply, ms, msg });
        
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
    actOnComm(comm) { throw Error('Not implemented'); },
    
    getKnownNetAddrs() { throw Error('Not implemented'); },
    getRoadFor(trg) { throw Error('Not implemented'); },
    
    enableAction(command, fn) {
      
      // TODO: Rename to "addAction"
      // Above: adds an arbitrary action to the set of actions that can
      // be remotely invoked on a Hut from Below
      // Below: creates a utility used to request the invocation of an
      // arbitrary function above
      // Between: creates the ability to proxy a request for arbitrary
      // functionality from Below to Above
      // 
      // Note that Below does not "request" Above to enable an Action;
      // the corresponding calls to enableAction Above and Below must
      // be coordinated by the implementor! (Typically Scopes will make
      // this trivial)
      
      throw Error('Not implemented');
      
    },
    makeCommandHandler(command, fn) {
      /// {DEBUG=
      if (this.commandHandlers[command]) throw Error(`Pre-existing command handler for "${command}"`);
      /// =DEBUG}
      let tmp = Tmp({
        desc: () => `CommandSrc(${this.desc()} -> "${command}")`,
        cleanup: () => delete this.commandHandlers[command],
        fn
      });
      this.commandHandlers[command] = Form.commandHandlerWrapper.bound(this, tmp);
      return tmp;
    },
    doCommand(comm, { critical=true }={}) {
      
      /// {DEBUG=
      if (!isForm(comm?.msg?.command, String)) throw Error(`${this.desc()} given Comm without "command"`).mod({ comm });
      /// =DEBUG}
      
      // Try to process the command
      let ch = this.commandHandlers[comm.msg.command];
      if (ch) { ch(comm); return true; } // That is fire-and-forget - I guess we tolerate that??
      
      // If this is "non-critical" simply return `false`, indicating we
      // couldn't fulfill the command (note a commom non-critical case
      // is when a BelowHut tries to execute a command itself; this case
      // is non-critical because even if it can't process the command it
      // can still ask its AboveHut to process the command)
      if (!critical) return false;
      
      // Failed to run critical command; reply with Error if possible...
      Form.handleCommError(this, comm, Error(`Api: invalid command: "${comm.msg.command}"`));
      
    }
    
  })});
  let AboveHut = form({ name: 'AboveHut', has: { Hut }, props: (forms, Form) => ({
    
    // A Hut that directly manages a Record structure and manages making
    // projections of that structure available to BelowHuts
    // 
    // Note that there is no `AboveHut.prototype.enableAction` - this
    // would imply a method for BelowHuts to add arbitrary functionality
    // to their AboveHut (which would be globally accessible for any
    // BelowHut)
    
    init({ recMan, deployConf=null, ...args }) {
      
      /// {DEBUG=
      if (!recMan) recMan = args?.type?.manager;
      if (!recMan) throw Error('Api: "recMan" must be provided');
      /// =DEBUG}
      
      forms.Hut.init.call(this, {
        type: recMan.getType('hut.above'),
        group: recMan.getGroup([]),
        value: { ms: getMs() },
        ...args
      });
      
      /// {ABOVE=
      let ownedHutRh = this.relHandler('hut.owned/above'); // Get 'hut.owned' Recs where `this` is the Par
      let bankedPrm = this.bankedPrm.then(() => ownedHutRh.ready());
      /// =ABOVE}
      
      Object.assign(this, {
        
        deployConf,
        belowHuts: Map(/* belowHutHid => BelowHut(...) */),
        
        /// {ABOVE=
        childUidCnt: 0,
        ownedHutRh,
        bankedPrm,
        preloadRooms: Set(),
        enabledKeeps: Map(),
        belowConf: null,
        /// =ABOVE}
        
        allFollows: Object.plain(/* uid -> { hutId -> FollowTmp } */)
        
      });
      denumerate(this, 'allFollows');
      
      /// {ABOVE=
      
      let subconConf = conf => {
        let { kids={}, output } = conf;
        return { output, kids: kids.map(subconConf) };
      };
      this.belowConf = {
        
        // TODO: Subcon values for Below??
        // TODO: Maybe `global.getBelowConf` is a better place for this
        // logic than `AboveHut.prototype`?
        
        aboveHid: this.hid,
        
        global: {
          subcon: conf('global.subcon'),
          bearing: 'below',
          maturity: conf('global.maturity'),
          //features: conf('global.features'),
        },
        
        deploy: {
          uid: this.deployConf.uid,
          host: {
            netIden: this.deployConf.host.netIden.slice([ 'secureBits' ]),
            netAddr: this.deployConf.host.netAddr,
            heartbeatMs: this.deployConf.host.heartbeatMs,
            protocols: this.deployConf.host.protocols
          },
          loft: this.deployConf.loft
        }
        
      };
      
      denumerate(this, 'ownedHutRh');
      denumerate(this, 'preloadRooms');
      denumerate(this, 'enabledKeeps');
      denumerate(this, 'belowConf');
      
      /// =ABOVE}
      
      this.endWith(recMan.addRecordSearch(uid => {
        
        // If any BelowHut is following `uid` we'll be able to reference
        // it directly, because the Record's uid gets set directly on
        // `this.allFollows`; all children of `this.allFollows[uid]` are
        // Follows on the same Record (but by different BelowHuts), so
        // we just pick the first one and return its "rec" property
        let hutFollows = this.allFollows[uid];
        if (hutFollows) for (let hid in hutFollows) return hutFollows[hid].rec;
        
        for (let rec of this.iterateAll()) if (rec.uid === uid) return rec;
        return null;
        
      }));
      
      /// {ABOVE=
      this.makeCommandHandler('asset', async ({ src, msg: { dive: diveToken }, reply }) => {
        
        // Expects `chain` to begin with an "Enabled Keep"
        
        let dive = token.dive(diveToken);
        
        let [ term, ...innerDive ] = dive;
        let keep = this.enabledKeeps.get(term)?.seek(innerDive) ?? null;
        if (!await keep?.exists()) throw Error(`Api: invalid asset chain`).mod({ dive: diveToken });
        
        reply(keep);
        
      });
      /// =ABOVE}
      
    },
    getRoadFor(trg) { return trg.getRoadFor(this); },
    makeBelowUid() {
      return [ this.childUidCnt++, Math.floor(Math.random() * 62 ** 8) /* TODO: Use a stock random instance? */ ]
        .map(v => v.encodeStr(String.base62, 8))
        .join('');
    },
    makeBelowHut(hid) {
      
      /// {DEBUG=
      if (!hid) throw Error(`Api: must supply "hid" (maybe use ${getFormName(this)}(...).makeBelowUid()?)`);
      if (this.belowHuts.has(hid)) throw Error(`Api: duplicate "hid"`).mod({ hid });
      /// =DEBUG}
      
      let { manager } = this.type;
      let type = manager.getType('hut.below');
      let group = manager.getGroup([]);
      let bh = BelowHut({
        aboveHut: this, isHere: !this.isHere,
        type, group, hid,
        heartbeatMs: this.heartbeatMs
      });
      
      this.belowHuts.add(hid, bh);
      bh.endWith(() => this.belowHuts.rem(hid));
      
      return bh;
      
    },
    actOnComm(comm) { comm.src.actOnComm(comm); }, // All Comms come from Below, so always delegate to BelowHut
    
    /// {ABOVE=
    getBelowConf() {
      
      // TODO: it may be very elegant to simply provide an AboveHut with
      // the conf used to initialize it! Right now conf is *global*, so
      // every AboveHut in the same nodejs process can be pointed to the
      // same conf data! Then for the following, we parse the AboveHut
      // instance's conf (shouldn't ever call `global.conf` here)
      
      return this.belowConf;
      
    },
    addPreloadRooms(deps) { for (let dep of deps) this.preloadRooms.add(dep); },
    enableKeep(term, keep) {
      
      // Adds a Keep to `this.enabledKeeps`; this makes it available as
      // AboveHuts expose such Keeps via a CommandHandler named "asset"
      
      if (isForm(keep, String)) keep = global.keep(keep);
      
      /// {DEBUG= // TODO: Nested markers!
      if (!hasForm(keep, Keep)) throw Error(`Api: "keep" must resolve to Keep; got ${getFormName(keep)}`);
      if (!isForm(term, String)) throw Error(`Api: "term" must be String; got ${getFormName(term)}`);
      /// =DEBUG}
      
      if (this.enabledKeeps.has(term)) throw Error(`Api: already enabled Keep termed "${term}"`);
      this.enabledKeeps.add(term, keep);
      return Tmp(() => this.enabledKeeps.rem(term));
      
    }
    /// =ABOVE}
    
  })});
  let BelowHut = form({ name: 'BelowHut', has: { Hut }, props: (forms, Form) => ({
    
    init({ aboveHut, ...args }) {
      
      if (!aboveHut) throw Error(`Api: must supply "aboveHut"`);
      
      forms.Hut.init.call(this, args);
      
      /// {BELOW=
      // Speed up BelowHut heartbeat to ensure it's on time
      if (this.isHere) this.heartbeatMs = Math.min(this.heartbeatMs * 0.95, this.heartbeatMs - 2500);
      /// =BELOW}
      
      Object.assign(this, {
        
        aboveHut,
        heartbeatTimeout: null,
        
        /// {ABOVE=
        syncTellVersion: 0,
        pendingSync: { add: {}, upd: {}, rem: {} },
        throttleSyncPrm: null, // A Promise resolving when a queued sync request is sent
        followedRecs: Set(/* Record */),
        /// =ABOVE} {=BELOW
        syncHearVersion: 0,
        bufferedSyncs: Map(),
        /// =BELOW} {LOADTEST=
        loadtestActions: Set(),
        /// =LOADTEST}
        
        roads: Map(/* Server(...) => Road/Session(...) */)
      });
      
      for (let p of 'roads,aboveHut,heartbeatTimeout'.split(',')) denumerate(this, p);
      /// {ABOVE=
      for (let p of 'syncTellVersion,pendingSync,throttleSyncPrm,followedRecs'.split(',')) denumerate(this, p);
      /// =ABOVE} {BELOW=
      for (let p of 'syncHearVersion,bufferedSyncs'.split(',')) denumerate(this, p);
      /// =BELOW}
      
      this.resetHeartbeatTimeout();
      
      this.makeCommandHandler('lubdub', comm => { /* Ignore */ });
      this.makeCommandHandler('error', comm => gsc(`${this.desc()} was informed of Error`, comm.msg));
      this.makeCommandHandler('multi', ({ src, msg: { list=null }, reply }) => {
        
        if (!isForm(list, Array)) throw Error(`Api: invalid multi list`);
        
        let replies = [];
        let multiReply = msg => replies.push(msg);
        for (let msg of list) this.actOnComm({ src, reply: multiReply, msg });
        
        // TODO: Or generate a multipart response??? That's cool too...
        if (multiReply.length) {
          gsc('OOAAahhahahwwhwwaaa');
          reply({ command: 'multi', list: replies });
        }
        
      });
      
      /// {BELOW=
      this.makeCommandHandler('sync', ({ src, msg, reply }) => {
        
        let err = Error('');
        try {
          
          let { v: version, content } = msg;
          if (!isForm(version, Number)) throw Error('Invalid "version"');
          if (!version.isInteger()) throw Error('Invalid "version"');
          if (!isForm(content, Object)) throw Error('Invalid "content"');
          if (version < this.syncHearVersion) throw Error(`Duplicated sync (version: ${version}; current version: ${this.syncHearVersion})`);
          
          // Add this newly arrived sync to the buffer
          this.bufferedSyncs.add(version, content); mmm('bufferSync', +1);
          
          // Now perform as many pending syncs as possible; these must
          // be sequential, and beginning with the very next expected
          // sync (numbered `this.syncHearVersion`)
          let recMan = this.type.manager;
          let bank = recMan.bank;
          while (this.bufferedSyncs.has(this.syncHearVersion)) {
            let sync = this.bufferedSyncs.get(this.syncHearVersion);
            this.bufferedSyncs.rem(this.syncHearVersion); mmm('bufferSync', -1);
            this.syncHearVersion++;
            bank.syncSer(recMan, sync);
          }
          
          if (this.bufferedSyncs.size > 50) throw Error('Too many pending syncs');
          
        } catch (cause) {
          
          throw err.mod({ msg: 'Error syncing - did the AboveHut restart unexpectedly?', cause });
          
        }
        
      });
      /// =BELOW}
      
    },
        
    seenOnRoad(server, road) {
      
      if (!server) throw Error(`Api: must supply "server"`);
      if (!road) throw Error(`Api: must supply "road"`);
      
      if (!this.roads.has(server)) {
        
        // Add the Road; if all Roads end the Hut ends too
        this.roads.add(server, road);
        road.endWith(() => {
          this.roads.rem(server);
          if (this.roads.empty()) this.end();
        });
        
        /// {ABOVE=
        // If this is the 1st Road for this BelowHut init a "hut.owned"
        // relationship BelowHut and AboveHut; note this relationship is
        // only initiated ABOVE, as BELOW the relationship is synced
        // from ABOVE
        if (this.roads.size === 1) this.aboveHut.type.manager.addRecord({
          type: 'hut.owned',
          group: { above: this.aboveHut, below: this },
          uid: `!owned@${this.aboveHut.hid}@${this.hid}`
        });
        /// =ABOVE}
        
      }
      if (this.roads.get(server) !== road) throw Error(`Api: duplicate road for "${server.desc()}"`);
      
    },
    getRoadFor(trg) {
      
      /// {DEBUG=
      if (trg !== this.aboveHut) throw Error(`Can't tell ${trg.desc()} - can only tell ${this.aboveHut.desc()}!`);
      /// =DEBUG}
      
      let bestCost = Infinity;
      let bestRoad = null;
      for (let road of this.roads.values()) {
        let cost = road.currentCost();
        if (cost < bestCost) [ bestCost, bestRoad ] = [ cost, road ];
      }
      return bestRoad;
      
    },
    getKnownNetAddrs() {
      return Set(this.roads.toArr(road => road.netAddr)).toArr(Function.stub);
    },
    actOnComm(comm) {
      
      /// {DEBUG=
      //if (comm?.src !== this) throw Error(`${this.desc()} was told to act on Comm intended for ${comm.src?.desc?.() ?? '<unknown>'}`).mod({ comm });
      /// =DEBUG}
      
      // Try to do Command for BelowHut
      if (this.doCommand(comm, { critical: false })) return;
      
      // If BelowHut couldn't do it, do critical attempt with AboveHut
      this.aboveHut.doCommand(comm, { critical: true });
      
    },
    enableAction(command, fn) {
      
      // Note `enableAction` is more specific than `makeCommandHandler`:
      // - Function provided to `makeCommandHandler` is responsible for
      //   invoking communication with some other Hut via `comm.reply`
      //   or `comm.src.tell({ ... })`, while Function provided to
      //   `enableAction` can't directly communicate with the initiator;
      //   the return value is ignored, and no `src` (for `src.tell`) or
      //   `reply` are available
      
      let tmp = Tmp({ desc: () => `Action(${this.desc()}: "${command}")`, act: null });
      
      /// {LOADTEST=
      tmp.command = command;
      this.loadtestActions.add(tmp);
      tmp.endWith(() => this.loadtestActions.rem(tmp));
      /// =LOADTEST}
      
      /// {BELOW=
      
      tmp.act = (msg={}) => {
        /// {DEBUG=
        if (msg.has('command')) throw Error('Reserved property "command" was supplied');
        /// =DEBUG}
        this.tell({ trg: this.aboveHut, msg: { ...msg, command } });
      };
      tmp.endWith(() => tmp.act = () => Error(`Action "${command}" unavailable`).propagate());
      
      /// =BELOW} {ABOVE=
      
      // The CommandHandler ends if `tmp` ends (if action is disabled)
      tmp.endWith(this.makeCommandHandler(command, async ({ msg, reply, ms, src, trg }) => {
        
        if (tmp.off()) throw Error(`${tmp.desc()} has been ended`);
        
        // `result` is either response data or resulting Error
        try         { await fn(msg, { ms, src, trg }); }
        catch (err) { return reply(err); }
        
      }));
      tmp.act = msg => this.tell({ trg: this.aboveHut, msg: { ...msg, command } });
      
      /// =ABOVE}
      
      return tmp;
      
    },
    
    /// {ABOVE=
    
    toSync(type, rec, delta=null) {
      
      // Use this function to accrue changes to the current Record delta
      // of a specific Hut; calling this function schedules a sync to
      // occur if none is already scheduled
      
      /// {ASSERT=
      if (!this.pendingSync.has(type)) throw Error(`Invalid type: ${type}`);
      /// =ASSERT}
      
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
      if (this.off() || this.throttleSyncPrm) return;
      
      let err = Error('trace');
      let prm = this.throttleSyncPrm = soon(() => {
        
        // Can cancel scheduled sync by setting `this.throttleSyncPrm`
        // to any other value
        if (this.throttleSyncPrm !== prm) return;
        this.throttleSyncPrm = null;
        
        // Hut may have ended between scheduling and executing sync
        if (this.off()) return;
        
        let updateTell = this.consumePendingSync({ fromScratch: false });
        if (updateTell) this.aboveHut.tell({ trg: this, msg: updateTell });
        
      });
      
    },
    followRec(rec) {
      
      /* ### Following and Syncing ###
      
      Note that the HereHut always exists without needing to be synced;
      this is true both Above and Below; the HereHut is instantiated by
      the Foundation (of course Below the code to instantiate the
      Foundation is technically synced, but this is outside of Record
      syncing behaviour). Note that BELOW the HereHut is a BelowHut, and
      initiating it will require an "aboveHut" param - this means BELOW
      will first of all manually create an AboveHut (mirroring ABOVE).
      
      So a HereHut always exists. Note that the HereAboveHut will have a
      fixed uid ("!hereHut"), while HereBelowHut will typically be id'd
      with a uid randomly generated by Above (unless the HereBelowHut is
      spoofed, in which case it gets to pick its own hid!)
      
      Note that BELOW, the AfarAboveHut anchors the Record tree, and the
      HereBelowHut is simply woven into that tree (at no time does a
      BelowHut ever act as the root of a Record tree)
      
      */
      
      if (rec.off()) return Tmp.stub;             // Ignore any ended Recs
      
      let { allFollows } = this.aboveHut;
      let { uid: hutUid } = this;
      
      // TODO: The following may be able to be simplified considering
      // that if any of the iterated Records end, `rec` will end too
      // (because a Member of its Group will end, with a cascading
      // effect) - this means we don't need to worry about partial
      // cleanup of the follow if an iterated Rec is Ended - the only
      // case is that the whole thing gets cleaned up at once!
      let followTmps = [ ...rec.iterateDepthFirst() ].map(rec => {
        
        if (rec === this) return skip;          // Don't follow ourself
        if (rec === this.aboveHut) return skip; // Don't follow our AboveHut
        
        // Ref a pre-existing Follow again; Note Records can be followed
        // via multiple independent Scope chains - just because a single
        // Scope chain ends and `end` is called on its Follow doesn't
        // mean the BelowHut has entirely unfollowed the Record!
        let preexistingFollowTmp = allFollows[rec.uid]?.[hutUid]; // This says "the Follow of `rec` by a Hut, id'd with `hutUid`"
        if (preexistingFollowTmp) return preexistingFollowTmp.hold();
        
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
      if (followTmps.empty()) return Tmp.stub;
      
      let tmp = Tmp({ desc: () => `FollowTree(${rec.desc()})` });
      tmp.endWith(() => { for (let tmp of followTmps) tmp.end(); });
      rec.endWith(tmp, 'tmp');
      this.endWith(tmp, 'tmp');
      return tmp;
      
    },
    consumePendingSync({ fromScratch=false }={}) {
      
      // Cancel any previously pending sync (this full sync encompasses it)
      this.throttleSyncPrm = null;
      
      if (fromScratch) {
        
        /// {DEBUG=
        subcon('hut.below.sync')(`${this.desc()} is syncing from scratch`);
        /// =DEBUG}
        
        // Reset version and clear the current sync-delta, refreshing it
        // to indicate an "add" for every followed Record - essentially
        // this is "sync-from-scratch" behaviour!
        this.syncTellVersion = 0;
        this.pendingSync = { add: {}, upd: {}, rem: {} };
        let add = this.followedRecs.toObj(rec => [ rec.uid, rec ]);
        for (let rec of this.followedRecs) add[rec.uid] = rec;
        for (let rec of this.followedRecs) this.toSync('add', rec);
        //let { add } = toSync = { add: {}, upd: {}, rem: {} };
        //for (let rec of this.followedRecs) add[rec.uid] = rec;
        
      }
      
      // Creates sync for the BelowHut and modifies its representation
      // to be considered fully up-to-date
      let add = this.pendingSync.add.toArr(rec => {
        
        return {
          type: rec.type.name,
          uid: rec.uid,
          val: rec.getValue(),
          mems: rec.group.terms.toObj(term => {
            
            if (!rec.group.mems.has(term)) return [ term, null ];
            let mem = rec.group.mems[term];
            
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
      let upd = this.pendingSync.upd.toArr((val, uid) => ({ uid, val }));
      let rem = this.pendingSync.rem.toArr(r => r.uid);
      this.pendingSync = { add: {}, upd: {}, rem: {} };
      
      let content = { add, upd, rem }.map(v => v.empty() ? skip : v);
      if (content.empty()) return null;
      
      return { command: 'sync', v: this.syncTellVersion++, content };
      
    },
    strike() {
      gsc(`${this.desc()} got strike`);
    },
    
    /// =ABOVE}
    
    getKeep(diveToken) {
      
      let dive = token.dive(diveToken);
      /// {BELOW=
      return global.keep(dive);
      /// =BELOW} {ABOVE=
      return this.aboveHut.enabledKeeps.get(dive[0]).seek(dive.slice(1));
      /// =ABOVE}
      
    },
    
    tell({ trg, ...args }) {
      
      /// {DEBUG=
      if (trg !== this.aboveHut) throw Error(`Can't tell ${trg.desc()} - can only tell ${this.aboveHut.desc()}!`);
      /// =DEBUG}
      
      this.resetHeartbeatTimeout();
      return forms.Hut.tell.call(this, { trg, ...args });
      
    },
    resetHeartbeatTimeout() {
      
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = setTimeout(() => {
        
        // Combining compilation markers with isHere/isAfar confuses me;
        // the advantage is that Belows won't see the logic that causes
        // Above to terminate dead BelowHuts. But should we remove the
        // logic for sending heartbeats from Above? Need to consider:
        // {BEL/OW= =BEL/OW} GETS COMPILED IN, BUT `!!this.isAfar`
        // - This means in a Below environment (e.g. browser) we have
        //   representations of remote Huts (interesting, may never even
        //   happen ever???)
        // {ABO/VE= =ABO/VE} GETS COMPILED OUT, BUT `!!this.isHere`
        // - This means in an Above environment (e.g. nodejs) there are
        //   BelowHuts representing local actors (end-to-end testing?)
        
        /// {BELOW=
        // HereBelowHuts send heartbeats to be kept alive by Above
        if (this.isHere) this.tell({ trg: this.aboveHut, msg: { command: 'lubdub' } });
        /// =BELOW}
        
        /// {ABOVE=
        // AfarBelowHuts haven't kept up their heartbeats; end them!
        if (this.isAfar) this.end();
        /// =ABOVE}
        
      }, this.heartbeatMs);
      
    },
    
    cleanup() {
      
      forms.Hut.cleanup.call(this); // Applies Record.prototype.cleanup
      
      clearTimeout(this.heartbeatTimeout);
      let roads = [ ...this.roads.values() ];
      this.roads = Map.stub;
      for (let r of roads) r.end();
      
    }
    
  })});
  return { Hut, AboveHut, BelowHut };
  
};
