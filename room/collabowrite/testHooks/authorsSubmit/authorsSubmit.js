global.rooms['collabowrite.testHooks.authorsSubmit'] = foundation => hut => {
  
  if (![ 'abe', 'bob' ].has(hut.uid)) return;
  
  let wait = (ms=250) => Promise(r => setTimeout(r, ms));
  let dbgPrm = wait();
  let run = null;
  
  if (hut.uid === 'abe') {
    
    run = Object.plain({
      login: act => act.act({ user: 'abe', pass: 'imsosmart' }),
      createRoom: act => act.act({ name: 'TEST', minAuthors: 2 }),
      //joinRoom: (act, uid) => act.act(),
      submit: act => (run.submit = null, act.act({ text: 'ABE SUBMISSION' }))
    });
    
    
  } else if (hut.uid === 'bob') {
    
    run = Object.plain({
      login: act => act.act({ user: 'bob', pass: 'imsosmart' }),
      joinRoom: (act, uid) => act.act(),
      submit: act => (run.submit = null, act.act({ text: 'BOB SUBMISSION' }))
    });
    
  }
  
  hut.actionCallback = act => {
    
    let [ pfx, n ] = act.name.split('.');
    let [ name, ...params ] = n.split('/');
    let runner = run[name];
    if (runner) dbgPrm = dbgPrm.then(wait).then(() => runner(act, params));
    
  };
  
};

  
