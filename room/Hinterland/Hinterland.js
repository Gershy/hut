global.rooms['Hinterland'] = async foundation => {
  
  let rooms = await getRooms([ 'logic.Scope', 'record' ]);
  let { Record } = rooms.record;
  let { Scope } = rooms;
  
  return form({ name: 'Hinterland', props: (forms, Form) => ({
    
    // Hinterland is the space in which multiple Huts interact according
    // to the rules of the AboveHut
    
    init(prefix, roomName, params={}) {
      
      let { habitats=[], recordForms={} } = params;
      let { above=Function.stub, below=Function.stub } = params;
      if (!habitats.count()) throw Error(`Hinterland requires at least 1 habitat`);
      
      Object.assign(this, { prefix, roomName, habitats, recordForms, above, below });
      
    },
    
    async open({ hut, rec=hut, netIden }) {
      
      // TODO: Maybe here is the place to define the connection from
      // `netIden` to `hut`? I.e. that network communications to the
      // NetworkIdentity get translated to `hut`. This may be some good
      // candidate logic to define once and reference from ABOVE/BELOW.
      // If that *doesn't* make sense, maybe all Hinterlands logic needs
      // to move to `foundation` + `HtmlBrowserHabitat/init/init.js`
      
      let tmp = Tmp();
      tmp.endWith(netIden.runOnNetwork());
      
      // Prepare all habitats
      await Promise.all(this.habitats.map(async hab => {
        let habitatPrepared = await hab.prepare(this.roomName, hut);
        tmp.endWith(habitatPrepared);
      }));
      
      // Add all type -> Form mappings
      for (let [ k, v ] of this.recordForms) {
        
        // Note that the value mapped to is either some Record Form or a
        // Function returning some Record Form!
        tmp.endWith(rec.type.manager.addFormFn(k, v['~Forms'] ? () => v : v));
        
      }
      
      let hinterlandReal = global.real.addReal(`${this.prefix}.root`);
      tmp.endWith(hinterlandReal);
      
      let loftRh = rec.relHandler({ type: `${this.prefix}.loft`, term: 'hut', offset: 0, limit: 1, fixed: true });
      tmp.endWith(loftRh);
      
      /// {DEBUG=
      let recordSampleScConf = conf('subcons.record->sample')
      if (recordSampleScConf?.output?.inline) (async () => {
        
        let rank = rec => rec.uid.hasHead('!') ? -1 : 0;
        let rankType = (a, b) => a.type.name.localeCompare(b.type.name);
        let rankUid = (a, b) => a.uid.localeCompare(b.uid);
        let sc = subcon('record.sample');
        
        let TimerSrc = await getRoom('logic.TimerSrc');
        TimerSrc({ num: Infinity, ms: recordSampleScConf.ms }).route(() => {
          
          let ts = getMs();
          let results = [ ...rec.iterateAll() ]
            .sort((a, b) => (rank(a) - rank(b)) || rankType(a, b) || rankUid(a, b))
            .map(rec => `- ${rec.uid.padTail(24, ' ')} -> ${rec.type.name.padTail(24, ' ')} ${JSON.stringify(rec.getValue())}`);
          sc([
            `Sampled ${results.count()} Record(s) (took ${((getMs() - ts) / 1000).toFixed(2)}ms)`,
            ...results
          ].join('\n'))
          
        });
        
      })();
      /// =DEBUG}
      
      let rhFromRecWithRhArgs = (args, dep) => {
        
        // Allows `dep.scp` to be passed 2 arguments, a Record and a
        // RelHandler argument, and those 2 arguments will be resolved
        // to a single RelHandler (which is a Src), which is the result
        // of `rec.relHandler(relHandlerArg)`
        
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
      gsc(`${rec.desc()} add loft`);
      let mainRec = rec.addRecord({ type: `${this.prefix}.loft`, group: { hut }, value: null, uid: `!loft@${this.prefix}` });
      
      // Wait for the Loft to register as a HolderRec on `hut`
      let mainScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, (loftRec, dep) => {
        
        // The AppRecord is ready; apply `this.above`
        this.above(hut, loftRec, hinterlandReal, dep);
        
        // Now KidHuts may access the AppRecord via the Hinterland; use
        // the default (0, Infinity, {}) relHandler - otherwise some
        // KidHut beyond the first N would never get processed!
        dep.scp(hut.ownedHutRh, (owned, dep) => {
          
          // `owned` has { par, kid }; "par" and "kid" are both Huts
          let kidHut = owned.getMember('below');
          
          // Records throughout `scp` get followed by `owned`
          dep.scp(loftRh, { frameFn: resolveHrecsAndFollowRecs.bind(null, kidHut) }, (loftRec, dep) => {
            this.below(kidHut, loftRec, hinterlandReal, dep);
          });
          
        });
        
      });
      tmp.endWith(mainScope);
      
      /// =ABOVE} {BELOW=
      
      // As soon as Below syncs the root Rec it's good to go
      let kidScope = Scope(loftRh, { processArgs: rhFromRecWithRhArgs, frameFn: resolveHrecs }, (loftRec, dep) => {
        this.below(hut, loftRec, hinterlandReal, dep);
      });
      tmp.endWith(kidScope);
      
      /// =BELOW}
      
      return tmp;
      
    }
    
  })});
  
};
