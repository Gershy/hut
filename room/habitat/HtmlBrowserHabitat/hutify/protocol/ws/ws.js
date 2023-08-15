global.rooms['habitat.HtmlBrowserHabitat.hutify.protocol.ws'] = () => ({ createServer: opts => {
  
  let { hid, netIden, netProc, compression } = opts;
  
  let server = Tmp({
    protocol: 'ws', netIden, netProc,
    desc: () => `ws${netIden.secureBits ? 's' : ''}://${netProc}`,
    src: Src(),
  });
  
  let session = (() => {
    
    let socket = new WebSocket(`${netIden.secureBits ? 'wss' : 'ws'}://${netProc}/?trn=sync&hid=${hid}`);
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
      subcon('warning')('Socket error event', err);
      
      // TODO: This interim solution is the WORST:
      window.location.reload();
    });
    
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
