global.rooms['promo.hut.documentation'] = async (roomName, docKeep) => {
  
  let rooms = await getRooms([
    'Hinterland',
    'habitat.HtmlBrowserHabitat',
    'promo.hut.documentation.literature',
  ]);
  let { Hinterland, HtmlBrowserHabitat, literature } = rooms;
  
  return Hinterland({
    prefix: 'doc',
    habitats: [ HtmlBrowserHabitat() ],
    /// {ABOVE=
    above: async (experience, dep) => {
      
    },
    /// =ABOVE}
    below: async (experience, dep) => {
      
      dep(await literature.activateBelow(experience));
      
    }
  })
  
};