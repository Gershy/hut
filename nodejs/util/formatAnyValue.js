'use strict';

let modMapping = {
  
  // https://stackoverflow.com/a/41407246/830905
  
  red:       '\u001b[31m',
  green:     '\u001b[32m',
  yellow:    '\u001b[33m',
  blue:      '\u001b[34m',
  
  subtle:    '\u001b[2m',
  
  bold:      '\u001b[1m',
  italic:    '\u001b[3;22m',
  underline: '\u001b[4;22m',
  
  rgbRed:    '\u001b[38;2;255;0;0m', // Must be "[38,2,R;G;Bm]" where R, G, B are 0-255 colour values
  
  reset:     '\u001b[0m'
  
};
let ansi = (str, modName) => {
  return str.split('\n').map(ln => `${modMapping[modName]}${ln}${modMapping.reset}`).join('\n')
};
let remAnsi = (str) => str.replace(/\u{1b}\[[^a-zA-Z]+[a-zA-Z]/ug, '');
let bolded = Map();
let bold = (str, b = bolded.get(str)) => b || (bolded.set(str, b = ansi(str, 'bold')), b);

let normalize = (val, opts={}, seen=Map()) => {
  // TODO: "normalizeAnyValue" behaviour should exist and be globally available
};

// Define `global.formatAnyValue`
let format = module.exports = (val, opts={}, d=0, pfx='', seen=Map()) => {
  
  // `opts.d` is the maximum depth; the "<limit>" indicator will be returned beyond it
  // `d` is the current depth
  // `opts.w` is the initial width
  // `pfx` is the string which will precede the first line of any output from this `format`
  // call; it should be considered in order to break excessively long lines
  
  let { ansiFn=ansi, indentSize=2, stringFormat='inline' } = opts;
  let pfxLen = pfx.length;
  
  if (val === undefined) return ansiFn('undefined', 'green');
  if (val === null) return ansiFn('null', 'green');
  
  if (isForm(val, Number)) return ansiFn(`${val}`, 'green');
  if (isForm(val, Boolean)) return ansiFn(val ? 'T' : 'F', 'green');
  if (isForm(val, Buffer)) return ansiFn(`Buffer { length: ${val.length} }`, 'green');
  
  if (isForm(val, String)) {
    
    // TODO: Copy-pasted from function formatted lower down
    let maxW = Math.max(8, opts.w - pfxLen - d * indentSize - 1); // Subtract 1 for the trailing ","
    
    let formatted = (() => {
      
      if (stringFormat === 'inline' || !val.has('\n')) {
        
        // The ascii range 0x0007 - 0x000f are nasty control characters which don't appear in most
        // terminals as exactly 1 inline character
        let inline = val.replaceAll('\n', '\\n').replaceAll(/[\u0007-\u000f]/g, '');
        if (inline.length > maxW) inline = inline.slice(0, maxW - 1) + '\u2026';
        return `'${inline}'`;
        
      } else if (stringFormat === 'multiline') {
        
        // Remove all nasty control chars, except "\n" (whose hex value, '\u000a', is the only gap
        // in the range defined by the following regex)
        let lines = val.replaceAll(/[\u0007-\u0009\u000b-\u000f]/g, '')
          .split('\n')
          .map(ln => ln.length <= maxW ? ln : (ln.slice(0, maxW - 1) + '\u2026'));
        return `"""\n${lines.join('\n')}\n"""`;
        
      }
      
    })();
    
    return ansiFn(formatted, 'green');
    
  }
  
  if (d > opts.d) return ansiFn('<limit>', 'red');
  
  if (seen.has(val)) return seen.get(val);
  
  if (Object.getPrototypeOf(val) === null) {
    
    seen.set(val, '<cyc> PlainObject(...)');
    let str = `PlainObject ${format({ ...val }, opts, d, 'PlainObject ', seen)}`;
    seen.set(val, str);
    return str;
    
  }
  
  if (isForm(val?.desc, Function)) {
    
    //try {
      let str = ansiFn(val.desc(), 'blue');
      seen.set(val, str);
      return str;
    //} catch (err) {
      // TODO: Ignore errors here? Or output them separately? Or allow them to propagate?
      //gsc.say(err.mod(msg => `Failed to format value with "desc" fn: ${msg}`));
      // Ignore any errors from calling `val.desc`
    //}
    
  }
  
  if (hasForm(val, Function)) {
    
    let str = 'Fn: ' + val.toString().split('\n').map(ln => ln.trim() ?? skip).join(' ').replace(/[ ]+/g, ' ');
    
    let maxW = Math.max(8, opts.w - pfxLen - d * indentSize - 1); // Subtract 1 for the trailing ","
    if (str.length > maxW) str = str.slice(0, maxW - 1) + '\u2026';
    
    str = ansiFn(str, 'blue');
    
    seen.set(val, str);
    return str;
    
  }
  
  if (isForm(val, Set)) {
    
    seen.set(val, '<cyc> Set(...)');
    let str = `Set ${format([ ...val ], opts, d, 'Set ', seen)}`;
    seen.set(val, str);
    return str;
    
  }
  
  if (isForm(val, Map)) {
    
    seen.set(val, '<cyc> Map(...)');
    let str = `Map ${format(Object.fromEntries(val), opts, d, 'Map ', seen)}`;
    seen.set(val, str);
    return str;
    
  }
  
  if (isForm(val, Object)) {
    
    if (val.empty()) return bold('{}');
    
    seen.set(val, '<cyc> { ... }');
    let keyLen = Math.max(...val.toArr((v, k) => k.length));
    let maxOneLineValueLen = opts.w - (d * indentSize) - (keyLen + 2); // Remove space from indentation and key; `+ 2` is for ": "
    
    let str = (() => {
      
      let formatted = val.map((v, k) => format(v, opts, d + 1, `${k.padTail(keyLen, ' ')}: `, seen));
      
      let oneLine = `${bold('{')} ${formatted.toArr((v, k) => `${k}${bold(':')} ${v}`).join(bold(',') + ' ')} ${bold('}')}`;
      
      let canOneLine = true
        && !oneLine.has('\n')
        && remAnsi(oneLine).length < maxOneLineValueLen;
      if (canOneLine) return oneLine;
      
      let multiLineItems = formatted.toArr((v, k) => {
        
        let paddingAmt = keyLen - k.length;
        let padding = '';
        if (paddingAmt) padding += ' ';
        padding += '-'.repeat(Math.max(paddingAmt - 1, 0));
        let paddedKey = k + ansiFn(padding, 'subtle');
        return `${paddedKey}${bold(':')} ${v}`;
        
      });
      
      // Using `Math.max` means there's no sorting preference for items less than 10 chars long
      let indentStr = ansiFn('\u00a6', 'subtle') + ' '.repeat(indentSize - 1);
      let multiLine = multiLineItems.valSort(v => {
        
        let noAnsi = remAnsi(v);
        let numLines = (noAnsi.match(/\n/g) ?? []).length + 1;
        
        // The first line of `noAnsi` embeds `keyLen` chars and ": "
        let numChars = noAnsi.length - (keyLen + ': '.length);
        if (numLines === 1 && numChars < 50) numChars = 50; // Avoid reordering short single-lines values
        
        return numChars * 1 + numLines * 7;
      })
        .map(v => v.indent(indentStr))
        .join(bold(',') + '\n')
      
      return `${bold('{')}\n${multiLine}\n${bold('}')}`;
      
    })();
    
    seen.set(val, str);
    return str;
    
  }
  
  if (isForm(val, Array)) {
    
    if (val.empty()) return bold('[]');
    
    seen.set(val, '<cyc> [ ... ]');
    
    let str = (() => {
      
      let formatted = val.map(v => format(v, opts, d + 1, '', seen));
      
      let oneLine = `${bold('[')} ${formatted.join(bold(',') + ' ')} ${bold(']')}`;
      let canOneLine = true
        && !oneLine.has('\n')
        && remAnsi(oneLine).length < (opts.w - d * indentSize);
      if (canOneLine) return oneLine;
      
      let indentStr = ansiFn('\u00a6', 'subtle') + ' '.repeat(indentSize - 1);
      let multiLine = formatted.map(v => v.indent(indentStr)).join(bold(',') + '\n');
      return `${bold('[')}\n${multiLine}\n${bold(']')}`;
      
    })();
    
    seen.set(val, str);
    return str;
    
  }
  
  let formName = getFormName(val);
  seen.set(val, `<cyc> ${formName}(...)`);
  let str = `${ansiFn(formName, 'blue')} ${format({ ...val }, opts, d, `${formName} `, seen)}`;
  seen.set(val, str);
  return str;
  
};
Object.assign(module.exports, { remAnsi });
