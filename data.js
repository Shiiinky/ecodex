const REGIONS = {
  partout: { name:'Toute la France', bounds:null },
  nord: { name:'Nord', bounds:{ latMin:48.5, latMax:51.2, lngMin:1.5, lngMax:4.5 } },
  ouest: { name:'Ouest / Atlantique', bounds:{ latMin:46.0, latMax:49.0, lngMin:-5.0, lngMax:0.5 } },
  est: { name:'Est', bounds:{ latMin:47.0, latMax:49.5, lngMin:5.0, lngMax:8.3 } },
  centre: { name:'Centre', bounds:{ latMin:46.0, latMax:48.5, lngMin:0.5, lngMax:3.5 } },
  sud_ouest: { name:'Sud-Ouest', bounds:{ latMin:42.5, latMax:46.0, lngMin:-2.0, lngMax:2.5 } },
  sud_est: { name:'Sud-Est', bounds:{ latMin:43.5, latMax:46.5, lngMin:3.5, lngMax:7.5 } },
  mediterranee: { name:'Méditerranée', bounds:{ latMin:42.3, latMax:44.5, lngMin:2.5, lngMax:7.6 } },
  alpes: { name:'Alpes / Montagne', bounds:{ latMin:44.0, latMax:46.5, lngMin:5.5, lngMax:7.9 } }
};

const RARITY_XP = { commune:10, peu_commune:15, rare:25, epique:40 };
const RARITY_LABEL = { commune:'Commune', peu_commune:'Peu com.', rare:'Rare', epique:'Épique' };

