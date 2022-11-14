// Copies all necessary files from the Hut installation server:
async hosting => {
  
  let [ fs, http, path ] = [ 'fs', 'http', 'path' ].map(require);
  hosting = hosting.split('?')[0];
  let copy = async function*(local, remote, seen=new Set()) {
    
    let remoteStr = remote.join('/');
    if (seen.has(remoteStr)) return;
    seen.add(remoteStr);
    
    let url = `${hosting}?command=stl.item&pcs=${remoteStr}`;
    let res = await new Promise(r => http.get(url, r));
    let chunks = []; res.on('data', d => chunks.push(d));
    await new Promise(r => res.on('end', r));
    
    let data = Buffer.concat(chunks);
    try {
      let children = serToVal(data);
      if (!children || children.constructor !== Array) throw Error('Sad');
      await fs.promises.mkdir(path.join(...local));
      for (let c of children) yield* copy([ ...local, c ], [ ...remote, c ]);
      yield remote;
    } catch (err) {
      yield remote;
      await fs.promises.writeFile(path.join(...local), data);
    }
    
  };
  
  try {
    
    let local = [ ...path.resolve('.').split(path.sep), 'hut' ];
    let stat = null;
    try { stat = await fs.promises.stat(path.join(...local)); } catch (err) {}
    if (stat) throw Error(`${local.join('/')} already exists!`);
    
    console.log('Installing hut to:', local);
    let remote = [];
    for await (let p of copy(local, remote)) console.log(`Fully copied: [${[ ...local, ...p ].join('/')}]`);
    
  } catch (err) { console.log(`Couldn't install: ${err.message}`); }
  
};
