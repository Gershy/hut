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
      dep(literature.activate(experience));
      /// =ABOVE}
      
    },
    below: async (experience, dep) => {
      
      
      
    }
  })
  
};