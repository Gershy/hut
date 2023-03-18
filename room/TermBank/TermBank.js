global.rooms['TermBank'] = async () => {
  
  let random = await getRoom('random');
  
  return form({ name: 'TermBank', props: (forms, Form) => ({
    
    $stockTerms: [
      'academician', 'acceptor', 'ace', 'achiever', 'adept', 'adherent', 'administrator',
      'admirer', 'adorer', 'advantage', 'adviser', 'advisor', 'advocate', 'aelurophile',
      'aerophile', 'aesthete', 'aid', 'aide', 'ailurophile', 'alannah', 'alleviator', 'ally',
      'almsgiver', 'almsperson', 'alternate', 'altruist', 'agent', 'ambassador', 'amoret',
      'angel', 'aficionada', 'aficionado', 'affluential', 'americophile', 'anglophile',
      'apostle', 'appreciator', 'apprentice', 'arctophile', 'arbiter', 'archetype',
      'architect', 'artisan', 'artist', 'artiste', 'ascendant', 'aspirant', 'asset',
      'assignee', 'assigner', 'assistant', 'associate', 'astrophile', 'athlete', 'attendant',
      'audiophile', 'author', 'authority', 'autodidact', 'baby', 'backbone', 'backer',
      'backup', 'baron', 'beatus', 'beauty', 'begetter', 'being', 'believer', 'belle',
      'benchmark', 'benefactor', 'benefactress', 'beneficiary', 'benefit', 'bestower',
      'bibliophile', 'bigwig', 'biophile', 'blessing', 'bodyguard', 'boss', 'booster',
      'brain', 'brass', 'brother', 'bud', 'buddy', 'buff', 'builder', 'campaigner',
      'captain', 'carer', 'caretaker', 'cartophile', 'catalyst', 'cause', 'celebrant',
      'celebrator', 'ceo', 'cfo', 'chair', 'chairperson', 'chamberlain', 'champ', 'champion',
      'chaperon', 'charmer', 'cherub', 'cherisher', 'chief', 'chieftan', 'child', 'chum',
      'cinephile', 'clerisy', 'climber', 'coadjutant', 'coadjutor', 'cognoscente',
      'cognoscenti', 'cohort', 'coiner', 'collaborator', 'colleague', 'collector',
      'comforter', 'commander', 'companion', 'compeller', 'complement', 'composer',
      'comrade', 'concierge', 'conductor', 'confederate', 'conferrer', 'confidant',
      'confrere', 'connoisseur', 'conservator', 'consoler', 'consul', 'consultant',
      'contributor', 'controller', 'convive', 'cornerstone', 'cosmocrat', 'cosmopolitan',
      'cosmopolite', 'councillor', 'counsel', 'counselor', 'counsellor', 'count', 'creator',
      'credit', 'crew', 'cub', 'curator', 'custodian', 'cynosure', 'dad', 'dancer',
      'darling', 'daughter', 'dean', 'dear', 'defender', 'deipnosophist', 'demophile',
      'designer', 'devisee', 'devisor', 'devotee', 'digerati', 'dilly', 'director',
      'disciple', 'discophile', 'discoverer', 'distributor', 'doer', 'doll', 'donee',
      'donor', 'doozy', 'doula', 'doyen', 'doyenne', 'dreamboat', 'duke', 'dynamo', 'earl',
      'ecstatic', 'einstein', 'elder', 'employer', 'enchanter', 'enchantress', 'encourager',
      'endorser', 'engineer', 'enkindler', 'enophile', 'ensurer', 'entertainer',
      'enthusiast', 'entrepreneur', 'epididact', 'epicure', 'epicurean', 'epitome',
      'ergophile', 'escort', 'essence', 'eudaimonist', 'example', 'exec', 'executive',
      'exemplar', 'excellency', 'experimenter', 'expert', 'exponent', 'facilitator',
      'family', 'fan', 'fancier', 'fascinator', 'fashioner', 'favourite', 'financier',
      'fireball', 'fireman', 'flame', 'folks', 'foodie', 'foodophile', 'force', 'forebearer',
      'forefather', 'foreman', 'forerunner', 'foreseer', 'foundation', 'founder', 'fount',
      'fountain', 'fountainhead', 'francophile', 'friend', 'gallophile', 'gastronome',
      'gastronomer', 'gastronomist', 'generator', 'gem', 'genius', 'gentleman',
      'gentlewoman', 'germanophile', 'gift', 'givee', 'giver', 'godparent', 'godsend',
      'gourmet', 'governor', 'grandee', 'grantee', 'grantor', 'grubstaker', 'guarantor',
      'guardian', 'guest', 'guide', 'guru', 'handler', 'head', 'heart', 'heartthrob',
      'height', 'heir', 'heiress', 'heliophile', 'hellenophile', 'help', 'helper',
      'helpmate', 'hero', 'heroine', 'highflier', 'hippophile', 'hit', 'homemaker',
      'hopeful', 'host', 'hotshot', 'humanitarian', 'husband', 'icon', 'iconophile', 'ideal',
      'idol', 'idolizer', 'illuminator', 'iluvshaina', 'improvement', 'inamorata',
      'inamorato', 'individual', 'indophile', 'industrialist', 'infant', 'influence',
      'influential','inheritor', 'initiator', 'innocent', 'innovator', 'inspiration',
      'inspirer', 'inspiriter', 'institutor', 'intellect', 'intellectual', 'intelligentsia',
      'intimate', 'introducer', 'inventor', 'invitee', 'inviter', 'jazzophile', 'keeper',
      'key', 'kingpin', 'knight', 'lady', 'lamb', 'latinophile', 'latitudinarian', 'laureate',
      'lead', 'leader', 'legatee', 'legator', 'legend', 'legislator', 'liberal',
      'libertarian', 'lieutenant', 'lightworker', 'linguaphile', 'livewire', 'logophile',
      'lord', 'lover', 'lulu', 'luminary', 'maestro', 'magician', 'magistrate', 'maker',
      'manager', 'marquess', 'marquis', 'marvel', 'master', 'mastermind', 'matriarch',
      'materfamilias', 'mediator', 'meditator', 'meliorist', 'mentor', 'metropolitan',
      'minder', 'miracle', 'mitigator', 'mate', 'model', 'mom', 'monitor', 'moppet',
      'mother', 'motor', 'mover', 'motivator', 'musicophile', 'mycophile', 'nabob',
      'neighbour', 'nemophilist', 'neophile', 'neonate', 'neoteric', 'nestling', 'newborn',
      'nipper', 'nobleman', 'nonesuch', 'notable', 'nurse', 'nursling', 'nurturer',
      'officer', 'official', 'offspring', 'oenophile', 'omnist', 'operator', 'optimist',
      'orchestrator', 'orchidophile', 'organizer', 'original', 'originator', 'ornithophile',
      'overseer', 'owner', 'pacifier', 'pal', 'paladin', 'pangloss', 'pansophist',
      'paraclete', 'paradigm', 'paragon', 'paramount', 'pard', 'parent', 'participant',
      'partisan', 'partner', 'paterfamilias', 'pathfinder', 'patriarch', 'patron', 'peach',
      'pearl', 'peacekeeper', 'peacemaker', 'peer', 'percipient', 'perfectibilian',
      'perfectibilist', 'perfectionist', 'performer', 'personality', 'persophile', 'pet',
      'phenom', 'phenomenon', 'philalethist', 'philanthropist', 'philomath', 'philogynist',
      'philonoist', 'philosopher', 'pigsney', 'pilot', 'pioneer', 'pinnacle', 'pinup',
      'pistol', 'planner', 'player', 'playmate', 'plum', 'pluviophile', 'poet', 'polymath',
      'pogonophile', 'possessor', 'postulant', 'potentate', 'powerhouse', 'preceptor',
      'premier', 'presence', 'presenter', 'president', 'prevailer', 'primogenitor', 'prince',
      'princess', 'principal', 'pro', 'proconsul', 'procreator', 'proctor', 'prodigy',
      'producer', 'professional', 'professor', 'progeny', 'progenitor', 'promoter',
      'promulgator', 'prophet', 'propitiator', 'proponent', 'proposer', 'proprietor',
      'protagonist', 'protean', 'protector', 'provider', 'publisher', 'purist', 'purveyor',
      'qualtagh', 'raconteur', 'raconteuse', 'reacher', 'receiver', 'recipient', 'reliever',
      'regulator', 'rejoicer', 'representative', 'researcher', 'resolver', 'resource',
      'retrophile', 'rewarder', 'romantic', 'romeo', 'rooter', 'ruler', 'runner',
      'russophile', 'sage', 'saint', 'saver', 'saviour', 'savant', 'schatzi', 'scholar',
      'scholarch', 'scion', 'scripter', 'sculptor', 'seeker', 'sentinel', 'servant',
      'server', 'sharpy', 'shaver', 'sinophile', 'sire', 'sister', 'skipper', 'smoothie',
      'soul', 'sovereign', 'specialist', 'sponsor', 'sprite', 'sprout', 'squire', 'standard',
      'star', 'stipendiary', 'strategist', 'socializer', 'socius', 'solon', 'something',
      'specialist', 'stabilizer', 'staker', 'steward', 'stipendiary', 'stripling', 'striver',
      'student', 'stylist', 'success', 'successor', 'sugar', 'suitor', 'superintendent',
      'superior', 'superman', 'superstar', 'superwoman', 'supervisor', 'supplier', 'support',
      'supporter', 'surety', 'survivor', 'swain', 'sweetheart', 'tadpole', 'teacher',
      'teammate', 'technophile', 'testator', 'thalassophile', 'thaumatologist', 'theodidact',
      'theotokos', 'thinker', 'titleholder', 'tootsie', 'tot', 'trailblazer', 'trainer',
      'treasure', 'trier', 'trustee', 'turophile', 'tutelary', 'tutor', 'tycoon',
      'typhlophile', 'underwriter', 'upholder', 'urchin', 'validator', 'valedictorian',
      'vaulter', 'victor', 'victress', 'victrix', 'videophile', 'viscount', 'vip', 'visitor',
      'visionary', 'virtuoso', 'volunteer', 'votary', 'warantee', 'warantor', 'warden',
      'wellspring', 'whip', 'whippersnapper', 'whiz', 'whizz', 'wife', 'winner', 'wizard',
      'wonder', 'wooer', 'wordsmith', 'workhorse', 'workmate', 'worshiper', 'writer',
      'wunderkind', 'youngster', 'younker', 'youth', 'xenophile'
    ],
    
    init: function(terms=Form.stockTerms, r=random.NativeRandom()) { // TODO: global.getRootRandom()?
      
      let [ initTerm, ...otherTerms ] = r.genShuffled(terms);
      this.termsHead = this.termsTail = { term: initTerm, next: null };
      for (let term of otherTerms) this.termsTail = this.termsTail.next = { term, next: null };
      
    },
    hold: function() {
      
      if (!this.termsHead) throw Error(`No terms available :'(`);
      
      let tmp = Tmp();
      let term = tmp.term = this.termsHead.term;
      this.termsHead = this.termsHead.next;
      
      tmp.endWith(() => {
        if (!this.termsHead) {
          this.termsHead = this.termsTail = { term, next: null };
        } else {
          this.termsTail = this.termsTail.next = { term, next: null };
        }
      });
      
      return tmp;
      
    },
    toArr: function() {
      let ret = [], ptr = this.termsHead;
      while (ptr) { ret.add(ptr.term); ptr = ptr.next; }
      return ret;
    },
    count: function() {
      let ret = 0, ptr = this.termsHead;
      while (ptr) { count++; ptr = ptr.next; }
      return ret;
    }
    
  })});
  
};