const SPECIES = {
  hedgehog: { key:'hedgehog', name:"Hérisson d'Europe", sci:'Erinaceus europaeus', sprite:'🦔', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Protégé', tip:'Laisse un tas de feuilles au jardin.', zone:'Jardins, lisières' },
  fox: { key:'fox', name:'Renard roux', sci:'Vulpes vulpes', sprite:'🦊', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun', tip:'Nocturne, très adaptable.', zone:'Campagne, périurbain' },
  squirrel: { key:'squirrel', name:'Écureuil roux', sci:'Sciurus vulgaris', sprite:'🐿️', cat:'mammifere', rarity:'peu_commune', regions:['partout'], status:'Protégé', tip:'Plante des noisetiers.', zone:'Forêts, parcs' },
  badger: { key:'badger', name:'Blaireau européen', sci:'Meles meles', sprite:'🦡', cat:'mammifere', rarity:'peu_commune', regions:['partout'], status:'Commun', tip:'Terriers souvent en lisière de bois.', zone:'Bois, bocage' },
  hare: { key:'hare', name:"Lièvre d'Europe", sci:'Lepus europaeus', sprite:'🐇', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun', tip:'Actif au crépuscule dans les champs.', zone:'Champs, prairies' },
  bat: { key:'bat', name:'Chauve-souris', sci:'Chiroptera', sprite:'🦇', cat:'mammifere', rarity:'peu_commune', regions:['partout'], status:'Protégée', tip:'Installe un gîte à chauves-souris.', zone:'Greniers, forêts' },
  otter: { key:'otter', name:"Loutre d'Europe", sci:'Lutra lutra', sprite:'🦦', cat:'mammifere', rarity:'rare', regions:['ouest','sud_ouest','centre'], status:'Protégée', tip:'Indique des rivières de bonne qualité.', zone:'Rivières, estuaires' },
  chamois: { key:'chamois', name:'Chamois', sci:'Rupicapra rupicapra', sprite:'🐐', cat:'mammifere', rarity:'rare', regions:['alpes','sud_est'], status:'Commun montagne', tip:'Visible en altitude le matin.', zone:'Alpes, escarpements' },
  lynx: { key:'lynx', name:'Lynx boréal', sci:'Lynx lynx', sprite:'🐱', cat:'mammifere', rarity:'epique', regions:['est','alpes'], status:'Protégé / rare', tip:'Discret, signes de présence plutôt que vue.', zone:'Vosges, Jura, Alpes' },
  cat: { key:'cat', name:'Chat domestique', sci:'Felis catus', sprite:'🐱', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun / urbain', tip:'Stérilisation et collier anti-chasse aident la biodiversité.', zone:'Villes, villages, fermes' },
  dog: { key:'dog', name:'Chien', sci:'Canis familiaris', sprite:'🐕', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Compagnon', tip:'Tenir en laisse près des zones naturelles.', zone:'Partout avec l\'humain' },
  seal: { key:'seal', name:'Phoque veau-marin', sci:'Phoca vitulina', sprite:'🦭', cat:'mammifere', rarity:'rare', regions:['ouest','nord'], status:'Protégé', tip:'Observables en baie à marée basse.', zone:'Côtes Manche / Atlantique' },
  deer: { key:'deer', name:'Chevreuil', sci:'Capreolus capreolus', sprite:'🦌', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun', tip:'Crépusculaire en lisière.', zone:'Bois, campagnes' },
  boar: { key:'boar', name:'Sanglier', sci:'Sus scrofa', sprite:'🐗', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun', tip:'Traces en forêt.', zone:'Forêts, cultures' },
  rabbit: { key:'rabbit', name:'Lapin de garenne', sci:'Oryctolagus cuniculus', sprite:'🐰', cat:'mammifere', rarity:'commune', regions:['partout'], status:'Commun', tip:'Dunes et landes.', zone:'Landes, bocage' },
  blue_tit: { key:'blue_tit', name:'Mésange bleue', sci:'Cyanistes caeruleus', sprite:'🐦', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commune', tip:'Nichoir au printemps.', zone:'Parcs, jardins' },
  robin: { key:'robin', name:'Rouge-gorge', sci:'Erithacus rubecula', sprite:'🐦', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commun', tip:'Mangeoire en hiver.', zone:'Jardins, bois' },
  blackbird: { key:'blackbird', name:'Merle noir', sci:'Turdus merula', sprite:'🐦', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commun', tip:'Aime les haies fruitières.', zone:'Jardins, haies' },
  sparrow: { key:'sparrow', name:'Moineau domestique', sci:'Passer domesticus', sprite:'🐦', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commun', tip:'Garde des cavités sous toiture.', zone:'Villes, villages' },
  owl: { key:'owl', name:'Chouette hulotte', sci:'Strix aluco', sprite:'🦉', cat:'oiseau', rarity:'peu_commune', regions:['partout'], status:'Protégée', tip:'Écoute les hululements la nuit.', zone:'Forêts, parcs' },
  kingfisher: { key:'kingfisher', name:'Martin-pêcheur', sci:'Alcedo atthis', sprite:'🐦', cat:'oiseau', rarity:'peu_commune', regions:['partout'], status:'Protégé', tip:'Berges naturelles non bétonnées.', zone:'Rivières, étangs' },
  flamingo: { key:'flamingo', name:'Flamant rose', sci:'Phoenicopterus roseus', sprite:'🦩', cat:'oiseau', rarity:'rare', regions:['mediterranee'], status:'Protégé', tip:'Camargue et lagunes salées.', zone:'Camargue, étangs littoraux' },
  beeeater: { key:'beeeater', name:"Guêpier d'Europe", sci:'Merops apiaster', sprite:'🐦', cat:'oiseau', rarity:'rare', regions:['mediterranee','sud_ouest','sud_est'], status:'Migrateur', tip:"Visible l'été, colonies en talus.", zone:'Sud, vallées' },
  golden_eagle: { key:'golden_eagle', name:'Aigle royal', sci:'Aquila chrysaetos', sprite:'🦅', cat:'oiseau', rarity:'epique', regions:['alpes'], status:'Protégé', tip:'Maître des cieux alpins.', zone:'Alpes, massifs' },
  puffin: { key:'puffin', name:'Macareux moine', sci:'Fratercula arctica', sprite:'🐧', cat:'oiseau', rarity:'rare', regions:['ouest','nord'], status:'Protégé', tip:'Falaises maritimes au printemps.', zone:'Bretagne, Manche' },
  magpie: { key:'magpie', name:'Pie bavarde', sci:'Pica pica', sprite:'🐦‍⬛', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commune', tip:'Très adaptable en ville.', zone:'Villes, campagnes' },
  duck: { key:'duck', name:'Canard colvert', sci:'Anas platyrhynchos', sprite:'🦆', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commun', tip:'Plans d eau urbains.', zone:'Étangs, rivières' },
  heron: { key:'heron', name:'Héron cendré', sci:'Ardea cinerea', sprite:'🦢', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Commun', tip:'Pêche en eau peu profonde.', zone:'Zones humides' },
  swallow: { key:'swallow', name:'Hirondelle rustique', sci:'Hirundo rustica', sprite:'🐦', cat:'oiseau', rarity:'commune', regions:['partout'], status:'Migratrice', tip:'Nids sous les auvents.', zone:'Campagne, fermes' },
  ladybird: { key:'ladybird', name:'Coccinelle à 7 points', sci:'Coccinella septempunctata', sprite:'🐞', cat:'insecte', rarity:'commune', regions:['partout'], status:'Utile', tip:'Alliée anti-pucerons.', zone:'Jardins, haies' },
  honeybee: { key:'honeybee', name:'Abeille domestique', sci:'Apis mellifera', sprite:'🐝', cat:'insecte', rarity:'commune', regions:['partout'], status:'Utile', tip:'Plantes mellifères au jardin.', zone:'Prairies, jardins' },
  butterfly: { key:'butterfly', name:'Paon-du-jour', sci:'Aglais io', sprite:'🦋', cat:'insecte', rarity:'commune', regions:['partout'], status:'Commun', tip:'Laisse des orties pour les chenilles.', zone:'Jardins, friches' },
  dragonfly: { key:'dragonfly', name:'Libellule', sci:'Anisoptera', sprite:'🪰', cat:'insecte', rarity:'peu_commune', regions:['partout'], status:'Indicateur', tip:'Préserve les zones humides.', zone:'Étangs, berges' },
  mantis: { key:'mantis', name:'Mante religieuse', sci:'Mantis religiosa', sprite:'🦗', cat:'insecte', rarity:'peu_commune', regions:['mediterranee','sud_est','sud_ouest'], status:'Protégée (certaines zones)', tip:'Chasseuse des jardins secs.', zone:'Sud, garrigues' },
  stag_beetle: { key:'stag_beetle', name:'Lucane cerf-volant', sci:'Lucanus cervus', sprite:'🪲', cat:'insecte', rarity:'rare', regions:['ouest','centre','sud_ouest','est'], status:'Protégé', tip:'Bois mort au sol = nurserie.', zone:'Forêts de chênes' },
  cicada: { key:'cicada', name:'Cigale', sci:'Cicadidae', sprite:'🦗', cat:'insecte', rarity:'commune', regions:['mediterranee','sud_est'], status:'Emblématique', tip:"Chant d'été en garrigue.", zone:'Méditerranée' },
  ant: { key:'ant', name:'Fourmi', sci:'Formicidae', sprite:'🐜', cat:'insecte', rarity:'commune', regions:['partout'], status:'Commun', tip:'Ingénieures des sols.', zone:'Partout' },
  frog: { key:'frog', name:'Grenouille verte', sci:'Pelophylax', sprite:'🐸', cat:'amphibien', rarity:'commune', regions:['partout'], status:'Indicateur', tip:'Mares naturelles sans poissons.', zone:'Mares, zones humides' },
  toad: { key:'toad', name:'Crapaud commun', sci:'Bufo bufo', sprite:'🐸', cat:'amphibien', rarity:'commune', regions:['partout'], status:'Commun', tip:'Passages à crapauds au printemps.', zone:'Jardins, bois humides' },
  salamander: { key:'salamander', name:'Salamandre tachetée', sci:'Salamandra salamandra', sprite:'🦎', cat:'amphibien', rarity:'peu_commune', regions:['partout'], status:'Protégée', tip:'Active par temps humide.', zone:'Forêts humides' },
  lizard: { key:'lizard', name:'Lézard des murailles', sci:'Podarcis muralis', sprite:'🦎', cat:'amphibien', rarity:'commune', regions:['partout'], status:'Commun', tip:'Murets de pierre sèche.', zone:'Murs, rochers' },
  green_lizard: { key:'green_lizard', name:'Lézard vert', sci:'Lacerta bilineata', sprite:'🦎', cat:'amphibien', rarity:'peu_commune', regions:['ouest','sud_ouest','sud_est','mediterranee'], status:'Protégé', tip:'Haies ensoleillées.', zone:'Bocage, garrigue' },
  viper: { key:'viper', name:'Vipère aspic', sci:'Vipera aspis', sprite:'🐍', cat:'amphibien', rarity:'peu_commune', regions:['centre','sud_ouest','sud_est','alpes'], status:'Protégée', tip:'Respecte, ne touche pas.', zone:'Lisières, pierriers' }
};

const RANKS = [
  { min:0, name:'Observateur novice' },
  { min:50, name:'Naturaliste curieux' },
  { min:150, name:'Explorateur de terrain' },
  { min:300, name:'Gardien des habitats' },
  { min:500, name:'Maître EcoDex' },
  { min:800, name:'Légende de la nature' }
];

const BADGE_DEFS = [
  { id:'first', name:'Première capture', ico:'🌱', desc:'Enregistre ta 1re espèce', test:s=>Object.keys(s.discovered).length>=1 },
  { id:'birds3', name:'Oiseleur', ico:'🐦', desc:'3 oiseaux différents', test:s=>countCat(s,'oiseau')>=3 },
  { id:'insects3', name:'Entomologiste', ico:'🐞', desc:'3 insectes', test:s=>countCat(s,'insecte')>=3 },
  { id:'mammals3', name:'Mammalogiste', ico:'🦊', desc:'3 mammifères', test:s=>countCat(s,'mammifere')>=3 },
  { id:'herps2', name:'Herpétologue', ico:'🐸', desc:'2 amphibiens/reptiles', test:s=>countCat(s,'amphibien')>=2 },
  { id:'rare1', name:'Chanceux', ico:'✨', desc:'1 espèce rare ou épique', test:s=>countRarity(s,['rare','epique'])>=1 },
  { id:'epic1', name:'Légendaire', ico:'👑', desc:'1 espèce épique', test:s=>countRarity(s,['epique'])>=1 },
  { id:'local5', name:'Local hero', ico:'📍', desc:'5 espèces de ta région', test:s=>countLocal(s)>=5 },
  { id:'ten', name:'Collectionneur', ico:'📖', desc:'10 espèces', test:s=>Object.keys(s.discovered).length>=10 },
  { id:'twenty', name:'Encyclopédie', ico:'🏆', desc:'20 espèces', test:s=>Object.keys(s.discovered).length>=20 },
  { id:'xp300', name:'Endurant', ico:'⚡', desc:'300 XP cumulés', test:s=>s.xp>=300 },
  { id:'region_med', name:'Méditerranéen', ico:'☀️', desc:'3 espèces méditerranéennes', test:s=>countRegion(s,'mediterranee')>=3 }
];
