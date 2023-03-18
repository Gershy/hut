global.rooms['setup.hut'] = async () => {
  
  let { Record } = await getRoom('record');
  
  // TRACK:
  // above+below: roadSrcs
  // above: typeToClsFns
  // above: below huts track pendingSync
  // above: known deps
  
  let Hut = form({ name: 'Hut', has: { Record }, props: (forms, Form) => ({
    
    // Huts connect by Roads to other Huts, have the ability to Tell and
    // Hear to/from other Huts, and can react to what they Hear
    
    init({ isHere=false, hid, uid, ...recordProps }) {
      
      if (!hid && !uid) throw Error(`Api: supply either "hid" or "uid" (they're synonyms)`);
      if (!hid) hid = uid;
      if (!uid) uid = hid;
      if (uid !== hid) throw Error(`Api: "hid" and "uid" must have same value`);
      
      forms.Record.init.call(this, { uid, ...recordProps });
      
      Object.assign(this, {
        hid,
        isHere, isAfar: !isHere,
        commandSrcTmps: Map(/* command => CommandSrcTmp */)
      });
      
    },
    desc() { return getFormName(this); },
    
    hear({ src, road, reply, ms=getMs(), msg }) {
      
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
        subcon('warning')(`Error reply`, msg);
        msg = { command: 'error', type: 'application', msg: msg.message };
      }
      
      if (!msg) return;
      if (!src && road) throw Error(`Can't provide Road without SrcHut (who is on the other end of that Road??)`);
      if (!src && reply) throw Error(`Can't omit "src" and provide "reply" (who would receive that reply??)`);
      if (src && src.aboveHut !== trg && trg.aboveHut !== src) {
        throw Error(String.baseline(`
          | Supplied unrelated Huts (neither is the other's parent)
          | Src: ${src?.desc?.() ?? null}
          | Trg: ${trg?.desc?.() ?? null}
        `));
      }
      
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
    tell({ trg, road, reply, ms=getMs(), msg }) { return trg.hear({ src: this, road, reply, ms, msg }); },
    getRoadFor(trg) { throw Error('Not implemented'); },
    actOnComm(comm) {
      
      let { msg={} } = comm;
      let { command=null } = msg;
      
      if (command === 'error') return gsc('Comm error', msg);
      if (command === 'multi') {
        
        let { src=null } = comm;
        let { list=null } = msg;
        
        if (!isForm(list, Array)) return reply(Error(`Api: invalid multi list`).mod({ e: 'invalidMultiList' }));
        
        let replies = [];
        let multiReply = msg => replies.push(msg);
        for (let msg of list) this.hear({ src, reply: multiReply, msg });
        
        // TODO: Or... generate a multipart response? That would be cool too...
        if (multiReply.length) { gsc('OOAAahhahahwwhwwaaa'); reply({ command: 'multi', list: replies }); }
        return;
        
      }
      
      let cmdSrcTmp = this.commandSrcTmps.get(command);
      if (!cmdSrcTmp) return comm.reply(Error(`Api: invalid command: "${command}"`).mod({ e: 'invalidCommand' }));
      
      cmdSrcTmp.src.send(comm);
      
    },
    
    roadSrc(command) { return this.commandSrcTmp(command).src; }, // TODO: Delete this method!!
    commandSrcTmp(command) {
      
      // Produce a Tmp({ src: Src() }) whose "src" sends messages whose
      // command property is of the given value
      
      let commandSrcTmp = this.commandSrcTmps.get(command)?.ref();
      if (!commandSrcTmp) this.commandSrcTmps.set(command, commandSrcTmp = Tmp({
        src: Object.assign(Src(), { desc: () => `CommandSrc for "${command}"` })
      }));
      return commandSrcTmp;
      
    }
    
  })});
  let AboveHut = form({ name: 'AboveHut', has: { Hut }, props: (forms, Form) => ({
    
    // A Hut that directly manages a Record structure and manages making
    // projections of that structure available to BelowHuts
    
    init({ isHere, hid, recMan }) {
      
      if (!recMan) throw Error('Api: "recMan" must be provided');
      
      forms.Hut.init.call(this, {
        isHere,
        hid,
        type: recMan.getType('hut.above'),
        group: recMan.getGroup([]),
        value: { ms: getMs() }
      });
      
      /// {ABOVE=
      let ownedHutRh = this.relHandler('hut.owned/par'); // Get 'hut.owned' Recs where `this` is the Par
      let bankedPrm = this.bankedPrm.then(() => ownedHutRh.ready());
      /// =ABOVE}
      
      Object.assign(this, {
        
        belowHuts: Map(/* belowHutHid => BelowHut(...) */),
        
        /// {ABOVE=
        childUidCnt: 0,
        ownedHutRh,
        bankedPrm,
        knownRoomDependencies: Set(),
        knownRealDependencies: Set(),
        serverInfos: [],
        /// =ABOVE}
        
        allFollows: Object.plain(/* uid -> { hutId -> FollowTmp } */)
        
      });
      
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
      
    },
    
    makeBelowUid() {
      
      return [ this.childUidCnt++, Math.floor(Math.random() * 62 ** 8) /* TODO: Use a stock random instance? */ ]
        .map(v => v.encodeStr(String.base62, 8))
        .join('');
      
    },
    makeBelowHut(hid) {
      
      if (!hid) throw Error(`Must supply "hid" (maybe use ${getFormName(this)}(...).makeBelowUid()?)`);
      
      let { manager } = this.type;
      let type = manager.getType('hut.belowHut');
      let group = manager.getGroup([]);
      let bh = BelowHut({ aboveHut: this, isHere: !this.isHere, type, group, hid });
      
      this.belowHuts.add(hid, bh);
      bh.endWith(() => this.belowHuts.rem(hid));
      
      // `soon` gives time for some initial Roads to be added
      soon(() => manager.addRecord({
        type: 'hut.owned',
        group: { above: this, below: bh },
        uid: `!owned@${this.hid}@${bh.hid}`
      }));
      
      return bh;
      
    },
    
    /// {ABOVE=
    
    getBelowConf() {
      
      // TODO: it may be very elegant to simply provide an AboveHut with
      // the conf used to initialize it! Right now conf is *global*, so
      // every AboveHut in the same nodejs process can be pointed to the
      // same conf data! Then for the following, we parse the AboveHut
      // instance's conf (shouldn't ever call `global.conf` here)
      
      return {
        
        // TODO: Subcon values for Below??
        
        aboveHid: this.hid,
        deploy: {
          maturity: conf('deploy.maturity'),
          loft: {
            uid: conf('deploy.loft.uid'),
            def: {
              prefix: conf('deploy.loft.def.prefix'),
              room: conf('deploy.loft.def.room')
            },
            hosting: {
              netIden: { secureBits: conf('deploy.loft.hosting.netIden.secureBits') },
              netAddr: conf('deploy.loft.hosting.netAddr'),
              heartbeatMs: conf('deploy.loft.hosting.heartbeatMs'),
              protocols: conf('deploy.loft.hosting.protocols')
            }
          }
        }
        
      };
      
    },
    addServerInfo({ secure, protocol, netAddr, port }) {
      
      // AboveHuts don't reference any Servers (they are completely
      // decoupled), but when connecting a Server to an AboveHut it's
      // recommended to call `addServerInfo` to inform the AboveHut it's
      // being served in a particular manner
      this.serverInfos.push({ secure, protocol, netAddr, port });
       
    },
    addKnownRoomDependencies(deps) { for (let dep of deps) this.knownRoomDependencies.add(dep); },
    addKnownRealDependencies(deps) { for (let dep of deps) this.knownRealDependencies.add(dep); },
    
    async getCompiledKeep(bearing, roomPcs, { uniqKey=null, wrapJs=false }={}) {
      
      if (isForm(roomPcs, String)) roomPcs = roomPcs.split('.');
      if (!isForm(roomPcs, Array)) throw Error(`Invalid "roomPcs" (${getFormName(roomPcs)})`);
      
      let cmpKeep = keep(`[file:code:cmp]->${bearing}->${roomPcs.join('->')}->${roomPcs.slice(-1)[0]}.js`);
      if (await cmpKeep.exists()) return cmpKeep;
      
      let srcKeep = keep(`[file:code:src]->${roomPcs.join('->')}->${roomPcs.slice(-1)[0]}.js`);
      if (!await srcKeep.exists()) throw Error(`Room ${roomPcs.join('.')} (${srcKeep.desc()}) doesn't exist`);
      
      let srcContent = await srcKeep.getContent('utf8');
      let { lines, offsets } = global.roomLoader.compileContent(bearing, srcContent, { sourceName: roomPcs.join('.') });
      if (!lines.count()) {
        await cmpKeep.setContent(`'use strict';`); // Write something to avoid recompiling later
        return cmpKeep;
      }
      
      // Embed `offsets` within `lines` for BELOW or setup
      if (conf('deploy.maturity') === 'dev' && [ 'below', 'setup' ].has(bearing)) {
        
        let headInd = 0;
        let tailInd = lines.length - 1;
        let lastLine = lines[tailInd];
        
        // We always expect the last line to end with "};"
        if (!lastLine.hasTail('};')) throw Error(`Last character of ${roomPcs.join('.')} is "${lastLine.slice(-2)}"; not "};"`);
        
        // Lines should look like:
        //    | 'use strict';global.rooms['example'] = async () => {
        //    |   .
        //    |   .
        //    |   .
        //    | };Object.assign(global.rooms['example'],{"offsets":[...]});
        //    |
        lines[tailInd] += `Object.assign(global.rooms['${roomPcs.join('.')}'],${valToJson({ offsets })});`;
        
      }
      
      if (conf('deploy.wrapBelowCode')) {
        
        // SyntaxError is uncatchable in FoundationBrowser and has no
        // useful trace. We can circumvent this by sending code which
        // cannot cause a SyntaxError directly; instead the code is
        // represented as a foolproof String, and then it is eval'd.
        // If the string represents syntactically incorrect js, `eval`
        // will crash but the script will have loaded without issue;
        // a much more descriptive trace can result! There's also an
        // effort here to not change the line count in order to keep
        // debuggability; for this reason all wrapping code is
        // appended/prepended to the first/last lines.
        let escQt = '\\' + `'`;
        let escEsc = '\\' + '\\';
        let headEvalStr = `eval([`;
        let tailEvalStr = `].join('\\n'));`;
        
        lines = lines.map(ln => `'` + ln.replace(/\\/g, escEsc).replace(/'/g, escQt) + `',`); // Ugly trailing comma
        let headInd = 0;
        let tailInd = lines.length - 1;
        lines[headInd] = headEvalStr + lines[headInd];
        lines[tailInd] = lines[tailInd] + tailEvalStr;
        
      }
      await cmpKeep.setContent(lines.join('\n'));
      
      return cmpKeep;
      
    },
    
    /// =ABOVE}
    
    addRecord(...args) { return this.type.manager.addRecord(...args); },
    
  })});
  let BelowHut = form({ name: 'BelowHut', has: { Hut }, props: (forms, Form) => ({
    
    init({ aboveHut, ...hutArgs }) {
      
      if (!aboveHut) throw Error(`Api: must supply "aboveHut"`);
      
      forms.Hut.init.call(this, hutArgs);
      
      Object.assign(this, {
        aboveHut,
        
        /// {ABOVE=
        pendingSync: { add: {}, upd: {}, rem: {} },
        throttleSyncPrm: null, // A Promise resolving when a queued sync request is sent
        /// =ABOVE}
        
        roads: Map(/* Server(...) => Road/Session(...) */)
      });
      
    },
        
    seenOnRoad(server, road) {
      
      if (!server) throw Error(`Api: must supply "server"`);
      if (!road) throw Error(`Api: must supply "road"`);
      
      if (!this.roads.has(server)) {
        
        // Add the Road; if all Roads end the Hut ends too
        this.roads.set(server, road);
        road.endWith(() => {
          this.roads.rem(server);
          if (this.roads.empty()) this.end();
        });
        
      }
      if (this.roads.get(server) !== road) throw Error(`Api: duplicate road for "${server.desc()}"`);
      
    },
    
    /// {ABOVE=
    consumePendingSync({ fromScratch=false }={}) {
      
      let pendingSync = this.pendingSync;
      this.pendingSync = { add: {}, upd: {}, rem: {} };
      
      if (fromScratch) {
        
        /// {DEBUG=
        foundation.subcon('record.sync')(`${this.desc()} syncing from scratch`);
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
    /// =ABOVE}
    
    cleanup() {
      
      forms.Hut.cleanup.call(this); // Eventually calls Record.prototype.cleanup
      
      let roads = [ ...this.roads.values() ];
      this.roads = Map.stub;
      for (let r of roads) r.end();
      
    }
    
  })});
  
  return { Hut, AboveHut, BelowHut };
  
};
