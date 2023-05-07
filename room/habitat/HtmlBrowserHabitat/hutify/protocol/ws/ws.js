global.rooms['habitat.HtmlBrowserHabitat.hutify.protocol.ws'] = () => ({ createServer: opts => {
  
  let { hut, netIden, netProc, compression } = opts;
  
  let server = Tmp({
    protocol: 'ws', netIden, netProc,
    desc: () => `ws${netIden.secureBits ? 's' : ''}://${netProc}`,
    src: Src(),
  });
  
  let session = (() => {
    
    let socket = new WebSocket(`${netIden.secureBits ? 'wss' : 'ws'}://${netProc}/?trn=sync&hid=${hut.hid}`);
    socket.evt('error', err => subcon('warning')('Socket error event', err));
    
    let session = Tmp({ key: '!above', currentCost: () => 0.3, tell: Src(), hear: Src() });
    server.endWith(session, 'tmp');
    session.endWith(socket.evt('close', () => session.end()));
    
    let openPrm = Promise((rsv, rjc) => {
      socket.evt('open', rsv, { once: true });
      socket.evt('error', rjc, { once: true });
    });
    session.endWith(() => socket.close());
    
    socket.addEventListener('message', ({ data: msg /*, ...stuff */ }) => {
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
    
    return session;
    
  })();
  
  // Every Server immediately creates a Session with the AboveHut
  soon(() => server.src.send(session));
  
  return server;
  
}});
