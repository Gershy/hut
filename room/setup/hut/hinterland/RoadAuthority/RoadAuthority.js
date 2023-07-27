// RoadAuthorities maintain Roads according to some paradigm, and in the
// context of a specific HereHut. Yes, a RoadAuthority is a "Server"!

global.rooms['setup.hut.hinterland.RoadAuthority'] = async () => {
  
  let { hut: { AboveHut, BelowHut } } = await getRoom('setup.hut');
  
  return form({ name: 'RoadAuthority', has: { Src, Endable }, props: (forms, Form) => ({
    
    init({ aboveHut, secure, protocol, netProc, sc }) {
      forms.Src.init.call(this);
      Object.assign(this, {
        aboveHut,
        secure, protocol, netProc,
        state: 'shut', statePrm: Promise.resolve(),
        roads: Map(/* BelowHut(...) => Road(...) */),
        sc
      });
    },
    getProtocol() { return `${this.protocol}${this.secure ? 's' : ''`; },
    desc() { return `${this.getProtocol()}://${this.netProc}`; },
    
    activate() {
      // Returns a Tmp indicating that the RoadAuthority is active and
      // can be interacted with via its NetCoords; interactions over the
      // network result in:
      // - initializing BelowHuts representing clients
      // - initializing Roads linking client BelowHuts to the AboveHut
      // - commands being told by the BelowHut and heard by the AboveHut
      // - commands being told by the AboveHut and heard by the BelowHut
      throw Error('Not implemented');
    },
    
    // TODO: There's potential to eliminate `BelowHut.seenOnRoad`...
    hear(belowHutOrHid, netAddr, ms, reply, msg) {
      
      // Specify `belowHut` as either `BelowHut(...)`, the String Hid
      // of a BelowHut, or `null`
      // - Strings will be used to reference an existing BelowHut
      // - `null` will be used to generate a brand new BelowHut
      
      // TODO: HEEERE - the plan rn is to pay off tech debt related to
      // foundation and servers (nodejs + browser foundations and
      // servers should inherit from common logic defined in setup/);
      // then clean up Therapy-related stuff; then build out Therapy UI!
      let { aboveHut } = this;
      let belowHut = null;
      if      (belowHutOrHid === null)        belowHut = aboveHut.makeBelowHut(aboveHut.makeBelowUid());
      else if (isForm(belowHutOrHid, String)) belowHut = aboveHut.belowHuts.get(belowHutOrHid);
      
      if (!isForm(belowHut, BelowHut)) return { result: 'belowHutUnavailable' };
      
      let road = this.roads.get(belowHut);
      if (!road) {
        this.roads.add(belowHut, road = (0, Form.Road)({
          authority: this, netAddr, belowHut, sc: this.sc.kid([ netAddr ])
        }));
        belowHut.endWith(() => this.roads.rem(belowHut));
      }
      
      if (!reply) reply = msg => aboveHut.tell({ trg: belowHut, road, ms: getMs(), msg });
      belowHut.tell({ trg: aboveHut, reply, ms, msg });
      return { result: 'success' };
      
    },
    
    $Road: form({ name: 'Road', has: { Tmp }, props: (forms, Form) => ({
      
      // Roads connect Huts within the Hinterland. Roads always connect
      // AboveHut <-> BelowHut. Yes, a Road is a "Session"!
      
      init({ authority, netAddr, belowHut, sc }) {
        forms.Tmp.init.call(this);
        Object.assign(this, { authority, netAddr, belowHut, sc });
      },
      desc() {
        let { authority } = this;
        return `${getFormName(this)}(${authority.desc()} <-> ${this.netAddr})`;
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
