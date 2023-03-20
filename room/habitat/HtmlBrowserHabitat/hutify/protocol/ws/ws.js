global.rooms['habitat.HtmlBrowserHabitat.hutify.protocol.ws'] = () => {
  
  return { createServer: ({ hut, netIden, netProc, ...opts }) => {
    
    let { compression } = opts;
    let server = Tmp({
      protocol: 'ws', netIden, netProc,
      desc: () => `ws${netIden.secureBits ? 's' : ''}://${netProc}`,
      src: Src(),
      currentCost: () => 0.25,
    });
    
    server.src.route(session => {
      
      server.endWith(session, 'tmp');
      
      // TODO: Detect ssl properly!
      let socket = new WebSocket(`${netIden.secureBits ? 'wss' : 'ws'}://${netProc}/?trn=sync&hid=${hut.hid}`);
      socket.addEventListener('error', err => subcon('warning')('Socket error event', err));
      socket.addEventListener('close', () => session.end());
      
      let openPrm = Promise((rsv, rjc) => {
        socket.addEventListener('open', rsv, { once: true });
        socket.addEventListener('error', rjc, { once: true });
      });
      session.endWith(() => socket.close());
      
      socket.addEventListener('message', ({ data: msg, ...stuff }) => {
        msg = jsonToVal(msg);
        if (msg) session.hear.send({ ms: getMs(), reply: null, msg });
      });
      
      let routeBeforeConnect = session.tell.route(async data => {
        if (!data) return;
        await openPrm;
        socket.send(valToJson(data));
      });
      session.endWith(routeBeforeConnect);
      
      openPrm.then(() => {
        
        routeBeforeConnect.end();
        let routeAfterConnect = session.tell.route(data => data && socket.send(valToJson(data)));
        session.endWith(routeAfterConnect);
        
      });
      
    });
    return server;
    
    
  }};
  
};
