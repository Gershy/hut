// Note that other Banks implicitly implement this api, but this file is
// never actually loaded (as it's needless overhead)
global.rooms['record.bank.AbstractBank'] = foundation => form({ name: 'AbstractBank', has: { Endable }, props: (forms, Form) => ({
  
  init() { forms.Endable.init.call(this); },
  
  /// {DEBUG=
  getNextUid: C.noFn('getNextUid'),
  select: C.noFn('select', ({ activeSignal, relSrc, filter, offset, limit }) => {
    // A Generator returning Objects of the form:
    // |  {
    // |    rec: null || Record(...),
    // |    uid,
    // |    type: 'pfx.type',
    // |    mems: {
    // |      'term1': 'uid1',
    // |      'term2': 'uid2',
    // |      ...
    // |    },
    // |    getValue: async () => /* Record value */
    // |  }
  }),
  selectUid: C.noFn('selectUid', uid => { /* same format as values yielded from "select" */ }),
  syncRec: C.noFn('sync', rec => {
    // Persist `rec` and any future changes to its value. Note that
    // this method can throw an `async` Error to indicate that `rec`
    // didn't meet the criteria needed to be accepted by the Bank
    // (e.g. validation failed i.e. a field was invalid). Throwing
    // such an Error ends `rec`! Note that when `rec` is ended, this
    // logic is responsible for attaching an "endedPrm" property to
    // `rec` which is a Promise resolving when `rec` has been fully
    // removed from the Bank
  }),
  syncSer: C.noFn('syncSer', (manager, { add=[], upd=[], rem=[] }) => {
    // Syncs serialized data representing `add`itions, `upd`ates, and
    // `rem`ovals; the provided `manager` will be used to create any
    // Records specified under `add`
  })
  /// =DEBUG}
  
})});
