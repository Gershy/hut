global.rooms['promo.hut.documentation.literature'] = async () => {
  
  let { Literature, Content } = await getRoom('literature');
  
  let content = Content({ name: 'root', desc: 'Hut' });
  
  content.seek('news').desc                          = 'News';
  
  content.seek('beginner').desc                      = 'Introduction to Hut';
  content.seek('beginner.starting').desc             = 'Getting Started';
  content.seek('beginner.starting.install').desc     = 'Install';
  content.seek('beginner.starting.tutorial').desc    = 'Tutorial';
  content.seek('beginner.starting.philosophy').desc  = 'Philosophy'; // "All devs should naturally have access to enterprise-level features"
  content.seek('beginner.starting.glossary').desc    = 'Glossary'; // Explain meaning of "Above" and "Below", maybe even "fwd", "bak", "Tmp", "Prm", etc!
  
  content.seek('docs').desc                          = 'Documentation';
  
  content.seek('docs.logic').desc                    = 'Logic';
  content.seek('docs.logic.AllTmp').desc             = 'AllTmp';
  content.seek('docs.logic.AnyTmp').desc             = 'AnyTmp';
  content.seek('docs.logic.Chooser').desc            = 'Chooser';
  content.seek('docs.logic.BatchSrc').desc           = 'BatchSrc';
  content.seek('docs.logic.MapSrc').desc             = 'MapSrc';
  content.seek('docs.logic.MemSrc').desc             = 'MemSrc';
  content.seek('docs.logic.Scope').desc              = 'Scope';
  content.seek('docs.logic.SetSrc').desc             = 'SetSrc';
  content.seek('docs.logic.TimerSrc').desc           = 'TimerSrc';
  content.seek('docs.logic.ToggleSrc').desc          = 'ToggleSrc';
  
  content.seek('docs.record').desc                   = 'Record';
  content.seek('docs.record.Manager').desc           = 'Manager';
  content.seek('docs.record.Record').desc            = 'Record';
  content.seek('docs.record.RelHandler').desc        = 'RelHandler';
  content.seek('docs.record.Type').desc              = 'Type';
  content.seek('docs.record.Group').desc             = 'Group';
  content.seek('docs.record.bank').desc              = 'Banks';
  content.seek('docs.record.bank.WeakBank').desc     = 'WeakBank';
  content.seek('docs.record.bank.KeepBank').desc     = 'KeepBank';
  
  return Literature({ content });
  
};