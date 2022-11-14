global.rooms['internal.test.test2'] = async foundation => {
  
  let rooms = await foundation.getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat'
  ]);
  
  let { Hinterland, HtmlBrowserHabitat } = rooms;
  
  return Hinterland('test2', 'internal.test.test2', {
    
    habitats: [ HtmlBrowserHabitat() ],
    nature: async (hut, appRec, real, dep) => {
      
      /// {ABOVE=
      hut.addKnownRealDependencies([ 'Geom', 'Axis1d', 'Decal', 'Text', 'Press' ]);
      /// =ABOVE}
      
      dep.scp(hut, 'hut.owned/par', async (owned, dep) => { // "get all 'hut.owned' Recs where `hut` is the PAR
        
        // Whenever a new KidHut appears create a "test2.user" Record
        // for it if none already exists
        let kidHut = owned.getMember('kid');
        let user = await kidHut.withRh({ type: 'test2.user', limit: 1,  fn: rh => rh.getRec() });
        if (!user) hut.addRecord('test2.user', [ appRec, kidHut ], { name: kidHut.uid });
        
      });
      
    },
    psyche: async (hut, appRec, real, dep) => {
      
      let mainReal = dep(real.addReal('test2.main', [
        { form: 'Geom', w: '100%', h: '100%' },
        { form: 'Axis1d', axis: 'y', flow: '+', mode: 'stack' },
        { form: 'Decal', colour: 'rgba(0, 0, 120, 0.2)'}
      ]));
      
      let titleReal = mainReal.addReal('test2.title', [
        { form: 'Geom', w: '100%', h: '50px' },
        { form: 'Text', text: 'Test 2', size: '30px' },
        { form: 'Decal', colour: 'rgba(0, 0, 120, 0.36)' }
      ]);
      
      let usersReal = mainReal.addReal('test2.users', [
        { form: 'Geom', w: '100%', h: '50px' },
        { form: 'Axis1d', axis: 'x', dir: '+', mode: 'compactCenter' },
        { form: 'Decal', colour: 'rgba(80, 0, 120, 0.36)' }
      ]);
      
      dep.scp(appRec, 'test2.user', (user, dep) => {
        
        let userReal = dep(usersReal.addReal('test2.user', { text: '<unknown>' }, [
          { form: 'Geom', h: '50px' },
          { form: 'Text', size: '20px' },
          { form: 'Decal', colour: 'rgba(255, 255, 255, 0.2)' }
        ]));
        dep(user.valueSrc.route(
          ({ name='<unknown>' }={}) => userReal.mod({ text: name })
        ));
        
      });
      
      let itemsReal = mainReal.addReal('test2.items', [
        { form: 'Geom', w: '100%', h: 'calc(100% - 100px)' },
        { form: 'Axis1d', axis: 'y', flow: '+', mode: 'stack' },
        { form: 'Decal', colour: 'rgba(0, 0, 120, 0.05)' }
      ]);
      
      let addItemAct = dep(hut.enableAction('test2.addItem', () => void hut.addRecord('test2.item', [ appRec ], '') ));
      let addItemReal = itemsReal.addReal('test2.addItem', [
        { form: 'Geom', w: '100%', h: '50px' },
        { form: 'Text', text: 'Add Item', size: '20px' },
        { form: 'Decal', colour: 'rgba(0, 0, 120, 0.8)', text: { colour: 'white' } },
        { form: 'Press', pressFn: () => addItemAct.act() }
      ]);
      
      dep.scp(appRec, 'test2.item', (item, dep) => {
        
        let updItemAct = dep(hut.enableAction(`test2.updItem.${item.uid}`, ({ val }) => void item.setValue(val) ));
        let remItemAct = dep(hut.enableAction(`test2.remItem.${item.uid}`, () => void item.end() ));
        
        let itemReal = dep(itemsReal.addReal('test2.item', { order: item.uid.encodeInt() }, [
          { form: 'Geom', w: '100%', h: '3em' },
          { form: 'Axis1d', axis: 'x', dir: '+', mode: 'compactCenter' }
        ]));
        
        itemReal.addReal('test2.itemText', { textInputSrc: item.valueSrc }, [
          { form: 'Geom', w: 'calc(30% + 50px)', h: '100%' },
          { form: 'TextInput', inputPrompt: 'Item Value', textInputFn: val => updItemAct.act({ val }) },
          { form: 'Decal', colour: 'rgba(0, 0, 255, 0.1)'}
        ]);
        itemReal.addReal('test2.del', [
          { form: 'Geom', w: '50px', h: '100%' },
          { form: 'Press', pressFn: () => remItemAct.act() },
          { form: 'Decal', colour: 'rgba(255, 0, 0, 0.1)'}
        ]);
        
      });
      
    }
    
  });
  
};
