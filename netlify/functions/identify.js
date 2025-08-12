// netlify/functions/identify.js
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.55');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

const ANIMAL_KEYWORDS = [
  'animal','mammal','bird','reptile','amphibian','fish','insect','arachnid',
  'cat','dog','puppy','kitten','canine','feline','cow','horse','goat','sheep','pig','boar','rabbit','hare','squirrel','mouse','rat','hamster','gerbil','ferret','hedgehog',
  'fox','wolf','lynx','leopard','tiger','lion','cheetah','panther',
  'monkey','ape','gorilla','chimpanzee','lemur','bat',
  'bear','raccoon','skunk','badger','marten','otter','seal','whale','dolphin',
  'deer','moose','elk','bison','buffalo','gazelle','antelope',
  'camel','llama','alpaca','kangaroo','koala',
  'boar',
  'chicken','rooster','duck','goose','swan','eagle','hawk','owl','pigeon','parrot','sparrow','finch','tit','swallow','crow','raven','magpie',
  'ibis','heron','stork','flamingo','pelican','gull','tern',
  'shark','ray','salmon','trout','carp','pike','cod','tuna',
  'lizard','snake','turtle','tortoise','crocodile','alligator',
  'frog','toad','newt','salamander',
  'butterfly','moth','bee','wasp','hornet','ant','beetle','dragonfly','fly','mosquito','spider','scorpion','snail','slug','crab','lobster','shrimp'
];

function isAnimalName(name=''){
  const s = String(name||'').toLowerCase();
  return ANIMAL_KEYWORDS.some(k => s.includes(k));
}

const TIPS = {
  'domestic cat': 'Stérilise et identifie le chat; eau fraîche et coin au calme; garde la litière propre.',
  'cat': 'Approche calmement, évite les gestes brusques. Les chats aiment les zones en hauteur.',
  'dog': 'Demande l’accord du propriétaire avant d’approcher. Eau à disposition en été.',
  'hedgehog': 'Laisse un tas de feuilles/branches au jardin; jamais de lait (eau uniquement).',
  'blue tit': 'Pose un nichoir orienté E/SE à 2–3 m; loin des prédateurs.',
  'bird': 'Évite le pain; graines adaptées en hiver, eau propre l’été.'
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    if (PROVIDER !== 'google') {
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn('[identify] GOOGLE_API_KEY missing');
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const base64 = image.split(',')[1];

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const payload = {
      requests: [{
        image: { content: base64 },
        features: [
          { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
          { type: 'LABEL_DETECTION', maxResults: 10 },
          { type: 'WEB_DETECTION', maxResults: 10 }
        ],
        imageContext: { languageHints: ['fr', 'en'] }
      }]
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      console.error('[identify] Vision API error:', await r.text());
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const data = await r.json();
    const resp = data?.responses?.[0] || {};
    const labels = resp.labelAnnotations || [];
    const objects = resp.localizedObjectAnnotations || [];
    const web = resp.webDetection || {};

    function bestAnimalCandidate(){
      // priority 1: objects (localized) with animal-like name
      const obj = objects
        .filter(o => (o.score||0) >= MIN_CONFIDENCE && isAnimalName(o.name))
        .sort((a,b)=>(b.score||0)-(a.score||0))[0];
      if (obj) return { name: obj.name, score: obj.score || 0 };

      // priority 2: labels (often include breeds)
      const lab = labels
        .filter(l => (l.score||0) >= MIN_CONFIDENCE && isAnimalName(l.description))
        .sort((a,b)=>(b.score||0)-(a.score||0))[0];
      if (lab) return { name: lab.description, score: lab.score || 0 };

      // priority 3: web entities (breed-level in many cases)
      const webEnt = (web.webEntities||[])
        .filter(w => (w.score||0) >= 0.6 && w.description && isAnimalName(w.description))
        .sort((a,b)=>(b.score||0)-(a.score||0))[0];
      if (webEnt) return { name: webEnt.description, score: webEnt.score || 0 };

      return null;
    }

    const best = bestAnimalCandidate();
    if (!best) {
      // Not an animal
      return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
    }

    // Enrich name for FR display
    const lower = best.name.toLowerCase();
    let display = best.name;
    if (lower === 'cat') display = 'Chat domestique';
    if (lower === 'dog') display = 'Chien domestique';
    if (lower.includes('blue tit')) display = 'Mésange bleue';
    if (lower.includes('hedgehog')) display = 'Hérisson';

    const tip = TIPS[lower] || TIPS[display.toLowerCase()] || 'Observe sans déranger; garde tes distances et ne nourris pas sans conseil local.';

    return {
      statusCode: 200,
      body: JSON.stringify({
        label: display,
        score: Math.max(Math.min(best.score, 1), 0),
        tip
      })
    };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
