// RoadAuthorities maintain Roads according to some paradigm, and in the context of a specific
// HereHut. Yes, a RoadAuthority is a "Server"!

global.rooms['setup.hut.hinterland.RoadAuthority'] = async () => form({ name: 'RoadAuthority', props: (forms, Form) => ({
  
  // Note that `RoadAuth(...).protocol` is the *base* protocol - it won't include an extra "s" char
  // even if we have `RoadAuth({ secure: true })`! Instead use `RoadAuth(...).getProtocol()`.
  
  // TODO: Define this in clearing.js? Or maybe even delete it, and work with duck-typing instead?
  // (Or don't delete it but just never reference it??) If so may want to simplify some
  // functionality e.g. parsing netAddr and port from netProc...
  init({ aboveHut, secure, protocol, netProc, compression=[], sc=subcon(`road.${protocol}`) }) {
    
    /// {DEBUG=
    if (!aboveHut)                throw Error('Api: must provide "aboveHut"');
    if (!protocol)                throw Error('Api: must provide "protocol"');
    if (!netProc)                 throw Error('Api: must provide "netProc"');
    if (!isForm(secure, Boolean)) throw Error('Api: must provide "secure" as Boolean').mod({ secure });
    if (!sc) throw Error('Api: must provide "sc"');
    /// =DEBUG}
    
    let [ netAddr, port ] = netProc.split(':');
    port = parseInt(port, 10);
    
    if (!/^[a-zA-Z0-9.-_]+$/.test(netAddr)) throw Error('Api: invalid "netProc"').mod({ netProc });
    if (!isForm(port, Number))              throw Error('Api: invalid "netProc"').mod({ netProc });
    
    Object.assign(this, {
      aboveHut,
      secure, protocol, netProc, netAddr, port: parseInt(port, 10), compression,
      state: 'shut', statePrm: Promise.resolve(),
      sc
    });
    
  },
  getBaseProtocol() { return this.protocol; },                                 // The same regardless of security; no extra "s" char
  getProtocol() { return this.secure ? this.protocol + 's' : this.protocol; }, // Append "s" if secure!
  getNetAddr() { return this.netProc.cut(':')[0]; },
  getPort() { return this.netProc.cut(':')[1]; },
  desc() { return `${this.getProtocol()}://${this.netProc}`; },
  
  activate({ security=null, ...args }={}) {
    
    // Returns a Tmp indicating that the RoadAuthority is active and
    // can be interacted with via its NetCoords; interactions over the
    // network result in:
    // - initializing BelowHuts representing clients
    // - initializing Roads linking client BelowHuts to the AboveHut
    // - commands being told by the BelowHut and heard by the AboveHut
    // - commands being told by the AboveHut and heard by the BelowHut
    
    if (this.secure !== !!security) throw Error('Api: invalid combination of "secure" and "security"').mod({ secure: this.secure, security });
    
    let tmp = Tmp();
    tmp.prm = this.doActivate({ tmp, security, ...args });
    tmp.prm.then(() => {
      this.state = 'open';
      tmp.endWith(() => this.state = 'shut');
    });
    return tmp;
    
  },
  doActivate({ security }) { throw Error('Not implemented'); },
  makeRoad(belowHut, params={}) { throw Error('Not implemented'); },
  
  $Road: form({ name: 'Road', has: { Tmp }, props: (forms, Form) => ({
    
    // Roads connect Huts within the Hinterland. Roads always connect
    // AboveHut <-> BelowHut. Yes, a Road is a "Session"!
    
    init({ roadAuth, belowHut }) {
      forms.Tmp.init.call(this);
      Object.assign(this, { roadAuth, belowHut });
    },
    desc() {
      let netAddrs = this.belowHut.getKnownNetAddrs();
      return `${getFormName(this)}(${this.roadAuth.desc()} <-> ${this.belowHut.hid}@[${netAddrs.join('+')}])`;
    },
    currentCost() { throw Error('Not implemented'); },
    tellAfar() {
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