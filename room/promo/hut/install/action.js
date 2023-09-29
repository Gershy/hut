// Copies all necessary files from the Hut installation server:
async (res) => {
  
  let url = res.url;
  let pfx = url.split('/').at(-1).split('.')[0];
  
  let [ fs, http, path ] = [ 'fs', 'http', 'path' ].map(require);
  let hosting = url.split(/[?#]/)[0];
  let copy = async function*(local, remote, seen=new Set()) {
    
    let remoteStr = remote.join('/');
    if (seen.has(remoteStr)) return;
    seen.add(remoteStr);
    
    let url = `${hosting}?command=${pfx}.item&pcs=${remoteStr}`;
    let res = await new Promise(r => http.get(url, r));
    let chunks = []; res.on('data', d => chunks.push(d));
    await new Promise(r => res.on('end', r));
    
    let data = Buffer.concat(chunks);
    try {
      let children = JSON.parse(data);
      if (children?.constructor !== Array) throw Error('Sad');
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
    
    console.log('Installing hut to:', path.join(...local));
    let remote = [];
    for await (let p of copy(local, remote)) console.log(`Downloaded: [${[ ...local, ...p ].join('/')}]`);
    
    console.log([
      '',
      '=================================',
      'Installed hut! Try executing:',
      `> cd "${path.join(...local)}"`,
      '> node hut.js "internal.test.test1"',
      '================================='
    ].join('\n'));
    
  } catch (err) { console.log(`Couldn't install: ${err.message}`); }
  
};
