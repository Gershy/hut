global.rooms['Hinterland'] = async foundation => {
  
  let rooms = await foundation.getRooms([ 'logic.Scope', 'record' ]);
  let { Record } = rooms.record;
  let { Scope } = rooms;
  
  return form({ name: 'Hinterland', props: (forms, Form) => ({
    
    // Hinterland is the space in which multiple Huts interact according
    // to the Rooms of the AboveHut
    
    init(prefix, roomName, params={}) {
      
      let { habitats=[], recordForms={} } = params;
      let { parFn=null, kidFn=null, nature=parFn || Function.stub, psyche=kidFn || Function.stub } = params;
      if (!habitats.count()) throw Error(`Hinterland requires at least 1 habitat`);
      
      Object.assign(this, { prefix, roomName, habitats, recordForms, nature, psyche });
      
    },
    
    async open(hut, networkGroup) {
      
      if (!networkGroup) throw Error(`No NetworkGroup provided!`);
      
      // TODO: This is a mess; not the right place to supply default pfx
      if (hut.defaultPfx) throw Error(`${hut.desc()} already has default prefix "${hut.defaultPfx}"`);
      hut.defaultPfx = this.prefix;
      
      let tmp = Tmp();
      
      // Setup all servers; note this is fire-and-forget! Awaiting the
      // server connection can seriously impact client-side UX!
      // Note: There would be race-condition ramifications if code were
      // allowed to continue without any immediately-available servers
      // (e.g. quickly occurring requests from the BelowHut could
      // encounter the error that it cannot do Tells since there is no
      // AboveHut). This currently cannot happen to FoundationBrowser,
      // as the function for creating the http server is synchronous!
      // This is contextually sensible, as the FoundationBrowser code
      // itself has been transported over a live http connection (and
      // therefore minimum 1 http connection must be available)
      let { netIden, servers } = networkGroup;
      for (let { address, bindings } of servers) for (let { protocol, port, ...opts } of bindings) {
        
        let server = foundation.createServer({ hut, protocol, netIden, host: address, port, ...opts });
        if (!netIden) tmp.endWith(server);
        foundation.subcon('network.server.active')(async () => {
          
          //let url = await foundation.getRoom('url');
          //return `Access ${this.roomName} at ${url.encode({ protocol, address, port })}`;
          return `Access ${this.roomName} at ${protocol}://${address}:${port}`;
          
        });
        
      }
      if (netIden) tmp.endWith(netIden.runManagedServers());
      
      // Prepare all habitats
      await Promise.all(this.habitats.map(async hab => tmp.endWith(await hab.prepare(this.roomName, hut))));
      
      // Add all type -> Form mappings
      for (let [ k, v ] of this.recordForms) {
        // Note that the value mapped to is either some Record Form or a
        // Function returning some Record Form!
        let addTypeFormFnTmp = hut.addTypeFormFn(k, isFormFn(v) ? () => v : v);
        tmp.endWith(addTypeFormFnTmp);
      }
      
      let primaryReal = await foundation.seek('real', 'primary'); // TODO: ('real', 'primary') -> ('real')
      let real = primaryReal.addReal(`${this.prefix}.root`);
      
      let loftRh = hut.relHandler({ type: `${this.prefix}.loft`, term: 'hut', offset: 0, limit: 1, fixed: true });
      tmp.endWith(loftRh);
      
      let recordSampleSc = foundation.subcon('record.sample');
      if (recordSampleSc.enabled) (async () => {
        
        let rank = rec => rec.uid.hasHead('!') ? -1 : 0;
        let rankType = (a, b) => a.type.name.localeCompare(b.type.name);
        let rankUid = (a, b) => a.uid.localeCompare(b.uid);
        
        let TimerSrc = await foundation.getRoom('logic.TimerSrc');
        TimerSrc({ num: Infinity, ms: recordSampleSc.ms }).route(() => {
          
          let ts = foundation.getMs();
          recordSampleSc('Sampling Records...');
          let results = [ ...hut.iterateAll() ];
          recordSampleSc(`  Sampled ${results.count()} Record(s):`);
          recordSampleSc(results
            .sort((a, b) => (rank(a) - rank(b)) || rankType(a, b) || rankUid(a, b))
            .map(rec => `  - ${rec.uid.padTail(24, ' ')} -> ${rec.type.name.padTail(24, ' ')} ${JSON.stringify(rec.getValue())}`)
            .join('\n')
          );
          recordSampleSc(`  (Took ${((foundation.getMs() - ts) / 1000).toFixed(2)}ms)`);
          
        });
        
      })();
      
      let rhFromRecWithRhArgs = (args, dep) => {
        
        // Allows `dep.scp` to be passed 2 arguments, a Record and a
        // RelHandler argument, and those 2 arguments will be resolved
        // to a single RelHandler (which is a Src), which is the result
        // of `rec.relHandler(relHandlerArg)
        
        if (!hasForm(args[0], Record)) return args;
        
        // `args[0]` is a Record, `args[1]` should be RelHandler params
        let rh = args[0].relHandler(args[1]);
        
        // Note you may expect simply `dep(rh)` here, but this fails
        // for multi-ref'd RelHandlers as `dep` will ignore duplicate
        // references
        dep(() => rh.end());
        
        return [ rh, ...args.slice(2) ];
        
      };
      let resolveHrecs = (tmp, dep) => hasForm(tmp.rec, Record) ? tmp.rec : tmp;
      
      /// {ABOVE=
      
      let resolveHrecsAndFollowRecs = (kidHut, tmp, dep) => {
        if      (hasForm(tmp, Record))     { kidHut.followRec(tmp);     return tmp; }
        else if (hasForm(tmp.rec, Record)) { kidHut.followRec(tmp.rec); return tmp.rec; }
        return tmp;
      };
      
      // Create the AppRecord identified by `${this.prefix}.loft`
      let mainRec = hut.addRecord({ type: `${this.prefix}.loft`, group: { hut }, value: null, uid: `!loft@${this.prefix}` });
      
      // Wait for the AppRecord to register as a HolderRec on `hut`
      let mainScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, (loftRec, dep) => {
        
        // The AppRecord is ready; apply `this.nature`
        this.nature(hut, loftRec, real, dep);
        
        // Now KidHuts may access the AppRecord via the Hinterland; use
        // the default (0, Infinity, {}) relHandler - otherwise some
        // KidHut beyond the first N would never get processed!
        dep.scp(hut.ownedHutRh, (owned, dep) => {
          
          // `owned` has { par, kid }; "par" and "kid" are both Huts
          let kidHut = owned.getMember('kid');
          
          // Records throughout `scp` get followed by `owned`
          dep.scp(loftRh, { frameFn: resolveHrecsAndFollowRecs.bind(null, kidHut) }, (loftRec, dep) => {
            this.psyche(kidHut, loftRec, real, dep);
          });
          
        });
        
      });
      
      tmp.endWith(mainScope);
      
      /// =ABOVE} {BELOW=
      
      // As soon as Below syncs the root Rec it's good to go
      let kidScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, async (loftRec, dep) => {
        
        await this.psyche(hut, loftRec, real, dep);
        await real.tech.informInitialized(); // Let the RealTech know the psyche initialized!
        
      });
      
      tmp.endWith(kidScope);
      
      /// =BELOW}
      
      return tmp;
      
    }
    
  })});
  
};
