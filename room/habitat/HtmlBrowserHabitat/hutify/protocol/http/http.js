let roomName = 'habitat.HtmlBrowserHabitat.hutify.protocol.http';
global.rooms[roomName] = () => then(getRoom('setup.hut.hinterland.RoadAuthority'), RoadAuth =>
  form({ name: 'HttpRoadAuthority', has: { RoadAuth }, props: (forms, Form) => ({
    
    init({ ...args }) {
      forms.RoadAuth.init.call(this, { protocol: 'http', ...args });
      Object.assign(this, { abortController: null, active: false });
    },
    async doActivate({ tmp }) {
      
      this.active = true;
      this.abortController = new AbortController();
      tmp.endWith(() => {
        this.active = false;
        this.abortController.abort();
        this.abortController = null;
      });
      
    },
    makeRoad(belowHut, params) {
      if (!this.active) throw Error('Api: inactive; unable to create road');
      let road = (0, Form.HttpRoad)({ roadAuth: this, belowHut, ...params });
      road.tellAfar(''); // Immediately bank a request
      return road;
    },
    
    $HttpRoad: form({ name: 'HttpRoad', has: { Road: RoadAuth.Road }, props: (forms, Form) => ({
      
      $headerValueRegex: /^[\u0020-\u007e]*$/,
      
      init(args) {
        
        forms.Road.init.call(this, args);
        Object.assign(this, { activeReqs: 0 });
        
      },
      currentCost() { return 0.75; },
      async tellAfar(msg) {
        
        if (!this.roadAuth.active) return;
        
        let err = Error('');
        this.activeReqs++;
        try {
          
          let netTell = valToJson({ command: 'hut:bp', trn: 'async', hid: this.belowHut.hid, ...msg });
          let stuffHeader = netTell.length < 100 && Form.headerValueRegex.test(netTell);
          let req = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            signal: this.roadAuth.abortController.signal,
            redirect: 'error'
          };
          if (stuffHeader) req.headers['X-Hut-Msg'] = netTell;
          else             req.body = netTell;
          
          let res = await fetch('/', req);
          if (res.status >= 400) throw Error(`Bad request (${res.status})`).mod({ res });
          
          // Process response as a Tell
          let ms = getMs();
          let netHear = res.status === 204 ? null : await res.json();
          if (netHear) this.belowHut.hear({ src: this.roadAuth.aboveHut, road: this, ms, msg: netHear });
          
        } catch (cause) {
          // TODO: Retry logic!
          let ignore = cause.message.has('abort') && !this.roadAuth.active;
          if (!ignore) err.propagate({ cause, msg: 'Api: http failed (network problems, server down?)', netTell: msg });
        }
        this.activeReqs--;
        
        // Bank another poll
        if (this.activeReqs < 1) this.tellAfar(null);
        
      }
      
    })})
    
  })})
);
