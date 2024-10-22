let roomName = 'habitat.HtmlBrowserHabitat.hutify.protocol.sokt';
global.rooms[roomName] = () => then(getRoom('setup.hut.hinterland.RoadAuthority'), RoadAuth =>
  form({ name: 'SoktRoadAuthority', has: { RoadAuth }, props: (forms, Form) => ({
    
    init({ ...args }) {
      
      forms.RoadAuth.init.call(this, { protocol: 'sokt', ...args });
      Object.assign(this, { active: false });
      
    },
    async doActivate({ tmp }) {
      
      this.active = true;
      tmp.endWith(() => this.active = false);
      
    },
    makeRoad(belowHut, params) {
      
      if (!this.active) throw Error('Api: inactive; unable to create road');
      let road = (0, Form.SoktRoad)({ roadAuth: this, belowHut, sc: this.sc, ...params });
      return road;
      
    },
    
    $SoktRoad: form({ name: 'SoktRoad', has: { Road: RoadAuth.Road }, props: (forms, Form) => ({
      
      $headerValueRegex: /^[\u0020-\u007e]*$/,
      
      init(args) {
        
        forms.Road.init.call(this, args);
        
        let { secure, netProc, sc } = this.roadAuth;
        sc = sc.kid('road');
        
        let socket = new WebSocket(`${secure ? 'wss' : 'ws'}://${netProc}/?hid=${this.belowHut.hid}`)
        
        forms.Road.init.call(this, args);
        Object.assign(this, {
          socket,
          openPrm: Promise((rsv, rjc) => {
            socket.evt('open', rsv, { once: true });
            socket.evt('error', rjc, { once: true });
          }).then(() => this.openPrm = null)
        });
        
        socket.evt('error', err => {
          // This probably means the following happened:
          // 1. Another tab was active
          // 2. The other tab had a sokt connection
          // 3. This tab became active
          // 4. This tab tried to take the sokt connection (other tab still
          //    has active connection)
          // 5. Other tab realized it's inactive
          // 6. Other tab gives up sokt connection
          // At step #4 this error occurs
          // 
          // TODO: Solutions are (worst to best):
          // 1. Refresh upon socket error
          // 2. Add an ACK step when using localstorage to deactivate the
          //    previously active tab; new tab doesn't init servers until
          //    old tab confirms it's disconnected
          // 3. Just implement a SharedWorker to handle networking
          esc.say(err);
          
          // TODO: This interim solution is the WORST (and could create huge congestion)
          window.location.reload();
        });
        socket.addEventListener('message', ({ data: msg /*, ...stuff */ }) => {
          let ms = getMs();
          let netHear = jsonToVal(msg);
          if (msg) this.belowHut.hear({ src: this.roadAuth.aboveHut, road: this, ms, msg: netHear });
        });
        
      },
      currentCost() { return 0.15; },
      async tellAfar(msg) {
        if (!msg) return;
        if (this.openPrm) await this.openPrm;
        this.socket.send(valToJson(msg));
      },
      
      cleanup() {
        forms.Road.cleanup.call(this);
        this.socket.close();
      }
      
    })})
    
  })})
);
