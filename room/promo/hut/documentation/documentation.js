global.rooms['promo.hut.documentation'] = async docKeep => {
  
  let rooms = await getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'promo.hut.documentation.literature',
  ]);
  let { Hinterland, HtmlBrowserHabitat, literature } = rooms;
  
  return Hinterland({
    prefix: 'doc',
    habitats: [ HtmlBrowserHabitat() ],
    above: async (experience, dep) => {
      
      /// {ABOVE=
      
      dep(literature.activateAbove(experience));
      
      /// =ABOVE}
      
    },
    below: async (experience, dep) => {
      
      experience.real.addLayout('Geom', { w: '100%', h: '100%' });
      experience.real.addLayout('Decal', { colour: '#6050f0' });
      
      
    }
  })
  
};