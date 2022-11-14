global.rooms['url'] = foundation => {
  
  let url = {
    
    defaultPorts: Object.plain({
      http: 80,
      https: 443,
      
      ws: 80,
      wss: 443,
      
      sokt: 80,
      sokts: 443,
    }),
    
    encode: ({ protocol, secure=false, address, port, target, fragment, query }) => {
      
      if (isForm(query, Object))
        query = query.toArr((v, k) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      
      if (!target) target = '';
      
      if (query && query[0] !== '?') query = '?' + query;
      if (query) target += query;
      
      if (fragment && fragment[0] !== '#') fragment = '#' + fragment;
      if (fragment) target += fragment;
      
      if (target && target[0] !== '/') target = '/' + target;
      
      let pfx = '';
      if (protocol) {
        
        if (secure) protocol += 's';
        pfx = (port !== url.defaultPorts[protocol])
          ? `${protocol}://${address}:${port}`
          : `${protocol}://${address}`;
        
      }
      
      return pfx + target;
      
    }
    
  };
  
  return url;
  
};
