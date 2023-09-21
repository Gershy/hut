// RoadAuthorities maintain Roads according to some paradigm, and in the
// context of a specific HereHut. Yes, a RoadAuthority is a "Server"!

global.rooms['setup.hut.hinterland.RoadAuthority'] = async () => {
  
  return form({ name: 'RoadAuthority', props: (forms, Form) => ({
    
    // TODO: Define this in clearing.js? Or maybe even delete it, and
    // work with duck-typing instead? (Or don't delete it but just never
    // reference it??) If so may want to simplify some functionality
    // e.g. parsing netAddr and port from netProc...
    init({ aboveHut, protocol, netProc, compression=[], sc=subcon(`road.${protocol}`) }) {
      
      /// {DEBUG=
      if (!aboveHut) throw Error('Api: must provide "aboveHut"');
      if (!protocol) throw Error('Api: must provide "protocol"');
      if (!netProc) throw Error('Api: must provide "netProc"');
      if (!sc) throw Error('Api: must provide "sc"');
      /// =DEBUG}
      
      let [ netAddr, port ] = netProc.split(':');
      Object.assign(this, {
        aboveHut,
        protocol, netProc, netAddr, port: parseInt(port, 10), compression,
        state: 'shut', statePrm: Promise.resolve(),
        sc
      });
      
    },
    getNetAddr() { return this.netProc.cut(':')[0]; },
    getPort() { return this.netProc.cut(':')[1]; },
    desc() { return `${this.protocol}://${this.netProc}`; },
    
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
    makeRoad(belowHut, params={}) { throw Error('Not implemented'); },
    
    $Road: form({ name: 'Road', has: { Tmp }, props: (forms, Form) => ({
      
      // Roads connect Huts within the Hinterland. Roads always connect
      // AboveHut <-> BelowHut. Yes, a Road is a "Session"!
      
      init({ roadAuth, belowHut }) {
        forms.Tmp.init.call(this);
        Object.assign(this, { roadAuth, belowHut });
      },
      desc() {
        // TODO: pass NetworkAddress to `aboveHut.getBelowHutAndRoad`
        let netAddr = belowHut.getKnownNetAddrs()[0];
        return `${getFormName(this)}(${this.roadAuth.desc()} <-> ${netAddr} / ${this.belowHut.hid})`;
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
  
};
