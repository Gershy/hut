global.rooms['promo.hut.documentation.literature'] = async roomName => {
  
  let { Literature, Content } = await getRoom('literature');
  
  let content = Content({ name: 'root', desc: 'Hut' });
  let literature = Literature({ roomName, content });
  
  content.seek('news').desc                          = 'News';
  
  content.seek('beginner').desc                      = 'Intro to Hut';
  content.seek('beginner.starting').desc             = 'Getting Started';
  content.seek('beginner.starting.install').desc     = 'Install';
  content.seek('beginner.starting.tutorial').desc    = 'Tutorial';
  content.seek('beginner.starting.philosophy').desc  = 'Philosophy'; // "All devs should naturally have access to enterprise-level features", "There should be a single accepted way of implementing all mainstream industry requirements", "Devs working at all levels of sophistication (industry-level, startup, etc.) are really all doing the same thing and should use the same solutions", "Whenever we consider a cluster of software technologies which collectively solve a problem, we should conceptually draw a circle around the cluster and realize we are looking at a single solution."
  content.seek('beginner.starting.glossary').desc    = 'Glossary'; // Explain meaning of "Above" and "Below", maybe even "fwd", "bak", "Tmp", "Prm", etc!
  
  content.seek('docs').desc                          = 'Documentation';
  
  content.seek('docs.logic').desc                    = 'Logic';
  content.seek('docs.logic.alltmp').desc             = 'AllTmp';
  content.seek('docs.logic.anytmp').desc             = 'AnyTmp';
  content.seek('docs.logic.chooser').desc            = 'Chooser';
  content.seek('docs.logic.batchsrc').desc           = 'BatchSrc';
  content.seek('docs.logic.mapsrc').desc             = 'MapSrc';
  content.seek('docs.logic.memsrc').desc             = 'MemSrc';
  content.seek('docs.logic.scope').desc              = 'Scope';
  content.seek('docs.logic.setsrc').desc             = 'SetSrc';
  content.seek('docs.logic.timersrc').desc           = 'TimerSrc';
  content.seek('docs.logic.togglesrc').desc          = 'ToggleSrc';
  
  content.seek('docs.record').desc                   = 'Record';
  content.seek('docs.record.manager').desc           = 'Manager';
  content.seek('docs.record.record').desc            = 'Record';
  content.seek('docs.record.relhandler').desc        = 'RelHandler';
  content.seek('docs.record.type').desc              = 'Type';
  content.seek('docs.record.group').desc             = 'Group';
  content.seek('docs.record.bank').desc              = 'Banks';
  content.seek('docs.record.bank.weakbank').desc     = 'WeakBank';
  content.seek('docs.record.bank.keepbank').desc     = 'KeepBank';
  
  return literature;
  
};