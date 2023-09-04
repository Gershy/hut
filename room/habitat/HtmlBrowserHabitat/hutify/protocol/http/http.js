global.rooms['habitat.HtmlBrowserHabitat.hutify.protocol.http'] =
  () => getRoom('setup.hut.hinterland.RoadAuthority')
    .then(RoadAuth => form({ name: 'BrowserHttpRoadAuthority', has: { RoadAuth }, props: (forms, Form) => ({
      
      init({ ...args }) {
        forms.RoadAuth.init.call(this, { protocol: 'http', ...args });
        Object.assign(this, {
          abortController: null,
          active: false
        });
      },
      activate() {
        
        let tmp = Tmp();
        
        this.active = true;
        this.abortController = new AbortController();
        tmp.endWith(() => {
          this.active = false;
          this.abortController.abort();
          this.abortController = null;
        });
        
        return tmp;
        
      },
      makeRoad(belowHut, params) {
        if (!this.active) throw Error('Api: inactive; unable to create road');
        let road = (0, Form.BrowserHttpRoad)({ roadAuth: this, belowHut, ...params });
        road.tellAfar(''); // Immediately bank a request
        return road;
      },
      
      $BrowserHttpRoad: form({ name: 'BrowserHttpRoad', has: { Road: RoadAuth.Road }, props: (forms, Form) => ({
        
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
            
            let netTell = valToJson({ trn: 'async', hid: this.belowHut.hid, command: 'bp', ...msg });
            let stuffHeader = netTell.length < 100 && Form.headerValueRegex.test(netTell);
            let res = await fetch('/', {
              method: 'POST',
              headers: stuffHeader
                ? { 'Content-Type': 'application/json; charset=utf-8', 'X-Hut-Msg': netTell }
                : { 'Content-Type': 'application/json; charset=utf-8' },
              ...(stuffHeader || { body: netTell }),
              signal: this.roadAuth.abortController.signal,
              redirect: 'error'
            });
            
            if (res.status >= 400) throw Error(`Bad request (${res.status})`).mod({ res });
            
            // Process response as a Tell
            let ms = getMs();
            let netHear = res.status === 204 ? null : await res.json();
            if (netHear) this.belowHut.hear({ src: this.roadAuth.aboveHut, road: this, ms, msg: netHear });
            
          } catch (cause) {
            // TODO: Retry logic!
            let ignore = cause.message.has('abort') && !this.roadAuth.active;
            if (!ignore) err.propagate({ cause, msg: 'Http failed (maybe network problems, server down?)', netTell: msg });
          }
          this.activeReqs--;
          
          // Bank another poll
          if (this.activeReqs < 1) this.tellAfar(null);
          
        }
        
      })})
      
    })}));
