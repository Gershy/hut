// RoadAuthorities maintain Roads according to some paradigm, and in the
// context of a specific AboveHut. Yes, a RoadAuthority is a "Server"!

global.rooms['setup.hut.hinterland.RoadAuthority'] = async () => {
  
  let { hut: { AboveHut, BelowHut } } = await getRoom('setup.hut');
  
  return form({ name: 'RoadAuthority', has: { Src, Endable }, props: (forms, Form) => ({
    
    init({ protocol, secure, netProc, aboveHut, subcon }) {
      forms.Src.init.call(this);
      Object.assign(this, {
        state: 'shut', statePrm: Promise.resolve(),
        secure, netProc,
        aboveHut,
        subcon,
        roads: Map(/* BelowHut(...) => Road(...) */)
      });
    },
    getProtocol() { return `${this.protocol}${this.secure ? 's' : ''`; },
    desc() { return `${getFormName(this)}(${this.getProtocol()}://${this.netProc})`; },
    
    open() {
      return this.statePrm = this.statePrm.then(async () => {
        if (this.state !== 'shut') throw Error(`Api: can't open ${this.desc()} - it isn't shut!`);
        this.state = 'opening';
        await this.doOpen();
        this.state = 'open';
      });
    },
    shut() {
      return this.statePrm = this.statePrm.then(async () => {
        if (this.state !== 'open') throw Error(`Api: can't shut ${this.desc()} - it isn't open!`);
        this.state = 'shutting';
        await this.doShut();
        this.state = 'shut';
      });
    },
    async doOpen() {
      // Makes `this` accessible via Protocol+NetworkProcess; causes
      // interactions from clients to generate calls to `this.hear`
      throw Error('Not implemented');
    },
    async doShut() {
      // Makes `this` inaccessible on the network; once resolved there
      // must be no further calls to `this.hear`!
      throw Error('Not implemented');
    },
    
    // TODO: There's potential to eliminate `BelowHut.seenOnRoad`...
    hear(belowHutOrHid, netAddr, ms, reply, msg) {
      
      // Specify `belowHut` as either `BelowHut(...)`, the String Hid
      // of a BelowHut, or `null`
      // - Strings will be used to reference an existing BelowHut
      // - `null` will be used to generate a brand new BelowHut
      
      let { aboveHut } = this;
      let belowHut = null;
      if      (belowHutOrHid === null)        belowHut = aboveHut.makeBelowHut(aboveHut.makeBelowUid());
      else if (isForm(belowHutOrHid, String)) belowHut = aboveHut.belowHuts.get(belowHutOrHid);
      
      if (!isForm(belowHut, BelowHut)) return { result: 'belowHutUnavailable' };
      
      let road = this.roads.get(belowHut);
      if (!road) {
        this.roads.add(belowHut, road = (0, Form.Road)({
          authority: this, netAddr, belowHut, subcon: this.subcon.kid([ netAddr ])
        }));
        belowHut.endWith(() => this.roads.rem(belowHut));
      }
      
      if (!reply) reply = msg => this.aboveHut.tell({ trg: belowHut, road, ms: getMs(), msg });
      belowHut.tell({ trg: this.aboveHut, reply, ms, msg });
      return { result: 'success' };
      
    },
    
    $Road: form({ name: 'Road', has: { Tmp }, props: (forms, Form) => ({
      
      // Roads connect Huts within the Hinterland. Roads always connect
      // AboveHut <-> BelowHut. Yes, a Road is a "Session"!
      
      init({ authority, netAddr, belowHut, subcon }) {
        forms.Tmp.init.call(this);
        Object.assign(this, {
          authority,
          netAddr,
          belowHut,
          subcon
        });
      },
      desc() {
        let { authority } = this;
        return `${getFormName(this)}(${authority.getProtocol()}://${authority.netProc} <-> ${this.netAddr})`;
      },
      tell() {
        // NOTE: TELLING IS DONE BY A (Hut, Road) PAIR! HUTS MAY HAVE
        // MULTIPLE ROADS! The final transport operation is performed by
        // a Road, but the op needs to be initiated with the Hut, which
        // picks which of its Roads to use! This is why RoadAuthority
        // only handles incoming Comms (clients use any RoadAuthority),
        // and Roads handle outgoing Comms!
        throw Error('Not implemented');
      }
      
    })})
    
  })});
  
};
