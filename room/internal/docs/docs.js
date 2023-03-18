/* TODO: Changes based on lucidity gained from writing documentation:

RootReal is accessed with hinterland.seek('real', 'primary') meaning
there can be multiple RootReals; this was to accomodate, e.g.,
multi-monitor setups, where each RootReal would represent a monitor. But
better to just do hinterland.seek('real'), returning the ONE AND ONLY
RootReal, representing the "multi-monitor environment" itself; perhaps
child Reals can represent the individual monitors.

Real.prototype.mod -> Real.prototype.modify

real.resizeSrc; triggers on ANY resize, including by animation, if
adjusting to new window size, etc.

"tech" -> "media" ("RealTech" -> "RealMedia")

Art "animationFn" -> "artFn"
Axis1d "order" -> "axisOrder"
*/

global.rooms['internal.docs'] = async foundation => {
  
  let rooms = await foundation.getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'logic.Chooser'
  ]);
  let { Hinterland, HtmlBrowserHabitat, Chooser } = rooms;
  
  let Content = form({ name: 'Content', props: (forms, Form) => ({
    
    init: function(name, real=null) {
      
      // A single argument denoting the Real can be given; `name`
      // will be set to `null`:
      if (real === null) [ name, real ] = [ null, name ];
      Object.assign(this, { name, real });
      
    },
    jsCodeComment: '//',
    sizedText: function(args) {
      
      let { size, text } = isForm(args[0], Object)
        ? { size: 0, text: null, ...args[0] }
        : (isForm(args[0], Number)
          ? { size: args[0], text: args.length > 1 ? args[1] : null }
          : { size: 0,       text: args[0] }
        );
      
      if (!isForm(size, Number)) throw Error('Invalid size');
      if (size < 0 || size > 1) throw Error('Invalid size');
      
      if (isForm(text, String) && text.match(/^[ \n]*[|]/)) text = String.baseline(text);
      
      return { size, text };
      
    },
    reference: function(target) {
      this.real.addLayout({ form: 'Navigate', target: isForm(target, Content) ? target.real : target });
      return target;
    },
    gap: function(...args) {
      
      let { size } = this.sizedText(args);
      let min = 8 + 20 * size;
      let dyn = 0 + 0 * size;
      this.real.addReal('gap', [
        { form: 'Geom',  w: '100%', h: `calc(${min.toFixed(0)}px + ${dyn.toFixed(3)}vh`  }
      ]);
      
    },
    container: function(name=null) {
      
      let real = this.real.addReal('container', [
        { form: 'Geom', w: '100%' },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' }
      ]);
      if (name) this.real.addNavOption(name, real);
      return Content(name, real);
      
    },
    text: function(...args) {
      
      let { size, text } = this.sizedText(args);
      let min = 12 + 5 * size;
      let dyn = 0.35 + 0.35 * size;
      
      // Convert from \n-spaced text to Array of (line, blanks)
      // where "line" is the text and "blank" is the number of
      // following empty lines
      let lines = [];
      let last = null;
      for (let line of text.split('\n')) {
        if (!line.trim()) last && last.blanks++;
        else              lines.push(last = { line, blanks: 0 });
      }
      
      let real = this.real.addReal('text', [
        { form: 'Geom', w: 'calc(100% - 20px)' },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' }
      ]);
      
      // Add all lines of text into the wrapper
      for (let { line, blanks } of lines) {
        real.addReal('line', [
          { form: 'Geom', w: '100%' },
          { form: 'Text', size: `calc(${min.toFixed(0)}px + ${dyn.toFixed(3)}vw)`, align: 'fwd', text: line }
        ]);
        if (blanks > 0) real.addReal('break', [
          { form: 'Geom', w: '100%', h: `${5 + (size + 1) * blanks * 5}px` }
        ]);
      }
      return Content(real);
      
    },
    textFlow: function(size=0, fn=()=>{}) {
      
      let min = 12 + 5 * size;
      let dyn = 0.35 + 0.35 * size;
      
      let real = this.real.addReal('textFlow', [
        { form: 'Geom', w: 'calc(100% - 20px)' },
        { form: 'TextFlow', size: `calc(${min.toFixed(0)}px + ${dyn.toFixed(3)}vw)` }
      ]);
      
      let content = Content(real);
      fn(content);
      return content;
      
    },
    textFlowItem: function(text) {
      
      let real = this.real.addReal('textFlowItem', { text });
      return Content(real);
      
    },
    code: function(...args) {
      
      let { size, text } = this.sizedText(args);
      let min = 12 + 5 * size;
      let dyn = 0.35 + 0.35 * size;
      
      let gap = `${(1 + size).toFixed(3)}vmin`;
      let real = this.real.addReal('code', [
        { form: 'Geom', w: 'calc(100% - 20px)' },
        { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' },
        { form: 'Decal', colour: 'rgba(0, 0, 0, 0.05)', text: { colour: 'rgba(0, 0, 150)' }, border: { ext: '3px', colour: 'rgba(0, 0, 255, 0.2)' } }
      ]);
      real.addReal('gap', [ { form: 'Geom', w: '100%', h: gap } ]);
      real.addReal('content', [
        { form: 'Geom', w: `calc(100% - ${gap} - ${gap})` },
        { form: 'Text', size: `calc(${min.toFixed(0)}px + ${dyn.toFixed(3)}vw)`, align: 'fwd', text }
      ]);
      real.addReal('gap', [ { form: 'Geom', w: '100%', h: gap } ]);
      return Content(real);
      
    }
    
  })});
  
  return Hinterland('docs', 'internal.docs', {
    
    habitats: [ HtmlBrowserHabitat() ],
    above: async (hut, docsRec, real, dep) => {
      
      // let allTopicTerms = await foundation.seek('keep', 'fileSystem', [ 'room', 'internal', 'docs', 'topic' ]).getContent();
      
    },
    below: async (hut, docsRec, real, dep) => {
      
      let mainReal = dep(real.addReal('main', [
        { form: 'Geom',  w: '100%', h: '100%' },
        { form: 'Axis1d',  axis: 'x', dir: '+', mode: 'stackFwd' }
      ]));
      
      let sideBarReal = mainReal.addReal('sideBar', [
        { form: 'Geom',  w: '20%', h: '100%' },
        { form: 'Axis1d',  axis: 'y', dir: '+', mode: 'stackFwd' },
        { form: 'Decal',  colour: 'rgba(30, 20, 50, 0.8)', text: { colour: 'rgba(255, 255, 255, 1)' } }
      ]);
      let contentReal = mainReal.addReal('content', [
        { form: 'Geom',  w: '80%', h: '100%' },
        { form: 'Axis1d',  axis: 'y', dir: '+', mode: 'stackFwd' }
      ]);
      
      sideBarReal.addReal('logo', [
        { form: 'Geom',  h: 'calc(42px + 3vh)' },
        { form: 'Text',  size: 'calc(20px + 2vh)', text: '\u2302 Hut \u2302' },
        { form: 'Navigate', target: [] }
      ]);
      let topicsReal = sideBarReal.addReal('topics', [
        { form: 'Geom',  w: '100%' },
        { form: 'Axis1d',  axis: 'y', dir: '+', mode: 'stackFwd' }
      ]);
      
      let topicsData = [
        { term: 'tutorial' },
        { term: 'metaphor' },
        { term: 'philosophy' },
        { term: 'foundation' },
        { term: 'forms' },
        { term: 'logic' },
        { term: 'hinterland' },
        { term: 'hut' },
        { term: 'record' },
        { term: 'real' },
        { term: 'dep' }
      ];
      
      for (let { term, title=null } of topicsData) {
        
        if (title === null) title = term[0].upper() + term.slice(1).replace(/[A-Z]/g, ' $&');
        
        let navOption = contentReal.addNavOption(term, async (navPar, dep) => {
          
          let topicFn = await foundation.getRoom(`internal.docs.topic.${term}`);
          let topicReal = dep(contentReal.addReal('topic', { navPar }, [
            { form: 'Geom', w: '100%', h: '100%' },
            { form: 'Axis1d', axis: 'y', dir: '+', mode: 'stackFwd' }
          ]));
          
          await topicFn(Content(topicReal));
          
          return topicReal;
          
        });
        topicsReal.addReal('topic', [
          { form: 'Geom', w: '100%', h: 'calc(14px + 2vh)' },
          { form: 'Text', size: 'calc(10px + 1vh)', text: title },
          { form: 'Navigate', target: navOption }
        ]);
        
      }
      
    }
    
  });
  
};
