global.rooms['internal.docs.topic.real'] = foundation => decorator => {
  
  decorator.text(1, 'Real API');
  decorator.text(String.baseline(`
    | Reals are the interface between computer and human user. They provide convenient sensory interfaces such that the human user can convey their intentions to, and the learn the state of, the computer program.
    | 
    | Reals are only meaningful to human users, and are completely redundant during the time there is no human user actively using the program.
    | 
    | Reals allow for the program's state to be analyzed by a human's senses:
    | - Touch: determining the state of a braille pad, or activating haptic responses (e.g., vibrating game controllers)
    | - Sound: playing any audible information to users
    | - Sight: determining the visual layout of information in dimensional space
    | 
    | Reals allow humans to input information into the program:
    | - Touch: communication through a mouse, keyboard, joystick, or any tactile controller
    | - Sound: receiving input through a microphone
    | - Sight: monitoring where a user's eyes are focused
    | 
    | Reals have a hierarchical layout. All Reals are, through some level of indirection, connected to the RootReal, which represents the full interfacing potential between technology and human user.
  `));
  decorator.gap(1);
  
  decorator.text(0.5, 'Referencing the Root Real');
  decorator.text('The RootReal can be referenced from the Foundation:');
  decorator.code('let rootReal = await foundation.getRootReal();');
  decorator.text('Or using slotting format:');
  decorator.code('let rootReal = await foundation.seek(\'real\')');
  
  decorator.textFlow(0, d => {
    d.textFlowItem('Note that ');
    d.textFlowItem('Hinterland').reference([ 'hinterland', 'Hinterland.prototype.init' ]);
    d.textFlowItem(' exposes Real instances; when using Hinterland it is recommended not to reference the RootReal directly:');
  });
  
  decorator.code(String.baseline(`
    | Hinterland('ex', 'example', {
    |   above: async ({ real }) => { ... },
    |   below: async ({ real }) => { ... }
    | });
  `));
  decorator.gap(1);
  
  decorator.text(0.5, `<form>: Real`);
  (() => {
    
    decorator.text(0.2, `  has: Tmp`);
    decorator.gap(0);
    
    decorator.text(0.5, `<prototype>: Real.prototype`);
    let realFormGlossary = decorator.container();
    decorator.gap(0);
    
    decorator.text(0.5, `<instance>: Real(...)`);
    let realFactGlossary = decorator.container();
    decorator.gap(0);
    
    decorator.text(String.baseline(`
      | A Real represents some feature that a human user interacts with directly.
      | 
      | Reals can have a set of Layouts added to them; Layouts define the kind of utility the Real provides.
      | 
      | Reals have fluctuating state, while Layouts are entirely immutable. For a Layout to respond to changing data the Layout should be added to a Real, and the Real's state may be changed. The Layout will reflect the Real's updated state, but note that the Layout's state never changes.
      |
      | Reals are hierarchical. A Real may have many ChildReals attached to it, but only ever a single ParentReal.
      | 
      | Reals exist across a wide variety of media. For example, Reals relaying graphical information are logically related to a computer monitor, whereas Reals relaying sound information are logically related to a computer's speakers. Refining the behaviour of a Real will involve some definition that is fundamentally aware of its related media, and some definition that is unrelated. For example, defining the "colour" of a Real would only have meaning when the Real exists in visual media. On the other hand, defining the "significance" of a Real is unrelated to its media; visually "significant" Reals can be shown with more contrasting colours and larger text sizes; audible "significant" Reals could be played at higher volumes, with generated speech sounding more stressed.
      | 
      | Every Real is associated with a RealMedia, which defines the media the Real is associated with. Media-specific definitions are handled by the RealMedia.
      | 
      | It is better to use "media-unspecific" definitions for your Reals when possible. This allows a given Real to be witnessed via any medium. Also, "media-unspecific" definitions are easier to perform since they do not require the presence of any RealMedia.
    `));
    
    decorator.gap(0.4);
    
    // Real.prototype.addLayout
    let realFormAddLayout = decorator.container('Real.prototype.addLayout');
    realFormGlossary.text(0.2, '  .addLayout').reference(realFormAddLayout);
    
    realFormAddLayout.text(0.5, 'Real.prototype.addLayout(layoutDef)');
    realFormAddLayout.text(0.2, '<param> [Object] layoutDef');
    realFormAddLayout.text(0.2, '<return> Tmp(...)');
    realFormAddLayout.gap(0);
    realFormAddLayout.text('Adds a new Layout to the Real, affecting how the Real is witnessed by users:');
    realFormAddLayout.code(String.baseline(`
      | let real = rootReal.addReal('exampleReal');
      | real.addLayout({ form: 'Geom', w: '100%', h: '100%' });
    `));
    realFormAddLayout.text('The Tmp returned by "addLayout" represents the attachment of the Layout to the Real, and can be used to detach the Layout:');
    realFormAddLayout.code(String.baseline(`
      | let addedLayout = real.addLayout({ form: 'Geom', ... });
      | addedLayout.end();
    `));
    realFormAddLayout.text('A Layout fact will be created by this method. Note that it is necessary to reference interactive Layouts to specify the effects of user interactions. Layouts can be referenced by Real.prototype.getLayout, but are also available via the "layout" property of the returned Tmp:');
    realFormAddLayout.code(String.baseline(`
      | let { layout } = real.addLayout({ form: 'Press', ... });
      | layout.route(() => console.log('Press occurred!'));
    `));
    decorator.gap(0.4);
    
    // Real.prototype.addReal
    let realFormAddReal = decorator.container('Real.prototype.addReal');
    realFormGlossary.text(0.2, '  .addReal').reference(realFormAddReal);
    
    realFormAddReal.text(0.5, 'Real.prototype.addReal(term, params, layouts)');
    realFormAddReal.text(0.2, '<param> [String]  term');
    realFormAddReal.text(0.2, '<param> [Object?] params');
    realFormAddReal.text(0.2, '<param> [Array?]  layouts');
    realFormAddReal.text(0.2, '<return> Real(...)');
    realFormAddReal.gap(0);
    realFormAddReal.text('Creates a new child Real and attaches it to the parent Real:');
    realFormAddReal.code(String.baseline(`
      | let real = rootReal.addReal('exampleReal', { text: 'example' }, [
      |   Geom({ w: '100%', h: '100%' }),
      |   Text({ size: '10em' })
      | ]);
    `));
    decorator.gap(0.4);
    
    // Real.prototype.getMedia
    let realFormGetMedia = decorator.container('Real.prototype.getMedia');
    realFormGlossary.text(0.2, '  .getMedia').reference(realFormGetMedia);
    
    realFormGetMedia.text(0.5, 'Real.prototype.getMedia()');
    realFormGetMedia.text(0.2, '<return> RealMedia(...)');
    realFormGetMedia.gap(0);
    realFormGetMedia.text('Returns the RealMedia responsible for managing the Real:');
    realFormGetMedia.code(String.baseline(`
      | let realMedia = rootReal.getMedia();
      | assert(realMedia.handles('graphics'));
      | 
      | ${decorator.jsCodeComment} For non-graphical media the concept of a "colour scheme" is invalid
      | realMedia.modifyColourScheme({
      |   stdFgColour: 'rgba(  0,   0,   0, 1)',
      |   stdBgColour: 'rgba(255, 255, 255, 1)'
      |   // .
      |   // .
      |   // .
      | });
    `));
    decorator.gap(0.4);
    
    // Real.prototype.getLayout
    let realFormGetLayout = decorator.container('Real.prototype.getLayout');
    realFormGlossary.text(0.2, '  .getLayout').reference(realFormGetLayout);
    
    realFormGetLayout.text(0.5, 'Real.prototype.getLayout(layoutFormName)');
    realFormGetLayout.text(0.2, '<param> [String] layoutFormName');
    realFormGetLayout.text(0.2, '<return> Layout(...) || null');
    realFormGetLayout.gap(0);
    realFormGetLayout.text(String.baseline(`
      | Searches the Real for a Layout of the supplied LayoutForm.
      | Note that Reals should not have more than one Layout of a given LayoutForm; for this reason "getLayout" will return a single unique Layout(...), or null if none was found:
    `));
    realFormGetLayout.code(String.baseline(`
      | let real = rootReal.addReal('exampleReal', [ { form: 'Press' } ]);
      | 
      | ${decorator.jsCodeComment} "getLayout" can retrieve the reference to the Press(...) instance
      | let pressLayout = real.getLayout('Press');
      | pressLayout.route(() => console.log('Example real was pressed!'));
    `));
    decorator.gap(0.4);
    
    // Real.prototype.addNavOption
    let realFormAddNavOption = decorator.container('Real.prototype.addNavOption');
    realFormGlossary.text(0.2, '  .addNavOption').reference(realFormAddNavOption);
    
    realFormAddNavOption.text(0.5, 'Real.prototype.addNavOption(term, realVal)');
    realFormAddNavOption.text(0.2, '<param> [String] term');
    realFormAddNavOption.text(0.2, '<param> [Real|Function] realVal');
    realFormAddNavOption.text(0.2, '<return> NavOpt(...)');
    realFormAddNavOption.gap(0);
    realFormAddNavOption.text(String.baseline(`
      | Reals have a sense of "navigation"; this is the concept that with an application, not all possible Reals within the application are shown at once. For example, in an application designed to have multiple pages, only a single page will be shown at once.
      | Navigation is tree-like; the root navigation node is the RootReal, and each navigation node attached to it may further branch out into more navigation options; for this reason any Real may have NavOpts added to it. Navigation either directs to an existent or nonexistent Real.
    `));
    realFormAddNavOption.gap(0);
    realFormAddNavOption.text(String.baseline(`
      | Direction to existent Reals is simpler; consider a long page, full of information about various beetles. All Reals bestowing beetle information are immediately-available:
    `));
    realFormAddNavOption.code(String.baseline(`
      | let mainReal = rootReal.addReal('btl.main');
      |
      | let juneBeetle = mainReal.addReal('btl.juneBeetle');
      | ${decorator.jsCodeComment} ... set up juneBeetle info, add text, etc.
      |
      | let ladyBeetle = mainReal.addReal('btl.ladyBeetle');
      | ${decorator.jsCodeComment} ... set up ladyBeetle info, add text, etc.
      |
      | let tigerBeetle = mainReal.addReal('btl.tigerBeetle');
      | ${decorator.jsCodeComment} ... set up tigerBeetle info, add text, etc.
    `));
    realFormAddNavOption.text([
      'Imagine we want to add a glossary, to quickly link to each section; ',
      'this is a matter of navigation to immediately-available content, as references exist in our code to the Real instances we wish to link. ',
      'In such cases we can simply provide the Real instance as the "target" of the Navigate Layout:'
    ].join(''));
    realFormAddNavOption.code(String.baseline(`
      | let navJuneBeetle =  mainReal.addNavOption('juneBeetle',  juneBeetle);
      | let navLadyBeetle =  mainReal.addNavOption('ladyBeetle',  ladyBeetle);
      | let navTigerBeetle = mainReal.addNavOption('tigerBeetle', tigerBeetle);
      | 
      | let glossary = mainReal.addReal('btl.glossary');
      | glossary.addReal('btl.juneBeetle',  [ { form: 'Navigate', target: navJuneBeetle  } ]);
      | glossary.addReal('btl.ladyBeetle',  [ { form: 'Navigate', target: navLadyBeetle  } ]);
      | glossary.addReal('btl.tigerBeetle', [ { form: 'Navigate', target: navTigerBeetle } ]);
    `));
    realFormAddNavOption.gap(0);
    realFormAddNavOption.text(String.baseline(`
      | Sometimes we wish to navigate to a Real that may not already be initialized; in such cases there will be no reference to the Real instance. Imagine a Real whose existence is contigent on a NavOpt:
    `));
    realFormAddNavOption.code(String.baseline(`
      | let contentReal = mainReal.addReal('ex.content');
      | let navOpt1 = contentReal.addNavOption('item1', (nav, dep) => {
      |   return dep(contentReal.addReal('ex.item1', [ { form: 'Text', text: 'Item #1' } ]));
      | });
      | let navOpt2 = contentReal.addNavOption('item2', (nav, dep) => {
      |   return dep(contentReal.addReal('ex.item2', [ { form: 'Text', text: 'Item #2' } ]));
      | });
    `));
    realFormAddNavOption.text(`Such Reals can't be referenced, but their NavOpts can - we can provide these NavOpts as targets of Navigate Layouts:`);
    realFormAddNavOption.code(String.baseline(`
      | glossaryReal.addReal('ex.glossaryItem', [
      |   { form: 'Text', text: 'Link to item #1' },
      |   { form: 'Navigate', target: navOpt1 }
      | ]);
      | glossaryReal.addReal('ex.glossaryItem', [
      |   { form: 'Text', text: 'Link to item #2' },
      |   { form: 'Navigate', target: navOpt2 }
      | ]);
    `));
    realFormAddNavOption.gap(0);
    realFormAddNavOption.text(String.baseline(`
      | Sometimes, unfortunately, neither the Real nor the NavOpt can be referenced; this is often the case with nested NavOpts:
    `));
    realFormAddNavOption.code(String.baseline(`
      | let contentReal = rootReal.addReal('ex.content');
      | 
      | let navOpt1 = contentReal.addNavOption('item1', (nav, dep) => {
      |   
      |   let real = dep(contentReal.addReal('ex.item1');
      |   let navOpt1a = real.addNavOption('item1a', (nav, dep) => {
      |     return dep(real.addReal('ex.item1a', [ { form: 'Text', text: 'Item #1a' } ]));
      |   });
      |   let navOpt1b = real.addNavOption('item1b', (nav, dep) => {
      |     return dep(real.addReal('ex.item1b', [ { form: 'Text', text: 'Item #1b' } ]));
      |   });
      |   return dep(contentReal.addReal('ex.item1', [ { form: 'Text', text: 'Item #1' } ]));
      | 
      | });
    `));
    realFormAddNavOption.text(String.baseline(`
      | In this case neither the inner Reals nor NavOpts can be referenced. To navigate to an inner item we would need to provide the full chain of NavOpt names to traverse in order to get there:
    `));
    realFormAddNavOption.code(String.baseline(`
      | let linkToItem1a = glossaryReal.addReal('ex.glossaryItem', [
      |   { form: 'Text', text: 'To item #1a' },
      |   { form: 'Navigate', target: [ 'item1', 'item1a' ] }
      | ]);
      | 
      | let linkToItem1b = glossaryReal.addReal('ex.glossaryItem', [
      |   { form: 'Text', text: 'To item #1b' },
      |   { form: 'Navigate', target: [ 'item1', 'item1b' ] }
      | ]);
    `));
    
    // TODO: Example of navigation to nonexistent Real (realFn)
    decorator.gap(0.4);
    
    // Real.prototype.modify
    let realFormModify = decorator.container('Real.prototype.modify');
    realFormGlossary.text(0.2, '  .modify').reference(realFormModify);
    
    realFormModify.text(0.5, 'Real.prototype.modify(params)');
    realFormModify.text(0.2, '<param> [Object] params');
    realFormModify.text(0.2, '<return> Real(...)');
    realFormModify.gap(0);
    realFormModify.text(String.baseline(`
      | Used to modify the state of the Real; any modifications will be immediately reflected, as appropriate, by any Layouts.
      | 
      | For example we can change a Real's text when it is pressed:
    `));
    realFormModify.code(String.baseline(`
      | let real = rootReal.addReal('exampleReal', [
      |   { form: 'Text', text: 'initial text', size: '200%' },
      |   { form: 'Press', pressFn: () => real.modify({ text: 'updated text!' }) }
      | ]);
    `));
    
  })();
  decorator.gap(1);
  
  decorator.text(0.5, `<form>: Layout`);
  (() => {
    
    decorator.gap(0);
    decorator.text(String.baseline(`
      | Layouts are divided into "presentational" and "interactive" categories. Presentational Layouts purely offer information, whereas interactive Layouts allow a human user to affect the state of their program.
      |
      | There is no reason to reference a presentational Layout. The only action that can be performed on a presentational Layout is to detach it from a Real (and this is done using the Tmp created by Real.prototype.addLayout, not via the Layout fact). Presentational Layouts can still be used to present dynamic data; in these cases the data is stored on and modified via a Real.
      |
      | Interactive Layouts must be referenced in order to handle interaction events, and convey the user's intentions into effects on the state of the program.
      |
      | Overall Layout references are very limited in a Hut program: only interactive Layouts are to be referenced, and interactive Layout references should only be used to react to a user's interactions.
      |
      | Layouts have very limited outward functionality. For this reason there are exclusively two ways to initialize a Layout:
      | 1. By using Real.prototype.addLayout
      | 2. By passing Layout data to Real.prototype.addReal
      | 
      | For example the following code achieves the exact same result two different ways:
    `));
    decorator.code(String.baseline(`
      | let real1 = rootReal.addReal('test');
      | real1.addLayout({ form: 'Geom', ... });
      | real1.addLayout({ form: 'Axis1d', ... });
      | 
      | let real2 = rootReal.addReal('test', [
      |   { form: 'Geom', ... },
      |   { form: 'Axis1d', ... }
      | ]);
    `));
    decorator.text(String.baseline(`
      | Overall, Real.prototype.addLayout and Real.prototype.addReal both accept LayoutDefinitions; these are Objects with a "form" property specifying what type of Layout is being instantiated.
      | 
      | For each LayoutForm you will find properties of both "params" and "Real.modify(realParams)" documented. The "params" are fixed for a given Layout. The "realParams" are set on the Real, may be changed over time, and will have any changes reflected by the Layout. In some cases the same properties can be defined on both "params" and "realParams" - in such cases "realParams" always has precedence.
    `));
    decorator.gap(0.4);
    
    decorator.text(0.5, 'Layout Definitions');
    decorator.text(0.2, `  { form: 'Art', ... }`);
    decorator.text(0.2, `  { form: 'Axis1d', ... }`);
    decorator.text(0.2, `  { form: 'Feel', ... }`);
    decorator.text(0.2, `  { form: 'Geom', ... }`);
    decorator.text(0.2, `  { form: 'Image', ... }`);
    decorator.text(0.2, `  { form: 'Press', ... }`);
    decorator.text(0.2, `  { form: 'Refine', ... }`);
    decorator.text(0.2, `  { form: 'Text', ... }`);
    decorator.text(0.2, `  { form: 'TextInput', ... }`);
    decorator.text(0.2, `  { form: 'Transform', ... }`);
    decorator.gap(0.4);
    
    decorator.text(0.5, `Real(...).addLayout({ form: 'Art', ...params })`);
    decorator.text(0.3, 'Attributes: Presentational, Graphical');
    decorator.gap(0);
    decorator.code(0.2, String.baseline(`
      | params = {
      |   [Number?] pixelDensityMult,
      |   [Array?]  pixelCount
      | };
      | Real(...).modify({
      |   [Function?] artFn
      | });
    `));
    decorator.gap(0);
    decorator.text(String.baseline(`
      | Enables a Real to render arbitrary pixel graphics. Pixel-filling is defined via the utility "art" object passed to "artFn". Note that the Real will have physical on-screen dimensions defined by its other Layouts, as well as "pixel dimensions", which define how many pixels are available for rendering arbitrary pixel-graphics. By default the Real's pixel dimensions are maintained to be the same as its on-screen dimensions. The "pixelDensityMult" parameter multiplies the number of pixels relative to the on-screen dimenions; values less than 1 reduce the resolution of the arbitrary pixel graphics, whereas values greater than 1 allow for sub-pixel resolution.
    `));
    decorator.gap(0.4);
    
    decorator.text(0.5, `Real(...).addLayout({ form: 'Axis1d', ...params })`);
    decorator.text(0.3, 'Attributes: Presentational');
    decorator.gap(0);
    decorator.code(0.2, String.baseline(`
      | params = {
      |   [String/AxisDescriptor?]           axis,
      |   [String/FlowDescriptor?]           flow,
      |   [String/StackDescriptor?]          stack,
      |   [String/OverflowActionDescriptor?] overflowAction
      | };
      | Real(...).modify({
      |   [Integer?] axisOrder
      | });
    `));
    decorator.gap(0);
    decorator.text(String.baseline(`
      | Enables a Real to structure a sequence of ChildReals in a linear fashion.
    `));
    decorator.gap(0.4);
    
    decorator.text(0.5, `Real(...).addLayout({ form: 'Feel', ...params })`);
    decorator.text(0.3, 'Attributes: Interactive');
    decorator.gap(0);
    decorator.code(0.2, String.baseline(`
      | params = {
      |   [Array?] modes
      | }
      | Real(...).modify({});
    `));
    decorator.gap(0);
    
  })();
  decorator.gap(1);
  
};
