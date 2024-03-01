'use strict';

module.exports = async actions => {
  
  let remaining;
  if (isForm(actions, Object)) remaining = { ...actions };
  if (isForm(actions, Array)) remaining = actions.toObj((v, i) => [ i, v ]);
  if (!remaining) throw Error('Api: "actions" must resolve to Object/Array');
  
  let values = {};
  while (!remaining.empty()) {
    
    let errs = [];
    let progress = false;
    let furtherActions = {};
    
    for (let [ k, fn ] of remaining) {
      
      let actionResult; /* { result, actions: { ... } }*/
      try { actionResult = await fn(values); } catch (err) {
        if (!isForm(err, Error)) throw err;
        errs.push(err);
        continue;
      }
      
      if (!isForm(actionResult, Object)) throw Error('woAWwowowwaa poorly implemented churn function...').mod({ actionResult, fn: fn.toString() });
      
      progress = true;
      values[k] = actionResult.result;
      delete remaining[k];
      
      if (actionResult.has('actions')) {
        /// {DEBUG=
        if (!isForm(actionResult.actions, Object)) throw Error('OOofofowwwwsoasaoo poorly implemented churn function...').mod({ actionResult, fn: fn.toString() });
        /// =DEBUG}
        Object.assign(furtherActions, actionResult.actions);
      }
      
    }
    
    if (!progress) throw Error('Api: unresolvable churns').mod({ remaining, cause: errs, partiallyChurnedValues: values });
    
    Object.assign(remaining, furtherActions);
    
  }
  
  return values;
  
};