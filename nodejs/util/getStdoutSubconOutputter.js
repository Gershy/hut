'use strict';

// Call this function once `global.conf` is available to:
// - have `global.subconParams` actually read from the Conf
// - have `global.subconOutput` perform real output

let vertDashChars = '166,124,33,9597,9599,9551,9483,8286,8992,8993,10650'.split(',').map(v => parseInt(v, 10).char());
let horzDashChars = '126,8212,9548,9148,9477'.split(',').map(v => parseInt(v, 10).char());
let junctionChars = '43,247,5824,9532,9547,9535,10775,10765,9533,9069,9178,11085'.split(',').map(v => parseInt(v, 10).char());
let vertDash = () => vertDashChars[Math.floor(Math.random() * vertDashChars.length)];
let horzDash = () => horzDashChars[Math.floor(Math.random() * horzDashChars.length)];
let junction = () => junctionChars[Math.floor(Math.random() * junctionChars.length)];

module.exports = (cfg={}) => {
  
  let outputter = (sc, ...args) => { // Stdout; check "chatter" then format and output
    
    let now = getDate();
    let { debug, relevantTraceIndex, leftColW, rightColW } = outputter;
    
    // TODO: Wrapping this in DEBUG does nothing; this file isn't compiled!
    let trace = (debug && sc.params().active) ? Error('trace').getInfo().trace : null;
    let params = sc.params();
    let { chatter=true, chatterFormat } = params;
    
    return thenAll(args.map(arg => isForm(arg, Function) ? arg(sc) : arg), args => {
      
      // Note that setting { chatter: false } disables any subcon except "gsc" and "warn"
      if (!chatter && ![ 'gsc', 'warn' ].has(sc.term)) return { params, args };
      
      if (chatterFormat) {
        // The subcon's "chatterFormat" param takes the argument arr and returns a new arr, or
        // `null` to silence this item
        args = eval(chatterFormat)(...args);
        if (args === null) return null;
        if (!isForm(args, Array)) args = [ args ];
      }
      
      let depth = 7;
      if (isForm(args[0], String) && /^[!][!][0-9]+$/.test(args[0])) {
        depth = parseInt(args[0].slice(2), 10);
        args = args.slice(1);
      }
      
      // Merge leading sequence of Strings, then leading sequence of Objects
      let rawArgs = args;
      let strs = [];
      let obj = {};
      let ind = 0;
      while (isForm(rawArgs[ind], String)) strs.push(rawArgs[ind++]);
      while (isForm(rawArgs[ind], String)) obj.merge(rawArgs[ind++]);
      args = [ ...(strs.empty() ? [] : [ strs.join(' ') ]), ...(obj.empty() ? [] : [ obj ]), ...rawArgs.slice(ind) ];
      
      let leftLns = [ `[${sc.term.slice(-leftColW)}]`, now ];
      let rightLns = args.map(v => {
        if (!isForm(v, String)) v = formatAnyValue(v, { d: depth, w: rightColW });
        return v.split(/\r?\n/);
      }).flat();
      
      /// {DEBUG=
      let call = trace?.[relevantTraceIndex];
      call = call?.file && `${token.dive(call.file).at(-1)} ${call.row}:${call.col}`;
      if (call) {
        let extraChars = call.length - leftColW;
        if (extraChars > 0) call = call.slice(extraChars + 1) + '\u2026';
        leftLns.push(call);
      }
      /// =DEBUG}
      
      let logStr = Math.max(leftLns.length, rightLns.length).toArr(n => {
        let l = (leftLns[n] || '').padTail(leftColW);
        let r = rightLns[n] || '';
        return l + vertDash() + ' ' + r;
      }).join('\n');
      
      let topLine = leftColW.toArr(horzDash).join('') + junction() + (1 + rightColW).toArr(horzDash).join('');
      console.log(topLine + '\n' + logStr);
      
      return { params, args };
      
    });
    
  };
  
  return Object.assign(outputter, { debug: true, relevantTraceIndex: 0, leftColW: 28, rightColW: 50, ...cfg });
  
};