'use strict';

module.exports = () => {
  
  if (process['~topLevelHandling']) throw Error('Top-level handling already set for process');
  process['~topLevelHandling'] = true;
  
  // https://nodejs.org/api/process.html#signal-events
  let processExitSrc = Src();
  process.exitNow = process.exit;
  process.exit = code => {
    process.explicitExit = true;
    
    let err = Error(`Process explicitly exited (${code})`);
    processExitSrc.route(() => gsc(err));
    processExitSrc.route(() => process.stdout.write('\u001b[0m'));
    return process.exitNow(code);
  };

  // NOTE: Trying to catch SIGKILL or SIGSTOP crashes posix!
  // https://github.com/nodejs/node-v0.x-archive/issues/6339
  let evts = 'hup,int,pipe,quit,term,tstp,break'.split(',');
  let haltEvts = Set('int,term,quit'.split(','));
  for (let evt of evts) process.on(`sig${evt}`.upper(), (...args) => {
    gsc(`Received event: "${evt}"`, args);
    haltEvts.has(evt) && process.exit(isForm(args[1], Number) ? args[1] : -1);
  });

  let onErr = err => {
    if (err['~suppressed']) return; // Ignore suppressed errors
    gsc(`Uncaught ${getFormName(err)}:`, err.desc());
    process.exitNow(1);
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  process.on('exit', code => processExitSrc.send(code));

  processExitSrc.route(code => process.explicitExit || gsc(`Hut terminated (code: ${code})`));

  return { processExitSrc };
  
};