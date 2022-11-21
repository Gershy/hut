'use strict';

let validComponentRegex = /^[a-zA-Z0-9!@][-a-zA-Z0-9!@._ ]*$/; // alphanum!@ followed by the same including ".", "-" (careful this guy in regexes), "_", and " "
let getUid = () => (Number.int32 * Math.random()).encodeStr(String.base32, 7);
let locks = Object.plain();
let fs = {
  
  ...require('fs').promises,
  createReadStream: require('fs').createReadStream,
  createWriteStream: require('fs').createWriteStream,
  
  getCmps: fp => {
    
    fp = (isForm(fp, Array) ? fp : [ fp ]).map(cmp => cmp.split(/[/\\]+/)).flat(1);
    return { cmps: fp, fp: path.resolve('/', ...fp) };
    
  },
  
  safeStat: (fp, opts) => fs.stat(fp, opts).fail(err => {
    
    if (err.code !== 'ENOENT') throw err; // Only tolerate ENOENT
    return null;
    
  }),
  safeMakeDir: (fp, opts) => fs.mkdir(fp, opts).fail(err => {
    
    if (err.code !== 'EEXIST') throw err; // Only tolerate EEXIST
    return null;
    
  }),
  getType: async (fp, opts) => {
    
    let stat = await fs.safeStat(fp, opts);
    if (stat === null) return null;
    if (stat.isFile()) return 'file';
    if (stat.isDirectory()) return 'dir';
    throw Error(`Non-file, non-dir: ${fp}`).mod({ stat });
    
  },
  swapFileToDir: async (fp, { tmpName=null, fileCmp=null, ...opts }={}) => {
    
    // We want a dir to replace an existing file (without reads on
    // that previously existing file to fail) - so we replace the
    // file with a directory containing a "default value file"
    
    await fs.rename(fp, tmpName);                     // Move file out of the way
    await fs.mkdir(fp, opts);                         // Replace file with directory
    await fs.rename(tmpName, path.join(fp, fileCmp)); // Set original file as "default value file"
    
  }
  
};

module.exports = rootFp => {
  
  rootFp = fs.getCmps(rootFp);
  
  
  
  
};


