'use strict';

require('../../room/setup/clearing/clearing.js');

module.exports = {
  
  defaultPorts: { http: 80, https: 443 },
  resolveAddr: (args={}) => {
    
    let { addr=null, proto=null, host=null, port=null, path=null }={} = args;
    
    if (addr) {
      
      [ addr, proto, host, port=null, path=null ] = addr
        .match(/^([a-zA-Z0-9-]+)[:][/][/]([a-zA-Z0-9.-]+)([:][0-9]+)?([/].*)?$/);
      
      if (port) port = parseInt(port.slice(1), 10);
      
    } else {
      
      if (proto === null) proto = 'http';
      if (path === null) path = '/';
      
    }
    
    if (port === null) port = module.exports.defaultPorts[proto];
    
    if (path === null) path = '';
    if (!path.hasHead('/')) path = `/${path}`;
    
    if (!proto) throw Error('null proto');
    if (!host) throw Error('null host');
    if (!port) throw Error('null port');
    
    addr = (port !== module.exports.defaultPorts[proto])
      ? `${proto}://${host}:${port}${path}`
      : `${proto}://${host}${path}`
    
    return [ addr, proto, host, port, path ];
    
  },
  query: async ({ addr, proto, host, port, path, method='get', headers={}, body=null, plainBody=null, ...more }={}) => {
    
    [ addr, proto, host, port, path ] = module.exports.resolveAddr({ addr, proto, host, port, path });
    
    // camelCase to Upper-Kebab-Case
    headers = headers
      .toArr((v, k) => [ k[0].upper() + k.slice(1).replace(/-/g, '').replace(/[A-Z]/g, '-$&'), v ])
      .toObj(v => v);
    
    let req = require(proto).request({ hostname: host, port, headers, method, path, ...more });
    
    let err = Error('');
    let resPrm = new Promise((rsv, rjc) => {
      req.on('response', rsv);
      req.on('error', cause => rjc(err.mod({ cause, msg: 'Failed to request' })));
    });
    
    if (body) req.write(body);
    req.end();
    
    let res = await resPrm;
    let chunks = [];
    res.on('data', d => chunks.push(d));
    
    await new Promise(r => res.on('end', r));
    
    body = Buffer.concat(chunks); // Use the same var for request and response; no problem with that!
    try         { body = serToVal(body); }
    catch (err) { body = body.toString('utf8'); }
    
    return {
      code: res.statusCode,
      message: res.statusMessage,
      headers: res.headers,
      body
    };
    
  }
  
};

/* FORM DATA ENCODING:
let { res, body } = await doReq({
  proto: 'http',
  host: 'localhost',
  port: 1000,
  path: '/app/systemservice/nexuspost/service.php',
  method: 'post',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=xxx'
  },
  body: {
    apikey: 'v:apikey',
    ccid: 'v:ccid',
    sessionid: 'v:sessionid',
    botname: 'v:botname',
    botengine: 'v:botengine',
    url: 'localhost:1000',
    useragent: 'chrome',
    webhookHeaders: 'v:webhookHeaders',
    webhookPayload: 'v:webhookPayload',
    varRecordingHandle: {
      fileName: 'file.txt',
      contentType: 'text/plain',
      data: 'v:varRecordingContents'
    }
  }.toArr((v, k) => {
    
    if (isForm(v, String)) {
      
      return [
        '--xxx',
        `Content-Disposition: form-data; name="${k}"`,
        '',
        v,
        ''
      ].join('\n');
      
    } else {
      
      let { fileName, contentType='application/octet-stream', data } = v;
      return [
        '--xxx',
        `Content-Disposition: form-data; name="${k}"; filename="${fileName}"`,
        `Content-Type: ${contentType}`,
        '',
        data
      ].join('\n')
      
    }
    
  }).join('')
});
*/
