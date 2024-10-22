'use strict';

module.exports = () => {
  
  if (process['~topLevelHandling']) throw Error('Top-level handling already set for process');
  process['~topLevelHandling'] = true;
  
  // https://nodejs.org/api/process.html#signal-events
  let processExitSrc = Src();
  processExitSrc.route(() => process.stdout.write('\u001b[0m'));
  
  process.exitNow = process.exit;
  process.exitSig = null;
  process.exit = code => {
    
    process.explicitExit = true;
    
    if (!process.exitSig) {
      let err = Error(`Process explicitly exited (${code})`);
      processExitSrc.route(() => gsc.say(err));
    }
    
    return process.exitNow(code);
    
  };

  // NOTE: Trying to catch SIGKILL or SIGSTOP crashes posix!
  // https://github.com/nodejs/node-v0.x-archive/issues/6339
  let evts = 'hup,int,pipe,quit,term,tstp,break'.split(',');
  let haltEvts = Set('int,term,quit'.split(','));
  for (let evt of evts) process.on(`sig${evt}`.upper(), (term, code) => {
    let expectedCode = isForm(code, Number);
    gsc.say(`Process received event "${term.lower()}" (code: ${code}${expectedCode ? '' : '??'})`);
    if (haltEvts.has(evt)) {
      process.exitSig = evt;
      process.exit(expectedCode ? code : -1);
    }
  });

  let onErr = err => {
    if (err['~suppressed']) return; // Ignore suppressed errors
    
    // TODO: This should be removed eventually!!
    if (err?.code === 'ECONNRESET') { gsc.say('Top-level ignore for ECONNRESET', { err });  return; }
    
    gsc.say(`Uncaught ${getFormName(err)}: ${err.desc()}`);
    process.exitNow(1);
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  process.on('exit', code => processExitSrc.send(code));

  processExitSrc.route(code => process.explicitExit || gsc.say(`Hut terminated (code: ${code})`));

  return { processExitSrc };
  
};
