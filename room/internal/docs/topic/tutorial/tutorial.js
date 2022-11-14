// At first I thought, like how 3d-printer technology enables really
// simple quality-of-life improvements in the hard material world (e.g.
// propping up the uneven leg of a chair, doorstopper) Hut could
// equivalently enable quick-and-dirty quality-of-life improvements in
// the soft world of pure information - want to play poker, but got no
// poker-chips? In 5 minutes Hut can be running a Loft that allows
// players to bet/win/lose chips. Of course, like 3d printers have gone
// on to do much more than quick-and-dirty fixes, Hut will hopefully do
// so as well.

global.rooms['internal.docs.topic.tutorial'] = foundation => decorator => {
  
  decorator.text(1, 'Tutorial');
  decorator.text(`
    | Hut allows us to create "shared experiences", or interactive applications that can be accessed and interacted with by multiple users.
  `);
  decorator.gap(0.4);
  
  decorator.text(0.5, 'Expectations');
  decorator.text(`
    | - Knowledge of javascript
    | - Knowledge of how to run nodejs from the command-line
    | - Basic understanding of creating folders/files
  `);
  decorator.gap(0.4);
  
  decorator.text(0.5, 'Getting started');
  decorator.text(`
    | Install Hut. This will download all necessary Hut files into a folder on your computer.
    | This folder should be named "hut" (with a lowercase "h"). You can store it anywhere on your computer, but it is recommended to store it to "/hut" (on windows, this looks like "C:/hut").
    | Going forward, this main folder, ideally located at "/hut", will be referred to as "<hut>".
    | This main "hut" folder has the following contents:
    | - A folder named "room" (the full path is "<hut>/room")
    | - A folder named "setup" (the full path is "<hut>/setup")
    | - A file named "hut.js" (the full path is "<hut>/hut.js")
  `);
  decorator.gap(0.4);
  
  decorator.text(0.5, 'Creating the "hello world" app');
  decorator.text(`
    | The following instructions are to create a new Hut application named "helloWorld".
    | - Under the "room" folder, create a new folder named "helloWorld"
    | - Under this "helloWorld" folder, create a new file named "helloWorld.js"
    | - Note that this folder's full path is "<hut>/room/helloWorld/helloWorld.js"
    | - Open "helloWorld.js" with an editor.
    | 
    | A file (like "helloWorld.js"), in Hut, is called a "Room". Rooms define some kind of functionality. The final application / shared experience / Hut will be composed of one or more Rooms.
    | There are some small minimum expectations of how the code of a Room must look. Using your editor, insert the following into "helloWorld.js":
  `);
  decorator.code(`
    | global.rooms['helloWorld'] = async foundation => {
    |   ${decorator.jsCodeComment} .. More code will go here ...
    | };
  `);
  decorator.text(`
    | Every Room in Hut has this minimum structure. This code initializes a global awareness of a Room of the given name (in this case "helloWorld"), and says that whatever this Room does, it does it in the presence of a "Foundation".
    | One final touch will cause this room to output "hello world". Modify the code so it looks like:
  `);
  decorator.code(`
    | global.rooms['helloWorld'] = async foundation => {
    |   return {
    |     open: () => foundation.debug('Hello world!')
    |   };
    | };
  `);
  decorator.text(`
    | Run this text using the command-line (note the following assumes Hut has been installed at "/hut"):
  `);
  decorator.code(`
    | >> cd /hut
    | >> node hut.js "{ settle: 'helloWorld' }"
  `);
  decorator.text(`
    | This produces the output "Hello world!" on the command-line.
    | It is very easy to create a hello-world program with Hut, but note that this does not take advantage of Hut's power - this is because a hello-world app is not a shared experience among many users. Other example programs in this tutorial section will describe how to leverage the real power of Hut!
  `);
  decorator.gap(0.4);
  
  decorator.text(0.5, 'Creating the "counter" app');
  decorator.text(`
    | The following instructions are to create a new Hut application named "counter"; this will be one of the most basic shared experiences possible. The "counter" app will consist of a single number, initialized to 0. Any user who wishes may click buttons to increment and/or decrement this number, as much as they like. The number will remain synchronized among all users.
    | - Under the "room" folder, create a new folder named "counter"
    | - Under this "counter" folder, create a new file named "counter.js"
    | - Open "counter.js" with an editor.
    | - Insert the basic Room structure into "counter.js":
  `);
  decorator.code(`
    | global.rooms['counter'] = async foundation => {
    |   ${decorator.jsCodeComment} ...
    | };
  `);
  decorator.text(`
    | Unlike the "helloWorld" Hut, the "counter" app involves multiple Huts - one for the main application, and another for each user who is using the application. Working with multiple Huts is made trivial by a concept called the Hinterland. The Hinterland is the space in which all Huts exist, and the plane of interaction between Huts. Let's set up the Hinterland:
  `);
  decorator.code(`
    | global.rooms['counter'] = async foundation => {
    |   
    |   let Hinterland = await foundation.getRoom('Hinterland');
    |   
    |   let hinterland = Hinterland('cnt', 'counter', {});
    |   
    |   return hinterland;
    |   
    | };
  `);
  decorator.text(`
    | Here we have now stated that the "counter" room involves the creation of a Hinterland in which many Huts can share experiences.
    | 
    | Multiple steps were carried out:
    | - The "Hinterland" Form was loaded into "counter" using the foundation.getRoom method.
    | - Hinterland was factualized into a Fact named "hinterland"
    | - This initialization used 3 parameters:
    |   - "cnt": this is the "abbreviated name" of the room
    |   - "counter": this is the "full name" of the room
    |   - {}: an Object of options which so far has been left empty
    | - We returned the Hinterland Fact
    | 
    | As of yet our "counter" Room is broken. This is because we haven't supplied enough options to our Hinterland.
    | In order to get some basic functionality, replace the empty "{}" Object with the following:
  `);
  decorator.code(`
    | {
    |   habitats: [],
    |   above: async () => {},
    |   below: async () => {}
    | }
  `);
  decorator.text(`
    | These three properties conclude the initialization of the Hinterland.
    | - "habitats" define which mediums of communication will be supported by the "counter" app. For example, are users able to use "counter" with a browser? With a smartphone? With a wearable device? Or a terminal, with ascii graphics?
    | - The "above" function defines behaviour that is outside of any single user's control - much the way that in real life, nature is outside of any individual's direct control.
    | - The "below" function defines behavour that can be directly invoked by a single user. Consider a democratic-style voting application written with Hut. Psyches have direct control over who they mark on their ballot - but only Nature has control over the final victor; the election of the winner is behaviour outside of any single user's capabilities.
    | 
    | Let's fill out all three of these properties so that they're no longer empty. Modify "counter.js" so it looks like so:
  `);
  decorator.code(`
    | global.rooms['counter'] = async foundation => {
    |   
    |   let Hinterland = await foundation.getRoom('Hinterland');
    |   
    |   let HtmlBrowserHabitat = await foundation.getRoom('HtmlBrowserHabitat');
    |   let AndroidHabitat = await foundation.getRoom('AndroidHabitat');
    |   let TerminalAsciiHabitat = await foundation.getRoom('TerminalAsciiHabitat');
    |   
    |   let hinterland = Hinterland('cnt', 'counter', {
    |     
    |     habitats: [ HtmlBrowserHabitat(), AndroidHabitat(), TerminalAsciiHabitat() ],
    |     
    |     above: async () => {
    |       foundation.debug('Nature!');
    |     },
    |     below: async () => {
    |       foundation.debug('Psyche!');
    |     }
    |     
    |   });
    |   
    |   return hinterland;
    |   
    | };
  `);
  
};
