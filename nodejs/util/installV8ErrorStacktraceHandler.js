// Make Errors better! (https://v8.dev/docs/stack-trace-api)
module.exports = () => Error.prepareStackTrace = (err, callSites) => {
  
  let trace = callSites.map(cs => {
    
    let file = cs.getFileName();
    if (!file || file.hasHead('node:')) return undefined;
    
    //Object.getOwnPropertyNames(Object.getPrototypeOf(cs)),
    
    return {
      type: 'line',
      fnName: cs.getFunctionName(),
      keepTerm: [ '', '[file]', ...cs.getFileName().split(/[/\\]+/) ].join('/'),
      row: cs.getLineNumber(),
      col: cs.getColumnNumber()
    };
    
  });
  
  return `>>>HUTTRACE>>>${JSON.stringify(trace)}<<<HUTTRACE<<<`;
  
};