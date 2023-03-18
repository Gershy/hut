global.rooms['habitat.HtmlBrowserHabitat.hutify.protocol.http'] = () => {
  
  return { createServer: ({ hut, netIden, netProc, ...opts }) => {
    
    let server = Tmp({
      protocol: 'http', netIden, netProc,
      desc: () => `http${netIden.secureBits ? 's' : ''}://${netProc}`,
      src: Src(),
      currentCost: () => 0.5,
      abort: new AbortController(),
      activeReqs: 0
    });
    server.endWith(() => server.abort.abort(Error('Server closed')));
    
    // TODO: Think about how to clean this up so the logic which results
    // in a refresh is clearer! Right now refreshes are ignored if the
    // Foundation was explicitly ended for losing tab priority!
    server.src.route(session => {
      
      let err = Error('');
      let route = session.tell.route(async msg => {
        
        server.activeReqs++;
        try {
          
          let res = await fetch('/', {
            method: 'post'.upper(),
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: valToJson({ trn: 'async', hid: hut.hid, command: 'bp', ...msg }), // TODO: Would be nice to wrap `msg` to avoid property collisions
            signal: server.abort.signal,
            redirect: 'error'
          });
          
          if (res.status > 400) throw Error(`Bad request (${res.status})`);
          
          // Process response as a Tell
          let ms = this.getMs();
          let data = (res.status === 204) ? null : await res.json();
          if (data !== null) session.hear.send({ ms, reply: null, msg: data });
          
        } catch (err) {
          
          route.end();
          if (err?.message.has('abort')) gsc(`Http fetch aborted (ignore; presumably unloading!)`);
          else { gsc(`Error with http fetch (refreshing)`, err); this.restart(); }
          
        }
        server.activeReqs--;
        
        // Ensure at least 1 banked poll is always available
        if (server.activeReqs < 1) this.soon().then(() => session.tell.send(''));
        
      });
      session.endWith(route);
      
      // Immediately bank a request
      session.tell.send('');
      
    });
    
    return server;
    
  }};
  
};
