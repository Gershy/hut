/// <reference path="./../../../ts/hut.d.ts"/>

global.rooms['setup.hut'] = async () => {
  
  let { Record } = await getRoom('record');
  
  /** @type HutRoom_setup_hut.Hut */
  let Hut = form({ name: 'Hut', has: { Record }, props: (forms, Form) => ({
    
    // Huts connect by Roads to other Huts, have the ability to Tell and Hear to/from other Huts,
    // and can react to what they Hear
    
    $sendComm: ({ src, trg, road, reply, ms=getMs(), msg }) => {
      
      // Causes `src` to tell `trg` a Message
      // Note that `ms` should typically be provided, and should represent the high-precision time
      // at which the tell occurred; note that the action resulting from the Tell is implemented in
      // `processCommand`; note that `processCommand` is always called with a `reply` function
      // unless the Comm was Srcless (e.g. self-initiated)
      
      // How communication happens
      // | SrcHut  | TrgHut  | Road
      // |---------|---------|-----------------
      // | Here    | Here    | Not needed - they share a process
      // | Here    | Afar    | **Default to cheapest Road available**
      // | Afar    | Here    | REQUIRED - Afar must have used Road
      // | Afar    | Afar    | N/A - we cannot direct two AfarHuts!
      // | None    | Here    | Road must not be provided
      // | None    | Afar    | N/A - Error!
      // | Any     | None    | N/A - Error!
      
      // Note that "unrelated" Huts are two Huts such that neither is the other's descendant
      // Note that "disjoint" Huts are non-neighbours (and require a Road to communicate)
      
      if (!msg) return;
      
      /// {DEBUG=
      if (!src && road) throw Error(`Api: can't provide Road without SrcHut (who is on the other end of that Road??)`);
      if (!src && reply) throw Error(`Api: can't omit "src" and provide "reply" (who would receive that reply??)`);
      if (src?.aboveHut !== trg && trg?.aboveHut !== src)
        throw Error(String.baseline(`
          | Api: Supplied unrelated Huts (neither is the other's parent)
          | Src: ${src?.desc?.() ?? null}
          | Trg: ${trg?.desc?.() ?? null}
        `));
      /// =DEBUG}
      
      let { command } = msg;
      if (!command) src.sc.kid('comm')({ src, trg, note: 'missing "command"', msg });
      else          src.sc.kid('comm')({ src, trg, command, msg });
      
      if (!src && trg.isAfar) throw Error(`Can't tell TrgAfarHut when SrcHut is null`);
      if (!src) return trg.processCommand({ src: null, road: null, reply: null, ms, msg });
      
      if (src.isAfar && trg.isAfar) throw Error('Supplied two AfarHuts');
      
      // Handle two local Huts communicating; this is trivial as they
      // both exist in the same js context
      if (src.isHere && trg.isHere) {
        
        // TODO: Conceptualize two HereHuts as NEIGHBOURS - they're
        // so close you don't need to take a Road to pass between them
        if (road) throw Error(`Provided two HereHuts but also a Road`);
        if (!reply) reply = msg => trg.tell({ trg: src, road, reply: null, ms, msg });
        return trg.processCommand({ src, road, reply, ms, msg });
        
      }
      
      // Handle a remote/afar Hut Telling a local/here Hut; note this
      // entails that the Tell from the AfarHut is already available
      // locally, and referenced by `msg`
      if (src.isAfar && trg.isHere) {
        
        if (!road) {
          road = src.getBestRoadFor(trg);
          if (!road) throw Error(`Supplied AfarSrcHut but omitted Road, and no Road could be automatically selected`);
        }
        
        if (!reply) reply = msg => trg.tell({ trg: src, road, reply: null, ms, msg });
        return trg.processCommand({ src, road, reply, ms, msg });
        
      }
      
      // Handle a local/here Hut Telling a remote/afar Hut - this is the
      // trickiest option because the Tell has to be shipped Afar; this
      // means a Road is absolutely required (and if none has been
      // explicitly provided we will select the available Road with the
      // lowest cost)
      if (src.isHere && trg.isAfar) {
        
        if (reply) throw Error(`Can't provide "reply" for HereHut -> AfarHut`);
        
        // Find the cheapest available Road if none provided
        if (!road) road = src.getBestRoadFor(trg) ?? Error(`Couldn't determine a Road`).propagate();
        
        // Send the Tell using the Road
        return road.tellAfar(msg);
        
      }
      
      throw Error(`Couldn't communicate between Huts`);
      
    },
    
    init({ isHere=false, hid, uid, heartbeatMs, sc=subcon('hut'), ...recordProps }) {
      
      /// {DEBUG=
      if (!hid && !uid) throw Error(`Api: supply either "hid" or "uid" (they're synonyms)`);
      if (!isForm(heartbeatMs, Number)) throw Error('Api: "heartbeatMs" must be Number');
      /// =DEBUG}
      
      if (!hid) hid = uid;
      if (!uid) uid = hid;
      
      /// {DEBUG=
      if (uid !== hid) throw Error(`Api: "hid" and "uid" must have same value`);
      if (!isForm(uid, String)) throw Error('Api: "uid" must be String').mod({ uid });
      if (!isForm(hid, String)) throw Error('Api: "hid" must be String').mod({ hid });
      /// =DEBUG}
      
      Object.assign(this, {
        hid,
        isHere, isAfar: !isHere,
        commandHandlers: Map(/* commandString -> Tmp({ desc, fn }) */),
        heartbeatMs,
        sc
      });
      
      denumerate(this, 'commandHandlers');
      
      forms.Record.init.call(this, { uid, ...recordProps, volatile: true });
      
      // TODO: "bp" is taking on new meaning - really it's just a "dummy" Comm - in the context of
      // http, "dummy" can conveniently be used to denote "bank poll"
      this.makeCommandHandler('hut:bp', comm => { /* do nothing */ });
      
    },
    desc() { return `${this.isHere ? 'Here' : 'Afar'}${forms.Record.desc.call(this)}`; },
    
    hear({ src, road, reply, ms=getMs(), msg }) { return Form.sendComm({ src, trg: this, road, reply, ms, msg }); },
    tell({ trg, road, reply, ms=getMs(), msg }) { return Form.sendComm({ src: this, trg, road, reply, ms, msg }); },
    
    getKnownNetAddrs() { throw Error('Not implemented'); },
    getBestRoadFor(trg) { throw Error('Not implemented'); },
    getDefaultLoftPrefix() {
      // Note that any `Hut(...).type.getPrefix()` will be "hut", which is totally unrelated to the
      // Loft that Hut is attached to - this method returns the prefix of the relevant Loft!
      throw Error('Not implemented');
    },
    
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
      if (!fn) throw Error('Api: must provide "fn"');
      if (this.commandHandlers.has(command)) throw Error(`Api: pre-existing command handler for "${command}"`);
      /// =DEBUG}
      
      let tmp = Tmp({ desc: () => `CommandSrc(${this.desc()} -> "${command}")`, fn });
      this.commandHandlers.set(command, tmp);
      tmp.endWith(() => this.commandHandlers.rem(command));
      return tmp;
    },
    runCommandHandler(comm) {
      
      // Tries to use an available handler to process `comm` - if no handler is available or `comm`
      // produces errors, attempts to address the error appropriately (e.g. reply with info about
      // the error, log the error to sc); note a Promise may be returned (if the handler is async)
      
      /// {DEBUG=
      if (!isForm(comm?.msg?.command, String)) throw Error(`Api: given Comm without "command"`).mod({ hut: this.desc(), comm });
      /// =DEBUG}
      
      let run = () => {
        let ch = this.commandHandlers.get(comm.msg.command);
        if (!ch) throw Error(`Api: invalid command`).mod({ hut: this.desc(), command: comm.msg.command, comm });
        return ch.fn(comm);
      };
      
      return safe(run, err => {
        
        // Errors can occur when processing Comms from other Huts; when this happens we ideally
        // inform the other Hut of the Error, and if this isn't possible we send the Error to subcon
        global.subcon('error')('run-command-handler-failure', err);
        
        /// {ABOVE=
        // Above should inform Below of the Error
        comm.reply?.({ command: 'error', msg: {
          detail: err.message.startsWith('Api: ') ? err.message : 'Api: sorry - experiencing issues',
          echo: comm.msg
        }});
        /// =ABOVE}
        
      });
      
    },
    processCommand(comm) {
      
      // Similar to runCommandHandler, but allows a Hut to delegate to some other Hut - overall,
      // some `Hut(...).runCommandHandler` (but not necessarily `this.runCommandHandler`) should
      // wind up getting called
      
      throw Error('Not implemented');
      
    }
    
  })});
  
  /** @type HutRoom_setup_hut.AboveHut */
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
      denumerate(this, 'deployConf');
      denumerate(this, 'belowHuts');
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
          loft: {
            prefix: this.deployConf.loft.prefix,
            name: this.deployConf.loft.name
          }
        }
        
      };
      
      denumerate(this, 'ownedHutRh');
      denumerate(this, 'preloadRooms');
      denumerate(this, 'enabledKeeps');
      denumerate(this, 'belowConf');
      
      /// =ABOVE}
      
      this.endWith(recMan.addRecordSearch(uid => {
        
        // If any BelowHut is following `uid` we'll be able to reference it directly, because the
        // Record's uid gets set directly on `this.allFollows`; children of `this.allFollows[uid]`
        // are Follows on the same Record (but by different BelowHuts), so we just pick the first
        // one and return its "rec" property
        let hutFollows = this.allFollows[uid];
        if (hutFollows) for (let hid in hutFollows) return hutFollows[hid].rec;
        
        for (let rec of this.iterateAll()) if (rec.uid === uid) return rec;
        return null;
        
      }));
      
      /// {ABOVE=
      this.makeCommandHandler('hut:asset', async ({ src, msg: { dive: diveToken }, reply }) => {
        
        // First component of `dive` must be the namespace
        // Second component must be the "enabled Keep term" (same term provided to `enableKeep`)
        // The rest of the components initiate a dive from that enable Keep
        
        let dive = token.dive(diveToken);
        
        // Handle namespaced assets by treating the first component as the prefix
        let [ pfx, term, ...innerDive ] = dive;
        
        let keep = this.enabledKeeps.get(`${pfx}:${term}`)?.dive(innerDive) ?? null;
        if (!await keep?.exists()) throw Error(`Api: invalid asset chain`).mod({ dive: diveToken });
        
        reply(keep);
        
      });
      /// =ABOVE}
      
    },
    getDefaultLoftPrefix() { return this.deployConf.loft.prefix; },
    getBelowHutAndRoad({ roadAuth, trn, hid=null, params }) {
      
      // Returns a BelowHut with a Road for the given Authority
      // Even if an invalid `hid` is provided with non-dev maturity, a
      // BelowHut is still returned whose `hid` is randomly generated;
      // note that if `hid === "anon"`, a spoofed "anonymous" BelowHut
      // is returned
      
      // TODO: Really, the BelowHut should be passed the RoadAuth - this indicates that a BelowHut
      // always exists in the presence of at least one Road! The BelowHut is never exposed to any
      // consuming code without a Road set on `BelowHut(...).roads`, but it does exist for some
      // number of event-loop ticks, within the logic in this file, before having its Road set!
      // This was exposed by a bug where `heartbeatMs` was not being set, the `setTimeout` was
      // firing after 0ms, and a "no Road available" bug appeared
      
      /// {ABOVE=
      if (trn === 'anon') {
        
        let belowNetAddr = params.at('belowNetAddr') ?? '???:???:???:???';
        let anonRoad = {
          belowNetAddr,
          tellAfar: msg => { throw Error('OWwwowoaowoasss'); },
          desc: () => `AnonRoad(${roadAuth.desc()} <-> ${belowNetAddr} / !anon)`
        };
        let anonBelowHut = {
          aboveHut: this,
          hid: '!anon', isHere: false, isAfar: true,
          desc: () => `AnonHut(${belowNetAddr})`, // TODO: Include NetworkAddress in desc (from roadAuth)
          roads: Map([ [ roadAuth,  anonRoad ] ]),
          consumePendingSync: () => Error('Api: invalid anon operation').propagate(),
          sc: this.sc.kid('anonBelow'),
          
          // AnonBelowHuts can only trigger AboveHut handlers
          runCommandHandler: comm => this.runCommandHandler(comm),
          processCommand: comm => this.runCommandHandler(comm)
        };
        denumerate(anonBelowHut, 'roads');
        
        return { belowHut: anonBelowHut, road: anonRoad };
        
      }
      /// =ABOVE}
      
      // Get a BelowHut reference; consider any provided `hid`, whether the `hid` has already been
      // seen, and the deployment maturity
      let belowHut = (() => {
        
        // TODO: Is the hid-refresh redirect necessary? What if the hid for the initial html
        // request is simply ignored??
        
        if (this.belowHuts.has(hid)) return this.belowHuts.get(hid);
        
        /// {ABOVE=
        // Reject an explicit `hid` outside "dev" maturity - note that
        // BELOW, the BelowHut represents the local environment and will
        // always have its hid specified!
        if (hid && global.conf('global.maturity') !== 'dev') hid = null;
        
        // Supply a default hid if the client didn't supply one
        // Note we avoid `String.id` as its space is smaller and this is a security-related value
        // TODO: Use a random instance?
        if (!hid) hid = [ this.childUidCnt++, Math.floor(Math.random() * 62 ** 8) ]
          .map(v => v.encodeStr(String.base62, 8))
          .join('');
        /// =ABOVE}
        
        /// {ASSERT=
        if (!hid) throw Error('Api: must be able to resolve a BelowHut hid BELOW');
        /// =ASSERT}
        
        // Actually initialize the BelowHut
        let { manager } = this.type;
        let group = manager.getGroup([]);
        let bh = BelowHut({
          aboveHut: this,
          isHere: !this.isHere,
          type: manager.getType('hut.below'),
          hid,
          group,
          heartbeatMs: this.heartbeatMs,
          sc: this.sc.kid('below') // TODO: Fix `sc` style
        });
        manager.addRecord({
          type: 'hut.owned',
          uid: `owned(${bh.uid})`,
          group: { above: this, below: bh },
          value: { ms: getMs() }
        });
        
        this.belowHuts.add(hid, bh);
        bh.endWith(() => this.belowHuts.rem(hid));
        
        return bh;
        
      })();
      
      // Initialize a Road if necessary
      let road = belowHut.roads.get(roadAuth) ?? onto(roadAuth.makeRoad(belowHut, params), road => {
        
        belowHut.roads.set(roadAuth, road);
        road.endWith(() => {
          belowHut.roads.rem(roadAuth);
          if (belowHut.roads.empty()) belowHut.end();
        });
        
      });
      
      return { belowHut, road };
      
    },
    
    processCommand(comm) { return comm.src.processCommand(comm); }, // All Comms come from Below, so always delegate to BelowHut
    getBestRoadFor(trg) {
      /// {DEBUG=
      if (!isForm(trg, BelowHut)) throw Error(`Api: trg is not a BelowHut`).mod({ trg });
      if (trg.aboveHut !== this) throw Error('Api: provided BelowHut is not a KidHut');
      /// =DEBUG}
      return trg.getBestRoadFor(this);
    },
    
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
    enableKeep(prefix, term, keep) {
      
      // Adds a Keep to `this.enabledKeeps` - exposes it via a CommandHandler named "asset"
      
      let pfxTerm = `${prefix}:${term}`;
      
      if (isForm(keep, String)) keep = global.keep(keep);
      
      /// {DEBUG= // TODO: Nested markers!
      if (!hasForm(keep, Keep)) throw Error(`Api: "keep" must resolve to Keep; got ${getFormName(keep)}`);
      if (!isForm(term, String)) throw Error(`Api: "term" must be String; got ${getFormName(term)}`);
      /// =DEBUG}
      
      if (this.enabledKeeps.has(pfxTerm)) throw Error(`Api: already enabled Keep termed "${pfxTerm}"`);
      this.enabledKeeps.add(pfxTerm, keep);
      return Tmp(() => this.enabledKeeps.rem(pfxTerm));
      
    },
    /// =ABOVE}
    
    cleanup() {
      forms.Hut.cleanup.call(this);
      let belowHuts = this.belowHuts.values();
      this.belowHuts = Map.stub;
      for (let bh of belowHuts) bh.end();
    }
    
  })});
  
  /** @type HutRoom_setup_hut.BelowHut */
  let BelowHut = form({ name: 'BelowHut', has: { Hut }, props: (forms, Form) => ({
    
    init({ aboveHut, ...args }) {
      
      /// {DEBUG=
      if (!aboveHut) throw Error(`Api: must supply "aboveHut"`);
      /// =DEBUG}
      
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
        
        roads: Map(/* RoadAuthority(...) => Road(...) */)
      });
      
      for (let p of 'roads,aboveHut,heartbeatTimeout'.split(',')) denumerate(this, p);
      /// {ABOVE=
      for (let p of 'syncTellVersion,pendingSync,throttleSyncPrm,followedRecs'.split(',')) denumerate(this, p);
      /// =ABOVE} {BELOW=
      for (let p of 'syncHearVersion,bufferedSyncs'.split(',')) denumerate(this, p);
      /// =BELOW}
      
      this.resetHeartbeatTimeout();
      this.makeCommandHandler('error', comm => gsc(`${this.desc()} was informed of Error`, comm.msg));
      this.makeCommandHandler('multi', ({ src, msg: { list=null }, reply }) => {
        
        if (!isForm(list, Array)) throw Error(`Api: invalid multi list`);
        
        let replies = [];
        let multiReply = msg => replies.push(msg);
        for (let msg of list) this.processCommand({ src, reply: multiReply, msg });
        
        // TODO: Or generate a multipart response??? That's cool too...
        if (multiReply.length) {
          gsc('OOAAahhahahwwhwwaaa');
          reply({ command: 'multi', list: replies });
        }
        
      });
      
      /// {BELOW=
      this.makeCommandHandler('hut:sync', ({ src, msg, reply }) => {
        
        let err = Error('');
        try {
          
          let { v: version, content } = msg;
          /// {DEBUG=
          if (!isForm(version, Number)) throw Error('Invalid "version"');
          if (!version.isInteger()) throw Error('Invalid "version"');
          if (!isForm(content, Object)) throw Error('Invalid "content"');
          if (version < this.syncHearVersion) throw Error(`Api: Duplicated sync (version: ${version}; current version: ${this.syncHearVersion})`);
          /// =DEBUG}
          
          // Add this newly-arrived sync to the buffer
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
          
          // Duplicated syncs occurs when Above restarts - the new Above doesn't remember it synced
          // us - this is a good way to detect when a reload is needed!
          if (cause.message.startsWith('Api: Duplicated sync')) window.location.reload();
          
          throw err.mod({
            msg: 'error-syncing',
            cause,
            knownCauses: [ 'AboveHut stopped unexpectedly' ]
          });
          
        }
        
      });
      /// =BELOW}
      
    },
    
    getDefaultLoftPrefix() { return this.aboveHut.getDefaultLoftPrefix(); },
    
    getBestRoadFor(trg) {
      
      /// {DEBUG=
      if (trg !== this.aboveHut) throw Error(`Can't tell ${trg.desc()} - can only tell ${this.aboveHut.desc()}!`);
      /// =DEBUG}
      
      let bestCost = Infinity;
      let bestRoad = null;
      for (let road of this.roads.values()) {
        let cost = road.currentCost();
        if (cost < bestCost) [ bestCost, bestRoad ] = [ cost, road ];
      }
      if (!bestRoad) throw Error('Api: no Road available').mod({ src: this.desc(), trg: trg.desc(), roads: this.roads.size });
      return bestRoad;
      
    },
    getKnownNetAddrs() {
      return Set(this.roads.toArr(road => road.netAddr)).toArr(Function.stub);
    },
    processCommand(comm) {
      
      /// {ABOVE=
      // Above, a BelowHut which processes a command has proven the remote is still alive
      this.resetHeartbeatTimeout();
      /// =ABOVE}
      
      // Try to fulfill it ourself
      if (this.commandHandlers.has(comm?.msg?.command)) return this.runCommandHandler(comm);
      
      // Try to fulfill it via our AboveHut
      let { aboveHut } = this;
      if (aboveHut.commandHandlers.has(comm?.msg?.command)) return aboveHut.runCommandHandler(comm);
      
      // This will definitely fail as `this.commandHandlers.has(comm?.msg?.command) === false`; it
      // will reuse error-handling logic defined in `Hut(...).runCommandHandler`
      return this.runCommandHandler(comm);
      
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
      
      // Don't bother if this BelowHut has ended!
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
      
      this.scheduleSync();
      
    },
    scheduleSync() {
      
      // Don't schedule a sync if one is already scheduled!
      if (this.throttleSyncPrm) return;
      
      let prm = this.throttleSyncPrm = soon(() => {
        
        // Hut may have ended between scheduling and executing sync
        if (this.off()) return;
        
        // Can cancel scheduled sync by setting `this.throttleSyncPrm`
        // to any other value
        if (this.throttleSyncPrm !== prm) return;
        
        this.throttleSyncPrm = null;
        
        let updateTell = this.consumePendingSync({ fromScratch: false });
        if (updateTell) this.aboveHut.tell({ trg: this, msg: updateTell });
        
      });
      
    },
    followRec(rec) {
      
      // ### Following and Syncing ###
      // 
      // Note that the HereHut always exists without needing to be synced; this is true both Above
      // and Below; the HereHut is instantiated by the Foundation (of course BELOW the code to
      // instantiate the Foundation is technically synced, but this is outside of Record-syncing
      // behaviour). Note that BELOW the HereHut is a BelowHut; initiating a BelowHut requires an
      // AboveHut param; overall BELOW first manually creates an AboveHut (mirroring ABOVE) - the
      // `hid` of this manually-created AboveHut is known, as an `aboveHid` value is included in
      // the conf by `AboveHut(...).getBelowConf`!
      // 
      // A HereHut always exists; note HereAboveHut has an `hid` corresponding to a Deploy, while
      // HereBelowHut is given an `hid` generated ABOVE - unless the HereBelowHut is spoofed, in
      // which case it can define its own `hid`!
      // 
      // Note that BELOW, the AfarAboveHut anchors the Record tree, and the HereBelowHut is simply
      // woven into that tree (at no time does a BelowHut ever act as the root of a Record tree)
      
      if (rec.off()) return Tmp.stub;             // Ignore any ended Recs
      
      let { allFollows } = this.aboveHut;
      let { uid: bhUid } = this;
      
      // TODO: The following may be able to be simplified considering
      // that if any of the iterated Records end, `rec` will end too
      // (because a Member of its Group will end, with a cascading
      // effect) - this means we don't need to worry about partial
      // cleanup of the follow if an iterated Rec is Ended - the only
      // case is that the whole thing gets cleaned up at once!
      let followTmps = [ ...rec.iterateByDepth() ].map(rec => {
        
        if (rec === this) return skip;          // Don't follow ourself
        if (rec === this.aboveHut) return skip; // Don't follow our AboveHut
        
        // UNCHANGINGRECWTF
        // let { schema } = rec.type;
        // let unchanging = !schema.mod && !schema.rem; // We can make several optimizations to "unchanging" Records
        // if (unchanging) return; // TODO: How dare you! This doesn't seem safe AT ALL!!! TEST THISSS!!!!!!!
        
        // Ref a pre-existing Follow again; Note Records can be followed via multiple independent
        // Scope chains - just because a single Scope chain ends and `end` is called on its Follow
        // doesn't mean the BelowHut is no longer following the Record!
        let preexistingFollowTmp = allFollows[rec.uid]?.[bhUid]; // This says "the Follow of `rec` by a Hut, id'd with `hutUid`"
        if (preexistingFollowTmp) return preexistingFollowTmp.hold();
        
        // First time following `rec`!
        let followTmp = Tmp({ rec, desc: () => `FollowSingle(${rec.desc()})` });
        
        mmm('allFollows', +1);
        if (!allFollows[rec.uid]) allFollows[rec.uid] = Object.plain(); // Reference the new Follow #1
        allFollows[rec.uid][bhUid] = followTmp;                        // Reference the new Follow #2
        mmm('followedRecs', +1);
        this.followedRecs.add(rec);                                     // Link the Hut to the Record
        this.toSync('add', rec);                                        // Generate an "add" sync item
        let valRoute = rec.valueSrc.route(delta => {                    // New values become "upd" syncs
          this.toSync('upd', rec, delta);
        });
        
        followTmp.route(() => { // Cleanup when the Follow ends
          
          mmm('allFollows', -1);
          delete allFollows[rec.uid][bhUid];                          // Unreference #1
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
        subcon('hut.comm.below')({ belowHut: this, status: 'syncing from scratch' });
        /// =DEBUG}
        
        // Reset version and clear the current sync-delta, refreshing it to indicate an "add" for
        // every followed Record - essentially this is "sync-from-scratch" behaviour!
        // Note that the requirement to implement "sync-from-scratch" motivates us to keep an extra
        // `BelowHut(...).followedRecs` property, even though `AboveHut(...).allFollows` already
        // exists; the "allFollows" value is two layers deep, and is indexed first by Record uid,
        // *then* by `BelowHut(...).uid` - i.e., it tells us "all the BelowHuts following a Record"
        // rather than "all the Records followed by a BelowHut". This structure has its own
        // advantages (allows us to quickly determine whether a Record is Followed without needing
        // to loop through all BelowHuts), so the additional per-BelowHut "followedRecs" property
        // is tracked parallel to the single AboveHut "allFollows" value!
        
        this.syncTellVersion = 0;
        this.pendingSync = { add: this.followedRecs.toObj(rec => [ rec.uid, rec ]), upd: {}, rem: {} };
        
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
      
      return { command: 'hut:sync', v: this.syncTellVersion++, content };
      
    },
    strike() {
      gsc(`${this.desc()} got strike`);
    },
    
    /// =ABOVE}
    
    getKeep(prefix, diveToken) {
      
      let dive = token.dive(diveToken);
      
      let bearing = null;
      /// {BELOW=
      bearing = 'below';
      /// =BELOW} {ABOVE=
      bearing = 'above';
      /// =ABOVE}
      
      return {
        below: () => global.keep([ prefix, ...dive ]),
        above: () => this.aboveHut.enabledKeeps.get(dive[0]).dive(dive.slice(1))
      }[bearing]();
      
    },
    
    tell({ trg, ...args }) {
      
      /// {DEBUG=
      if (trg !== this.aboveHut) throw Error(`Can't tell ${trg.desc()} - can only tell ${this.aboveHut.desc()}!`);
      /// =DEBUG}
      
      /// {BELOW=
      // When Below Tells, it has reset the keepalive countdown
      this.resetHeartbeatTimeout();
      /// =BELOW}
      
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
        if (this.isHere) this.tell({ trg: this.aboveHut, msg: { command: 'hut:bp' } });
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
      let roads = this.roads ? [ ...this.roads.values() ] : []; // TODO: Checking that `this.roads` exists should *nottt* be necessary!!
      this.roads = Map.stub;
      for (let r of roads) r.end();
      
    }
    
  })});
  
  /** @type HutRoom_setup_hut.Room */
  return { Hut, AboveHut, BelowHut };
  
};