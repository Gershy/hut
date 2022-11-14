global.rooms['internal.docs.topic.hinterland'] = foundation => decorator => {
  
  decorator.text(1, 'Hinterland API');
  
  decorator.text(0.5, `<form> Hinterland`);
  decorator.text(0.5, '<prototype> Hinterland.prototype');
  let hinterlandFormGlossary = decorator.container();
  decorator.gap(0);
  
  decorator.text(String.baseline(`
    | A Hinterland instance represents a space in which multiple Huts coexist, and are capable of having shared experiences.
  `));
  
  decorator.gap(0.4);
  
  let hinterlandFormInit = decorator.container('Hinterland.prototype.init');
  hinterlandFormGlossary.text(0.2, '  .init').reference(hinterlandFormInit);
  
  hinterlandFormInit.text(0.5, 'Hinterland.prototype.init(shortName, fullName, { hosting, debug, habitats, recordForms, nature, psyche })');
  hinterlandFormInit.text(0.2, '<param> String shortName');
  hinterlandFormInit.text(0.2, '<param> String fullName');
  hinterlandFormInit.text(0.2, '<param> Object hosting');
  hinterlandFormInit.text(0.2, '<param> Set[String] debug');
  hinterlandFormInit.text(0.2, '<param> Array[Habitat] habitats');
  hinterlandFormInit.text(0.2, '<param> Object[RecType|Function[return:RecType]] recordForms');
  hinterlandFormInit.text(0.2, '<param> Function nature');
  hinterlandFormInit.text(0.2, '<param> Function psyche');
  
};

