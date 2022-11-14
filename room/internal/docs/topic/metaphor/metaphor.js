global.rooms['internal.docs.topic.metaphor'] = foundation => decorator => {
  
  decorator.text(1, 'Understanding Hut');
  
  decorator.text(0, String.baseline(`
    | The following terms and analogy help to describe the basic workings of Hut:
    | 
    | HUTS exist at different elevations; we can consider "Hill Huts" and "Valley Huts", and we can say that some Hut is "above" another. Higher Huts have more information. A lower Hut never knows anything that a Higher Hut doesn't.
    | 
    | The HINTERLAND is the space in which all Huts are found. Two Huts within the Hinterlands may be connected by zero, one, or more Roads. If a Road connects Huts they may interact.
    | 
    | A Hut is composed of ROOMS, and each Room may contain more rooms (the same way a bedroom may have a closet). The contents of a Hut's rooms determine the experience.
  `));
  
};
