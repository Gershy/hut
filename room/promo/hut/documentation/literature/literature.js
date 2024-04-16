global.rooms['promo.hut.documentation.literature'] = async roomName => {
  
  let { Literature, Content } = await getRoom('literature');
  
  let content = Content({ name: 'root', desc: 'Hut' });
  let literature = Literature({ roomName, content });
  
  content.dive('news').desc                          = 'News';
  
  content.dive('beginner').desc                      = 'Intro to Hut';
  content.dive('beginner.starting').desc             = 'Getting Started';
  content.dive('beginner.starting.install').desc     = 'Install';
  content.dive('beginner.starting.tutorial').desc    = 'Tutorial';
  content.dive('beginner.starting.philosophy').desc  = 'Philosophy'; // "All devs should naturally have access to enterprise-level features", "There should be a single accepted way of implementing all mainstream industry requirements", "Devs working at all levels of sophistication (industry-level, startup, etc.) are really all doing the same thing and should use the same solutions", "Whenever we consider a cluster of software technologies which collectively solve a problem, we should conceptually draw a circle around the cluster and realize we are looking at a single solution."
  content.dive('beginner.starting.glossary').desc    = 'Glossary'; // Explain meaning of "Above" and "Below", maybe even "fwd", "bak", "Tmp", "Prm", etc!
  
  content.dive('docs').desc                          = 'Documentation';
  
  content.dive('docs.logic').desc                    = 'Logic';
  content.dive('docs.logic.alltmp').desc             = 'AllTmp';
  content.dive('docs.logic.anytmp').desc             = 'AnyTmp';
  content.dive('docs.logic.chooser').desc            = 'Chooser';
  content.dive('docs.logic.batchsrc').desc           = 'BatchSrc';
  content.dive('docs.logic.mapsrc').desc             = 'MapSrc';
  content.dive('docs.logic.memsrc').desc             = 'MemSrc';
  content.dive('docs.logic.scope').desc              = 'Scope';
  content.dive('docs.logic.setsrc').desc             = 'SetSrc';
  content.dive('docs.logic.timersrc').desc           = 'TimerSrc';
  content.dive('docs.logic.togglesrc').desc          = 'ToggleSrc';
  
  content.dive('docs.record').desc                   = 'Record';
  content.dive('docs.record.manager').desc           = 'Manager';
  content.dive('docs.record.record').desc            = 'Record';
  content.dive('docs.record.relhandler').desc        = 'RelHandler';
  content.dive('docs.record.type').desc              = 'Type';
  content.dive('docs.record.group').desc             = 'Group';
  content.dive('docs.record.bank').desc              = 'Banks';
  content.dive('docs.record.bank.weakbank').desc     = 'WeakBank';
  content.dive('docs.record.bank.keepbank').desc     = 'KeepBank';
  
  return literature;
  
};