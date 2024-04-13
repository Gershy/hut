'use strict';

require('../room/setup/clearing/clearing.js');

module.exports = async () => {
  
  // TODO: I think tests should be written modularly alongside the
  // files they correspond to, and FoundationNodejs can scan for
  // all such tests and run them all here!
  let rooms = await getRooms([
    'logic.MemSrc',
    'logic.MapSrc',
    'logic.SetSrc',
    'logic.ToggleSrc',
    'logic.BatchSrc',
    'logic.Chooser',
    'logic.Scope'
  ]);
  let { MemSrc, MapSrc, SetSrc, ToggleSrc, BatchSrc, Chooser, Scope } = rooms;
  
  let tests = [
    
    async m => { // Form inheritance
      
      let F1 = form({ name: 'F1', props: { init(){} } });
      let F2 = form({ name: 'F2', has: { F1 }, props: {} });
      let F3 = form({ name: 'F3', has: { F2 }, props: {} });
      
      for (let Form1 of [ F1, F2, F3 ]) { for (let Form2 of [ F1, F2, F3 ]) {
        if (Form1 === Form2) {
          if (!isForm(Form1(), Form2)) throw Error(`Fact ${Form2.name} should be of form ${Form1.name}`);
        } else {
          if (isForm(Form1(), Form2)) throw Error(`Fact ${Form2.name} shouldn't be of form ${Form1.name}`);
        }
      }}
      
      if (!hasForm(F1(), F1)) throw Error(`hasForm(F1(), F1) should be true`);
      if (hasForm(F1(), F2)) throw Error(`hasForm(F1(), F2) should be false`);
      if (hasForm(F1(), F3)) throw Error(`hasForm(F1(), F3) should be false`);
      
      if (!hasForm(F2(), F1)) throw Error(`hasForm(F2(), F1) should be true`);
      if (!hasForm(F2(), F2)) throw Error(`hasForm(F2(), F2) should be true`);
      if (hasForm(F2(), F3)) throw Error(`hasForm(F2(), F3) should be false`);
      
      if (!hasForm(F3(), F1)) throw Error(`hasForm(F3(), F1) should be true`);
      if (!hasForm(F3(), F2)) throw Error(`hasForm(F3(), F2) should be true`);
      if (!hasForm(F3(), F3)) throw Error(`hasForm(F3(), F3) should be true`);
      
      let G1 = form({ name: 'G1', props: { init(){} } });
      let G2 = form({ name: 'G2', has: { G1 } });
      
      let H1 = form({ name: 'H1', has: { F3, G1 }, props: { init(){} } });
      
      if (hasForm(F1(), G1)) throw Error(`hasForm(F1(), G1) should be false`);
      if (hasForm(F1(), G2)) throw Error(`hasForm(F1(), G2) should be false`);
      if (hasForm(F3(), G1)) throw Error(`hasForm(F3(), G1) should be false`);
      if (hasForm(F3(), G2)) throw Error(`hasForm(F3(), G2) should be false`);
      if (hasForm(F1(), H1)) throw Error(`hasForm(F1(), H1) should be false`);
      if (hasForm(F3(), H1)) throw Error(`hasForm(F3(), H1) should be false`);
      
      if (!hasForm(H1(), F1)) throw Error(`hasForm(H1(), F1) should be true`);
      if (!hasForm(H1(), F2)) throw Error(`hasForm(H1(), F2) should be true`);
      if (!hasForm(H1(), F3)) throw Error(`hasForm(H1(), F3) should be true`);
      
      if (!hasForm(H1(), G1)) throw Error(`hasForm(H1(), G1) should be true`);
      if (hasForm(H1(), G2)) throw Error(`hasForm(H1(), G2) should be false`);
      
    },
    
    async m => { // Number.prototype.toArr
      
      let arr = (10).toArr(v => v);
      if (!isForm(arr, Array)) throw Error(`Expected Array; got ${getFormName(arr)}`);
      if (arr.count() !== 10) throw Error(`Expected exactly 10 items; got ${arr.count()}`);
      
      for (let [ ind, val ] of arr.entries()) if (val !== ind) throw Error(`Expected ${ind} at position ${ind}; got ${val}`);
      
    },
    async m => { // Number.prototype.encodeStr
      
      for (let base = 2; base <= 30; base++) for (let i = 100; i < 120; i++) {
        let encodeNative = i.toString(base);
        let encodeHut = i.encodeStr(String.base64.slice(0, base));
        if (encodeNative !== encodeHut) throw Error(`Unexpected result for base: ${base}, value: ${i} (got ${encodeHut}, expected ${encodeNative})`);
      }
      
    },
    async m => { // Exotic numbers: NaN, +Infinity, -Infinity
      
      if (!(Infinity).isInteger()) throw Error('Infinity should be an int');
      if ((NaN).isInteger()) throw Error('NaN should not be int');
      
      // ... test Infinity.(toObj|toArr|each); expect a memory err? NAH.
      
      let nanArr = (NaN).toArr(v => v);
      if (!isForm(nanArr, Array)) throw Error('NaN.toArr should be []');
      if (!nanArr.empty()) throw Error('NaN.toArr should be []');
      
      let nanObj = (NaN).toObj(v => v);
      if (!isForm(nanObj, Object)) throw Error('NaN.toObj should be {}');
      if (!nanObj.empty()) throw Error('NaN.toObj should be {}');
      
      let cnt = 0;
      (NaN).each(() => cnt++);
      if (cnt !== 0) throw Error('NaN.each should execute 0 times');
      
      let spread = [ ...NaN ];
      if (!spread.empty()) throw Error('[ ...NaN ] should be []');
      
    },
    
    async m => { // String.prototype.cut
      
      let tests = [
        [ () => 'abc,def,ghi'       .cut(','),           [ 'abc', 'def,ghi' ] ],
        [ () => 'abc,def,ghi'       .cut(',', Infinity), [ 'abc', 'def', 'ghi' ] ],
        [ () => 'abc,def,ghi'       .cut(',', 1),        [ 'abc', 'def,ghi' ] ],
        [ () => 'a,def,ghi'         .cut(',', 1),        [ 'a', 'def,ghi' ] ],
        [ () => 'abc,d,efgh,ij'     .cut(',', 2),        [ 'abc', 'd', 'efgh,ij' ] ],
        [ () => 'abc,,d,,efgh,,ij'  .cut(',,', 2),       [ 'abc', 'd', 'efgh,,ij' ] ],
        [ () => ',,,'               .cut(',,'),          [ '', ',' ] ],
        [ () => ',,,'               .cut(',', Infinity), [ '', '', '', '' ] ],
        [ () => 'a,,,'              .cut(',', Infinity), [ 'a', '', '', '' ] ],
        [ () => ',a,,'              .cut(',', Infinity), [ '', 'a', '', '' ] ],
        [ () => ',,,a'              .cut(',', Infinity), [ '', '', '', 'a' ] ],
        [ () => ',,,a'              .cut(',', 1),        [ '', ',,a' ] ],
        [ () => ',,,a'              .cut(',', 2),        [ '', '', ',a' ] ],
        [ () => ','                 .cut(',', 0),        [ ',' ] ],
        [ () => ','                 .cut(',', 1),        [ '', '' ] ],
        [ () => ','                 .cut(',,'),          [ ',' ] ],
        [ () => ''                  .cut(',', 0),        [ '' ] ],
        [ () => ''                  .cut(',', 1),        [ '' ] ],
        [ () => 'a,b,c'             .cut(',', 0),        [ 'a,b,c' ] ]
      ];
      for (let [ fn, exp ] of tests) {
        
        let c = fn();
        let valid = true
          && c.length === exp.length
          && !c.seek((v, i) => v !== exp[i]).found;
        
        if (!valid) {
          let fnStr = fn.toString().replace(/ *[.]cut/, '.cut');
          throw Error(`${fnStr} gave ${valToSer(c)}; expected ${valToSer(exp)}`);
        }
        
      }
      
    },
    
    async m => { // num === num.encodeStr(...).encodeInt(...)
      
      let inds = function*() {
        for (let i = 0; i < 10; i++) yield i;
        for (let i = 100; i < 110; i++) yield i;
      };
      
      for (let base = 2; base <= 64; base++) for (let i of inds()) {
        
        let chrs = String.base64.slice(0, base);
        
        // Test being able to provide chrs, padLen to
        // Number.prototype.encodeStr in any order, and omitting
        // padLen entirely, and providing a non-0 padLen
        if (i !== i.encodeStr(chrs, 0   ).encodeInt(chrs)) throw Error(`Value ${i} not preserved (case 1)`);
        if (i !== i.encodeStr(0,    chrs).encodeInt(chrs)) throw Error(`Value ${i} not preserved (case 2)`);
        if (i !== i.encodeStr(chrs      ).encodeInt(chrs)) throw Error(`Value ${i} not preserved (case 3)`);
        if (i !== i.encodeStr(chrs, 5   ).encodeInt(chrs)) throw Error(`Value ${i} not preserved (case 4)`);
        if (i !== i.encodeStr(5,    chrs).encodeInt(chrs)) throw Error(`Value ${i} not preserved (case 5)`);
        
      }
      
    },
    
    async m => { // Array.prototype.(all|any)
      
      let allTests = [
        [ [ 1, 2, 3, 4 ],     [],               true ],
        [ [ 0, 1, 2, 3 ],     [ n => n > -5 ],  true ],
        [ [ 1, 1, 1, 7 ],     [ n => n > 3 ],   false ],
        [ [ 0, 1, 2, 3 ],     [],               false ],
        [ [ 10, 11, 12, 13 ], [ n => n <= 12 ], false ]
      ];
      for (let [ arr, args, result ] of allTests) {
        if (result !== arr.all(...args)) throw Error(`Unexpected result for Array.prototype.all`).mod({ obj, args, result });
      }
      
      let anyTests = [
        [ [ 0, null, NaN, true ],  [],               true ],
        [ [ 0, null, NaN, false ], [],               false ],
        [ [ 0, 1, 2, 3 ],          [ n => n === 1 ], true ],
        [ [ 0, 0, 0, 0, 0 ],       [],               false ],
        [ [ 10, 11, 12, 13 ],      [ n => n === 0 ], false ]
      ];
      for (let [ arr, args, result ] of anyTests) {
        if (result !== arr.any(...args)) throw Error(`Unexpected result for Array.prototype.any`);
      }
      
    },
    
    async m => { // Promise.all({ ... })
      let prms = {
        thing1: 'hi',
        thing2: Promise(r => setTimeout(() => r('ha'), 0)),
        thing3: 'yo',
        thing4: Promise(r => soon(() => r('69')))
      };
      let { thing1, thing2, thing3, thing4, ...more } = await Promise.all(prms);
      
      if (thing1 !== 'hi') throw Error(`Invalid "thing1"`);
      if (thing2 !== 'ha') throw Error(`Invalid "thing3"`);
      if (thing3 !== 'yo') throw Error(`Invalid "thing2"`);
      if (thing4 !== '69') throw Error(`Invalid "thing4"`);
      if (!more.empty()) throw Error(`allObj resulted in unexpected values`);
    },
    
    async m => { // Function.prototype.bound
      
      let f = (a, b, c, d) => a + b + c + d;
      let f1 = f.bound(1);
      let f2 = f1.bound(2);
      let f3 = f2.bound(4);
      
      if (f3(8) !== 15) throw Error(`Bounding function didn't curry params as expected`);
      
    },
    
    async m => { // Ending a Tmp changes the results of getter methods
      let tmp = Tmp();
      if (!tmp.onn()) throw Error(`getPosActive() === false before setInactive()`);
      if (tmp.off()) throw Error(`getNegActive() === true before setInactive()`);
      tmp.end();
      if (tmp.onn()) throw Error(`getPosActive() === true after setInactive()`);
      if (!tmp.off()) throw Error(`getNegActive() === false after setInactive()`);
    },
    async m => { // Tmps linked to end with each other stay alive
      let tmp1 = Tmp();
      let tmp2 = Tmp();
      tmp1.endWith(tmp2);
      tmp2.endWith(tmp1);
      if (tmp1.off()) throw Error(`Tmp #1 ended for no reason`);
      if (tmp2.off()) throw Error(`Tmp #2 ended for no reason`);
    },
    async m => { // Tmps linked to end with each other end correctly #1
      let tmp1 = Tmp();
      let tmp2 = Tmp();
      tmp1.endWith(tmp2);
      tmp2.endWith(tmp1);
      tmp1.end();
      if (tmp1.onn()) throw Error(`Tmp #1 still onn after ended`);
      if (tmp2.onn()) throw Error(`Tmp #2 didn't end with Tmp #1`);
    },
    async m => { // Tmps linked to end with each other end correctly #2
      let tmp1 = Tmp();
      let tmp2 = Tmp();
      tmp1.endWith(tmp2);
      tmp2.endWith(tmp1);
      tmp2.end();
      if (tmp1.onn()) throw Error(`Tmp #1 didn't end with Tmp #2`);
      if (tmp2.onn()) throw Error(`Tmp #2 still onn after ended`);
    },
    async m => { // Tmps with refs end appropriately #1
      
      let tmp = Tmp();
      tmp.hold();
      tmp.end();
      if (tmp.off()) throw Error(`Tmp was referenced then ended, but was off (it should take end x 2 to end a Tmp held once)`);
      
    },
    async m => { // Tmps with refs end appropriately #2
      
      let tmp = Tmp();
      tmp.hold();
      tmp.end();
      tmp.end();
      if (tmp.onn()) throw Error(`Tmp was referenced then ended twice, but was onn (hold x 1 + end x 2 should end the Tmp)`);
      
    },
    async m => { // Tmps with refs end appropriately #3
      
      let tmp = Tmp();
      tmp.hold();
      tmp.hold();
      tmp.end();
      tmp.end();
      if (tmp.off()) throw Error(`Tmp referenced twice, ended twice, but was off (it should take end x 3 to end a Tmp held twice)`);
      
    },
    async m => { // Tmps with refs end appropriately #4
      
      let tmp = Tmp();
      for (let i = 0; i < 10; i++) tmp.hold();
      for (let i = 0; i < 11; i++) tmp.end();
      if (tmp.onn()) throw Error(`Tmp was referenced x 10, ended x 11, but was onn`);
      
    },
    async m => { // Tmps with refs end appropriately #5
      
      let tmp = Tmp();
      for (let i = 0; i < 10; i++) tmp.hold();
      for (let i = 0; i < 10; i++) tmp.end();
      if (tmp.off()) throw Error(`Tmp was referenced x 10, ended x 10, but was off`);
      
    },
    async m => { // Send 0 events correctly
      
      let src = Src();
      let events = [];
      src.route(val => events.push(val));
      if (events.count() !== 0) throw Error(`Expected exactly 0 events; got ${events.count()}`);
      
    },
    async m => { // Ensure single undefined value is sent correctly
      
      let src = Src();
      let events = [];
      src.route(val => events.push(val));
      src.send();
      if (events.count() !== 1) throw Error(`Expected exactly 1 event; got ${events.count()}`);
      
    },
    async m => { // Send 3 events correctly
      
      let src = Src();
      let events = [];
      src.route(val => events.push(val));
      for (let v of [ 1, 'hah', 3 ]) src.send(v);
      if (events.count() !== 3) throw Error(`Expected exactly 3 events; got ${events.count()}`);
      if (events[0] !== 1)      throw Error(`Received wrong value @ ind 0; expected 1, got ${events[0]}`);
      if (events[1] !== 'hah')  throw Error(`Received wrong value @ ind 1; expected "hah", got ${events[1]}`);
      if (events[2] !== 3)      throw Error(`Received wrong value @ ind 2; expected 3, got ${events[2]}`);
      
    },
    async m => { // Disabling route prevents function being called
      
      let src = Src();
      let events = [];
      let route = src.route(val => events.push(val));
      route.end();
      for (let v of [ 1, 'hah', 3 ]) src.send(v);
      if (events.count() !== 0) throw Error(`Expected 0 results; got ${events.count()}`);
      
    },
    async m => { // Inactive event sent when function applied before setInactive()
      
      let tmp = Tmp();
      let gotInactiveEvent = false;
      tmp.route(() => gotInactiveEvent = true);
      tmp.end();
      if (!gotInactiveEvent) throw Error(`No inactive event after setInactive()`);
      
    },
    async m => { // Inactive event sent when function applied after setInactive() (immediate setInactive)
      
      let tmp = Tmp();
      tmp.end();
      let gotInactiveEvent = false;
      tmp.route(() => gotInactiveEvent = true);
      if (!gotInactiveEvent) throw Error(`No inactive event after setInactive()`);
      
    },
    async m => { // Inactive event not sent when removed; function applied before setInactive()
      
      let tmp = Tmp();
      let gotInactiveEvent = false;
      let runFunctionOnEvent = tmp.route(() => gotInactiveEvent = true);
      runFunctionOnEvent.end();
      tmp.end();
      if (gotInactiveEvent) throw Error(`Invaled inactive event after setInactive()`);
      
    },
    
    /* TODO: Need tests for MapSrc
    async m => { // Src(...).map #1
      
      let src1 = Src();
      let src2 = src1.map(v => v + 5);
      
      let evts = [];
      src2.route(val => evts.push(val));
      
      src1.send(10);
      src1.send(20);
      src1.send(30);
      
      src2.route(() => evts.push('after')); // This route shouldn't get called!
      
      if (evts.length !== 3) throw Error('Expected 3 events');
      if (evts[0] !== 15) throw Error('1st event should be 15');
      if (evts[1] !== 25) throw Error('2nd event should be 25');
      if (evts[2] !== 35) throw Error('3rd event should be 25');
      
    },
    async m => { // Src(...).map #2
      
      let src1 = Src();
      let src2 = src1.map(v => (v & 1) ? skip : (33 + v));
      
      let evts = [];
      src2.route(val => evts.push(val));
      
      for (let n of 10) src1.send(n);
      
      if (evts.length !== 5) throw Error('Expected 5 events');
      for (let n of 5) if (evts[n] !== n * 2 + 33) throw Error(`Invalid value at index ${n}: expected ${n * 2 + 33}; got ${evts[n]}`);
      
    },
    async m => { // MemSrc.PrmM(...).map
      
      let src1 = MemSrc.PrmM();
      let src2 = src1.map(v => v + 5);
      
      let evts = [];
      src2.route(val => evts.push(val));
      
      src1.mod(10);
      src1.mod(20);
      src1.mod(30);
      
      if (evts.length !== 3) throw Error('Expected 3 events');
      if (evts[0] !== 15) throw Error('1st event should be 15');
      if (evts[1] !== 25) throw Error('2nd event should be 25');
      if (evts[2] !== 35) throw Error('3rd event should be 35');
      
      src2.route(val => evts.push(val));
      
      if (evts.length !== 6) throw Error('Expected 6 events');
      if (evts[3] !== 15) throw Error('4th event should be 15');
      if (evts[4] !== 25) throw Error('5th event should be 25');
      if (evts[5] !== 35) throw Error('6th event should be 35');
      
      src1.mod(0);
      if (evts.length !== 8) throw Error('Expected 8 events');
      if (evts[6] !== 5) throw Error('7th event should be 5');
      if (evts[7] !== 5) throw Error('8th event should be 5');
      
      src2.end();
      
      src1.mod(100);
      src1.mod(200);
      src1.mod(400);
      src1.mod(800);
      src1.mod(1600);
      src1.mod(3200);
      
      if (evts.length !== 8) throw Error('Expected 8 events'); // No changes expected since Src.Mapped ended
      
    },
    */
    
    /* TODO: MemSrc tests! (should be minimal)
    async m => { // MemSrc.Tmp1 sends value
      
      let src = MemSrc.Tmp1();
      let sends = [];
      src.route(v => sends.push(v));
      src.mod(Tmp());
      if (sends.count() !== 1) throw Error(`Expected exactly 1 send; got ${sends.count()}`);
      
    },
    async m => { // MemSrc.Tmp1 sends multiple Tmps, one at a time
      
      let src = MemSrc.Tmp1();
      let sends = [];
      src.route(v => sends.push(v));
      src.mod(Tmp());
      src.mod(Tmp());
      if (sends.count() !== 2) throw Error(`Expected exactly 2 sends; got ${sends.count()}`);
      
    },
    
    async m => { // MemSrc.TmpM handles add-route-while-sending edge-case
      
      let src = MemSrc.TmpM();
      let n = 0;
      let fn = () => n++;
      src.route(() => src.route(fn));
      src.mod(Tmp());
      
      if (n !== 1) throw Error(`MemSrc.TmpM breaks under edge-case; expected 1 call to route fn; got ${n}`);
      
    },
    async m => { // MemSrc.Tmp1 handles add-route-while-sending edge-case
      
      let src = MemSrc.Tmp1();
      let n = 0;
      let fn = () => n++;
      src.route(() => src.route(fn));
      src.mod(Tmp());
      
      if (n !== 1) throw Error(`MemSrc.Tmp1 breaks under edge-case; expected 1 call to route fn; got ${n}`);
      
    },
    async m => { // MemSrc.TmpM handles more difficult add-route-while-sending edge-case
      
      let src = MemSrc.TmpM();
      let n = 0;
      let fn = () => n++;
      src.route(() => src.route(() => src.route(fn)));
      src.mod(Tmp());
      
      if (n !== 1) throw Error(`MemSrc.TmpM breaks under edge-case; expected 1 call to route fn; got ${n}`);
      
    },
    async m => { // MemSrc.Tmp1 handles more difficult add-route-while-sending edge-case
      
      let src = MemSrc.Tmp1();
      let n = 0;
      let fn = () => n++;
      src.route(() => src.route(() => src.route(fn)));
      src.mod(Tmp());
      
      if (n !== 1) throw Error(`MemSrc.Tmp1 breaks under edge-case; expected 1 call to route fn; got ${n}`);
      
    },
    */
    
    /* TODO: Write proper MapSrc tests! (And BatchSrc, ToggleSrc, etc!)
    
    ...[ MapSrc.Prm1, MapSrc.PrmM ].map(MapSrcCls => [
      async m => { // MapSrc fn doesn't run if no child has event
        
        let srcs = (5).toArr(() => Src());
        let events = [];
        let fnSrc = MapSrcCls(srcs, (...args) => events.push(args));
        if (events.count() !== 0) throw Error(`Expected exactly 0 events; got ${events.count()}`);
        
      },
      async m => { // MapSrc fn only runs when all Srcs have sent
        
        let srcs = (5).toArr(() => Src());
        let events = [];
        let fnSrc = MapSrcCls(srcs, (...args) => events.push(args));
        
        for (let i = 0; i < 3; i++) srcs[0].send(null);
        for (let i = 0; i < 6; i++) srcs[1].send(null);
        for (let i = 0; i < 2; i++) srcs[2].send(null);
        for (let i = 0; i < 1; i++) srcs[3].send(null);
        
        for (let i = 0; i < 9; i++) srcs[4].send(null);
        
        if (events.count() !== 9) throw Error(`Expected exactly 9 events; got ${events.count()}`);
        
      },
      async m => { // MapSrc fn only runs when all Srcs have sent
        
        let srcs = (5).toArr(() => Src());
        let events = [];
        let fnSrc = MapSrcCls(srcs, (...args) => events.push(args));
        
        for (let i = 0; i < 3; i++) srcs[0].send();
        for (let i = 0; i < 6; i++) srcs[1].send();
        for (let i = 0; i < 1; i++) srcs[3].send();
        for (let i = 0; i < 9; i++) srcs[4].send();
        
        for (let i = 0; i < 7; i++) srcs[2].send();
        
        if (events.count() !== 7) throw Error(`Expected exactly 7 events; got ${events.count()}`);
        
      },
      async m => { // MapSrc sends values as expected
        
        let srcs = (3).toArr(() => Src());
        let events = [];
        let fnSrc = MapSrcCls(srcs, (...args) => args);
        fnSrc.route(val => events.push(val));
        for (let i = 0; i < 5; i++) srcs[0].send('hee');
        for (let i = 0; i < 9; i++) srcs[1].send('haa');
        for (let i = 0; i < 6; i++) srcs[2].send('hoo');
        
        if (events.count() !== 6) throw Error(`Expected exactly 6 events; got ${events.count()}`);
        if (events.seek(evt => !isForm(evt, Array)).found) throw Error(`All events should be Array`);
        
        let lastEvent = events.slice(-1)[0];
        if (lastEvent.count() !== 3) throw Error(`Event should have 3 items (because there are 3 Srcs)`);
        if (lastEvent[0] !== 'hee') throw Error(`1st item should be "hee"`);
        if (lastEvent[1] !== 'haa') throw Error(`1st item should be "haa"`);
        if (lastEvent[2] !== 'hoo') throw Error(`1st item should be "hoo"`);
        
      },
      async m => { // MapSrc events have correct values
        
        let src1 = Src();
        let src2 = Src();
        let events = [];
        let last = 0;
        let fnSrc = MapSrcCls([ src1, src2 ], (v1, v2) => { events.push([ v1, v2, last ]); return last++; });
        
        src2.send('src2val1');
        src1.send('src1val1');
        src2.send('src2val2');
        src1.send('src1val2');
        src1.send('src1val3');
        
        if (events.count() !== 4) throw Error(`Expected exactly 4 results; got ${events.count()}`);
        
        [ [ 'src1val1', 'src2val1', 0 ],
          [ 'src1val1', 'src2val2', 1 ],
          [ 'src1val2', 'src2val2', 2 ],
          [ 'src1val3', 'src2val2', 3 ] ]
        .each((vals, ind1) => vals.each((v, ind2) => {
          if (events[ind1][ind2] !== v) throw Error(`events[${ind1}][${ind2}] should be ${v} (got ${events[ind1][ind2]})`);
        }));
        
      },
    ]).flat(Infinity),
    
    async m => { // MapSrc.Prm1 only sends once, for multiple src sends, if value is always the same
      
      let srcs = (3).toArr(() => Src());
      let fnSrc = MapSrc.Prm1(srcs, (...args) => args.join(','));
      let events = [];
      fnSrc.route(v => events.push(v));
      
      for (let i = 0; i < 5; i++) srcs[0].send('yo');
      for (let i = 0; i < 6; i++) srcs[1].send('ha');
      for (let i = 0; i < 7; i++) srcs[2].send('hi');
      
      if (events.count() !== 1) throw Error(`Expected exactly 1 event; got ${events.count()}`);
      
      fnSrc.end();
      
    },
    async m => { // MapSrc.Prm1 gets MemSrc vals as expected
      
      let srcs = (3).toArr(() => MemSrc('a'));
      let fnSrc = MapSrc.Prm1(srcs, (s1, s2, s3) => [ s1, s2, s3 ]);
      let results = [];
      fnSrc.route(v => results.push(v));
      
      srcs[1].mod('b');
      srcs[1].mod('a');
      srcs[1].mod('b');
      srcs[2].mod('b');
      srcs[2].mod('b'); // Should be ignored!
      srcs[1].mod('b'); // Should be ignored!
      srcs[0].mod('a'); // Should be ignored!
      srcs[0].mod('b');
      srcs[1].mod('a');
      
      let expected = [
        [ 'a', 'a', 'a' ],
        [ 'a', 'b', 'a' ],
        [ 'a', 'a', 'a' ],
        [ 'a', 'b', 'a' ],
        [ 'a', 'b', 'b' ],
        [ 'b', 'b', 'b' ],
        [ 'b', 'a', 'b' ]
      ];
      if (expected.count() !== results.count()) throw Error(`Expected exactly ${expected.count()} results; got ${results.count()}`);
      expected.each(([ e1, e2, e3 ], i) => {
        
        let [ r1, r2, r3 ] = results[i];
        if (e1 !== r1 || e2 !== r2 || e3 !== r3) throw Error(`Mismatch on row ${i}; expected [ ${e1}, ${e2}, ${e3} ]; got [ ${r1}, ${r2}, ${r3} ]`);
        
      });
      
      srcs.each(src => src.end());
      fnSrc.end();
      
    },
    async m => { // MapSrc.Prm1 gets Chooser vals as expected
      
      let choosers = (3).toArr(() => Chooser([ 'a', 'b' ]));
      let fnSrc = MapSrc.Prm1(choosers, (s1, s2, s3) => [ s1, s2, s3 ]);
      let results = [];
      fnSrc.route(v => results.push(v));
      
      choosers[1].choose('b');
      choosers[1].choose('a');
      choosers[1].choose('b');
      choosers[2].choose('b');
      choosers[2].choose('b'); // Should be ignored!
      choosers[1].choose('b'); // Should be ignored!
      choosers[0].choose('a'); // Should be ignored!
      choosers[0].choose('b');
      choosers[1].choose('a');
      
      let expected = [
        [ 'a', 'a', 'a' ],
        [ 'a', 'b', 'a' ],
        [ 'a', 'a', 'a' ],
        [ 'a', 'b', 'a' ],
        [ 'a', 'b', 'b' ],
        [ 'b', 'b', 'b' ],
        [ 'b', 'a', 'b' ]
      ];
      if (expected.count() !== results.count()) throw Error(`Expected exactly ${expected.count()} results; got ${results.count()}`);
      expected.each(([ e1, e2, e3 ], i) => {
        
        let [ r1, r2, r3 ] = results[i];
        if (e1 !== r1 || e2 !== r2 || e3 !== r3) throw Error(`Mismatch on row ${i}; expected [ ${e1}, ${e2}, ${e3} ]; got [ ${r1}, ${r2}, ${r3} ]`);
        
      });
      
      choosers.each(chooser => chooser.end());
      fnSrc.end();
      
    },
    async m => { // MapSrc.Tmp1 only sends once, for multiple src sends, if value is always the same Tmp
      
      let srcs = (3).toArr(() => Src());
      let tmppp = Tmp();
      let fnSrc = MapSrc.Tmp1(srcs, (v1, v2, v3, tmp=tmppp) => tmp);
      let events = [];
      fnSrc.route(v => events.push(v));
      
      for (let i = 0; i < 20; i++) srcs[0].send('yo');
      for (let i = 0; i < 35; i++) srcs[1].send('ha');
      for (let i = 0; i < 60; i++) srcs[2].send('hi');
      
      if (events.count() !== 1) throw Error(`Expected exactly 1 event; got ${events.count()}`);
      if (events[0] !== tmppp) throw Error(`Single send had unexpected value`);
      
    },
    async m => { // MapSrc.Tmp1 Tmp value ends when MapSrc ends
      
      let src = Src();
      let tmppp = Tmp();
      let fnSrc = MapSrc.Tmp1([ src ], (v, tmp=tmppp) => tmp);
      src.send('whee');
      
      if (tmppp.off()) throw Error(`Tmp ended too early`);
      fnSrc.end();
      if (tmppp.onn()) throw Error(`Tmp didn't end with MapSrc`);
      
    },
    async m => { // MapSrc.Tmp1 sending ends any previous Tmp sent by same MapSrc
      
      let srcs = [ Src(), Src() ];
      let tmps = [ Tmp(), Tmp(), Tmp() ];
      let fnSrc = MapSrc.Tmp1(srcs, (src1Val, src2Val) => tmps[src2Val]);
      
      srcs[0].send('hello');
      
      srcs[1].send(1);
      if (tmps[1].off()) throw Error(`Tmp ended too early`);
      
      srcs[1].send(0);
      if (tmps[1].onn()) throw Error(`Tmp didn't end`);
      if (tmps[0].off()) throw Error(`Tmp ended too early`);
      
      srcs[1].send(2);
      if (tmps[0].onn()) throw Error(`Tmp didn't end`);
      if (tmps[2].off()) throw Error(`Tmp ended too early`);
      
      srcs[1].send(null);
      if (tmps[2].onn()) throw Error(`Tmp didn't end`);
      
    },
    */
   
    async m => { // ToggleSrc basics
      
      // TODO...
      let src = Src();
      let ts = ToggleSrc(src);
      
    },
    
    async m => { // MapSrc basics
      
      // TODO...
      let src = Src();
      let ms = MapSrc(src, v => v);
      
    },
    
    async m => { // BatchSrc with obj basics
      
      // TODO...
      let src1 = Src();
      let src2 = Src();
      let src3 = Src();
      let bs = BatchSrc({ src1, src2, src3 });
      
    },
    
    async m => { // BatchSrc with arr basics
      
      // TODO...
      let src1 = Src();
      let src2 = Src();
      let src3 = Src();
      let bs = BatchSrc([ src1, src2, src3 ]);
      
    },
    
    async m => { // Scope basics
      
      let src1 = Src();
      let tmpsGot = [];
      let scp = Scope(src1, (tmp1, dep) => {
        tmpsGot.push(tmp1);
        dep.scp(tmp1.src1, (tmp11, dep) => tmpsGot.push(tmp11));
        dep.scp(tmp1.src2, (tmp12, dep) => tmpsGot.push(tmp12));
      });
      
      let tmpsSent = [];
      for (let i = 0; i < 2; i++) {
        let tmp1 = Tmp();
        tmp1.src1 = Src();
        tmp1.src2 = Src();
        
        tmpsSent.push(tmp1); src1.send(tmp1);
        
        let tmp11 = Tmp(), tmp12 = Tmp();
        
        tmpsSent.push(tmp11); tmp1.src1.send(tmp11);
        tmpsSent.push(tmp12); tmp1.src2.send(tmp12);
      }
      
      if (tmpsSent.count() !== tmpsGot.count()) throw Error(`Sent ${tmpsSent.count} Tmps, but got ${tmpsGot.count()}`);
      for (let i = 0; i < tmpsSent.count(); i++)
        if (tmpsSent[i] !== tmpsGot[i]) throw Error(`Tmps arrived out of order`);
      
    },
    async m => { // Deps end when Scope ends
      
      let depTmps = []
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        depTmps = (5).toArr(() => dep(Tmp()));
      });
      src.send(Tmp());
      scp.end();
      
      if (depTmps.count() !== 5) throw Error(`Scope never ran`);
      if (depTmps.seek(tmp => !isForm(tmp, Tmp)).found) throw Error(`Not all sends resulted in Tmps`);
      if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when Scope ended`);
      
    },
    async m => { // Deps end when parent Scope ends
      
      let depTmps = [];
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        dep.scp(tmp.src, (tmp, dep) => depTmps = (5).toArr(() => dep(Tmp())));
      });
      let tmp = Tmp();
      tmp.src = Src();
      src.send(tmp);
      tmp.src.send(Tmp());
      scp.end();
      
      if (depTmps.count() !== 5) throw Error(`Scope never ran`);
      if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when parent Scope ended`);
      
    },
    async m => { // Deps end when Tmp ends, multi, one at a time
      
      let depTmps = [];
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        depTmps = (5).toArr(() => dep(Tmp()));
      });
      
      for (let i = 0; i < 5; i++) {
        let tmp = Tmp();
        src.send(tmp);
        if (depTmps.count() !== 5) throw Error(`Scope never ran`);
        if (depTmps.seek(tmp => tmp.off()).found) throw Error(`Dep ended too early`);
        tmp.end();
        if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when Tmp ended`);
      }
      
    },
    async m => { // Deps end when Tmp ends, multi, all at once
      
      let depTmpsArr = [];
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        depTmpsArr.push((5).toArr(() => dep(Tmp())));
      });
      
      let tmps = (5).toArr(() => { let tmp = Tmp(); src.send(tmp); return tmp; });
      if (depTmpsArr.count() !== 5) throw Error('What??');
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.count() !== 5) throw Error(`Scope never ran`);
        if (depTmps.seek(tmp => tmp.off()).found) throw Error(`Dep ended too early`);
      }
      
      for (let tmp of tmps) tmp.end();
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when Tmp ended`);
      }
      
    },
    async m => { // Deps end when Scope ends, multi, all at once
      
      let depTmpsArr = [];
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        depTmpsArr.push((5).toArr(() => dep(Tmp())));
      });
      
      let tmps = (5).toArr(() => { let tmp = Tmp(); src.send(tmp); return tmp; });
      if (depTmpsArr.count() !== 5) throw Error('What??');
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.count() !== 5) throw Error(`Scope never ran`);
        if (depTmps.seek(tmp => tmp.off()).found) throw Error(`Dep ended too early`);
      }
      
      scp.end();
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when Tmp ended`);
      }
      
    },
    async m => { // Deps end when nested Scope ends, multi, all at once
      
      let depTmpsArr = [];
      let src = Src();
      let scp = Scope(src, (tmp, dep) => {
        dep.scp(tmp.src, (tmp, dep) => {
          depTmpsArr.push((5).toArr(() => dep(Tmp())));
        });
      });
      
      let tmps = (5).toArr(() => {
        let tmp = Tmp();
        tmp.src = Src();
        src.send(tmp);
        tmp.src.send(Tmp());
        return tmp;
      });
      if (depTmpsArr.count() !== 5) throw Error('What??');
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.count() !== 5) throw Error(`Scope never ran`);
        if (depTmps.seek(tmp => tmp.off()).found) throw Error(`Dep ended too early`);
      }
      
      scp.end();
      
      for (let depTmps of depTmpsArr) {
        if (depTmps.seek(tmp => tmp.onn()).found) throw Error(`Not all Deps ended when Tmp ended`);
      }
      
    },
    async m => { // Scope hooks are propagated to subscopes
      
      let src1 = Src();
      let src2 = Src();
      let src3 = Src();
      
      let scp1 = null;
      let scp2 = null;
      let scp3 = null;
      scp1 = Scope(src1, { a: 1, b: 2 }, (tmp, dep) => {
        scp2 = dep.scp(src2, { c: 3 }, (tmp, dep) => {
          scp3 = dep.scp(src3, { e: 5 }, (tmp, dep) => {});
        });
      });
      
      src1.send(Tmp());
      if (!scp1.hooks.has('a')) throw Error('Scope 1 should have hook "a"');
      if (!scp1.hooks.has('b')) throw Error('Scope 1 should have hook "b"');
      if (scp1.hooks.has('c')) throw Error('Scope 1 should not have hook "c"');
      if (scp1.hooks.has('e')) throw Error('Scope 1 should not have hook "e"');
      
      src2.send(Tmp());
      if (!scp2.hooks.has('a')) throw Error('Scope 2 should have hook "a"');
      if (!scp2.hooks.has('b')) throw Error('Scope 2 should have hook "b"');
      if (!scp2.hooks.has('c')) throw Error('Scope 2 should have hook "c"');
      if (scp2.hooks.has('e')) throw Error('Scope 2 should not have hook "e"');
      
      src3.send(Tmp());
      if (!scp3.hooks.has('a')) throw Error('Scope 3 should have hook "a"');
      if (!scp3.hooks.has('b')) throw Error('Scope 3 should have hook "b"');
      if (!scp3.hooks.has('c')) throw Error('Scope 3 should have hook "c"');
      if (!scp3.hooks.has('e')) throw Error('Scope 3 should have hook "e"');
      
    },
    async m => { // Scope works with hooks.processArgs
      
      let src1 = Src();
      let src2 = Src();
      let src3 = Src();
      
      let scp1 = null;
      let scp2 = null;
      let scp3 = null;
      
      let processArgs = (args) => {
        
        if (!isForm(args[0], Object)) return args;
        if (args.length > 1) throw Error('Object args should only have 1 arg');
        
        let { src, hooks={}, fn } = args[0];
        return [ src, hooks, fn ];
        
      };
      scp1 = Scope(src1, { processArgs }, (tmp, dep) => {
        
        scp2 = dep.scp({ src: src2, fn: (tmp, dep) => {
          
          scp3 = dep.scp({ src: src3, hooks: { a: 1, b: 2 }, fn: (tmp, dep) => {
            
          }});
          
        }});
        
      });
      
      src1.send(Tmp());
      src2.send(Tmp());
      src3.send(Tmp());
      
      if (!scp3.hooks.has('a')) throw Error('Scope 3 should have hook "a"');
      if (!scp3.hooks.has('b')) throw Error('Scope 3 should have hook "b"');
      
    },
    async m => { // Scope works with hooks.frameFn
      
      let src1 = Src();
      let src2 = Src();
      let src3 = Src();
      
      let scp1 = null;
      let scp2 = null;
      let scp3 = null;
      
      scp1 = Scope(src1, { frameFn: tmp => Object.assign(tmp, { framed: true }) }, (tmp, dep) => {
        scp2 = dep.scp(src2, (tmp, dep) => {
          scp3 = dep.scp(src3, (tmp, dep) => {});
        });
      });
      
      let tmp1 = Tmp();
      let tmp2 = Tmp();
      let tmp3 = Tmp();
      
      src1.send(tmp1);
      src2.send(tmp2);
      src3.send(tmp3);
      
      if (!tmp1.framed) throw Error('Tmp 1 should have been framed');
      if (!tmp2.framed) throw Error('Tmp 2 should have been framed');
      if (!tmp3.framed) throw Error('Tmp 3 should have been framed');
      
    },
    
    /*
    async m => { // SetSrc
      
      // TODO: broken because uses MemSrc.TmpM()
      let src = MemSrc.TmpM();
      let setSrc = SetSrc(src);
      
      let results = [];
      setSrc.route(set => results.add([ ...set ]));
      
      let tmps = (3).toArr(n => Tmp({ n }));
      
      for (let tmp of tmps) src.mod(tmp);
      if (results.length !== 4) throw Error(`Should have had 4 results`);
      if (results[0].length !== 0) throw Error(`results[0] should be empty array`);
      
      if (results[1].length !== 1) throw Error(`results[1] should have 1 child`);
      if (results[1][0].n !== 0) throw Error(`results[1][0].n !== 0`);
      
      if (results[2].length !== 2) throw Error(`results[2] should have 2 children`);
      if (results[2][0].n !== 0) throw Error(`results[2][0].n !== 0`);
      if (results[2][1].n !== 1) throw Error(`results[2][1].n !== 1`);
      
      if (results[3].length !== 3) throw Error(`results[3] should have 3 children`);
      if (results[3][0].n !== 0) throw Error(`results[2][0].n !== 0`);
      if (results[3][1].n !== 1) throw Error(`results[2][1].n !== 1`);
      if (results[3][2].n !== 2) throw Error(`results[2][1].n !== 2`);
      
      tmps[0].end();
      
      if (results.length !== 5) throw Error(`Should have 5 results`);
      if (results[4].length !== 2) throw Error(`results[4] should have 2 children`);
      if (results[4][0].n !== 1) throw Error(`results[4][0].n !== 1`);
      if (results[4][1].n !== 2) throw Error(`results[4][0].n !== 2`);
      
      (5).each(() => tmps[0].end());
      if (results.length !== 5) throw Error(`Tmp ended multiple times; prompted more results from SetSrc`);
      
      tmps[1].end();
      if (results.length !== 6) throw Error(`Should have 5 results`);
      if (results[5].length !== 1) throw Error(`results[5] should have 1 child`);
      if (results[5][0].n !== 2) throw Error(`results[5][0].n !== 2`);
      
      tmps[2].end();
      if (results.length !== 7) throw Error(`Should have 7 results`);
      if (results[6].length !== 0) throw Error(`results[6] should have no children`);
      
    },
    */
   
    async m => { // Comment removal
      
      let { captureLineCommentRegex: regL, captureInlineBlockCommentRegex: regB } = require('./foundation.js');
      
      let tests = [
        
        [ regL, `abc`,                'abc' ],
        [ regL, `abc//`,              'abc' ],
        [ regL, `abc //`,             'abc' ],
        [ regL, `abc // def`,         'abc' ],
        [ regL, `// abc`,             '' ],
        [ regL, `// "abc"`,           '' ],
        [ regL, `"//" abc`,           '"//" abc' ],
        [ regL, `// "//" abc`,        '' ],
        [ regL, `"//" // abc`,        '"//"' ],
        [ regL, `// 'abc'`,           '' ],
        [ regL, `'//' abc`,           `'//' abc` ],
        [ regL, `// '//' abc`,        `` ],
        [ regL, `'//' // abc`,        `'//'` ],
        
        [ regB, 'abc',                'abc' ],
        [ regB, 'abc/*',              'abc/*' ],
        [ regB, 'abc/**/',            'abc' ],
        [ regB, '/**/abc',            'abc' ],
        [ regB, ' /**/abc',           'abc' ],
        [ regB, '  /**/abc  /**/',    'abc' ],
        [ regB, 'abc/**/def/**/',     'abcdef' ],
        [ regB, 'abc  /**/def  /**/', 'abcdef' ],
        [ regB, 'abc /*x*/def /*y*/', 'abcdef' ],
        
        // Make sure any "unexpectedish" cases are ignored
        [ regL, `'//`,                `'//` ],
        [ regL, `"//`,                `"//` ],
        [ regL, `'abc' '//`,          `'abc' '//` ],
        [ regL, `'abc' "//`,          `'abc' "//` ],
        
      ];
      
      for (let [ reg, test, exp ] of tests)
        if (test.replace(reg, '') !== exp)
          throw Error('Unexpected regex replace result').mod({ reg, test, exp, result: test.replace(reg, '') });
      
    },
    
    async m => { // Filesys
      
      let { runTests } = require('./filesys.js');
      await runTests({ sanityMult: 0.05 }); // Speed up initiation at the cost of some sanity
      
    }
    
  ];
  
  for (let test of tests) {
    
    try {
      
      await test();
      
    } catch (err) {
      
      let name = test.toString().match(/[/][/](.*)\n/)?.[1]?.trim() ?? '<unnamed>';
      gsc(`Test FAIL (${name})`, err.desc());
      process.exit(1);
      
    }
    
  }
  
};
