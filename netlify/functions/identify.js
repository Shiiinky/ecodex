/**
 * EcoDex identify — Google Cloud Vision Label Detection
 * Set env var GOOGLE_VISION_API_KEY in Netlify.
 * Free tier: first 1000 units/month.
 */
const LABEL_TO_SPECIES = {
  cat: 'cat', kitten: 'cat', feline: 'cat',
  dog: 'dog', puppy: 'dog', canine: 'dog',
  fox: 'fox', hedgehog: 'hedgehog', squirrel: 'squirrel',
  rabbit: 'rabbit', hare: 'hare', badger: 'badger',
  deer: 'deer', roe: 'deer', boar: 'boar', 'wild boar': 'boar',
  otter: 'otter', bat: 'bat', seal: 'seal', dolphin: 'dolphin',
  chamois: 'chamois', goat: 'chamois', lynx: 'lynx', beaver: 'beaver',
  mole: 'mole', mouse: 'shrew', rat: 'shrew',
  bird: 'sparrow', sparrow: 'sparrow', robin: 'robin', blackbird: 'blackbird',
  tit: 'blue_tit', 'blue tit': 'blue_tit', chickadee: 'blue_tit', owl: 'owl',
  pigeon: 'pigeon', dove: 'dove', crow: 'crow', magpie: 'magpie', raven: 'crow',
  swallow: 'swallow', swift: 'swift', woodpecker: 'woodpecker',
  duck: 'duck', mallard: 'duck', heron: 'heron', stork: 'stork',
  eagle: 'golden_eagle', buzzard: 'buzzard', hawk: 'buzzard', kestrel: 'kestrel', falcon: 'kestrel',
  seagull: 'seagull', gull: 'seagull', flamingo: 'flamingo', puffin: 'puffin',
  jay: 'jay', finch: 'finch', goldfinch: 'goldfinch', wren: 'wren',
  insect: 'ladybird', beetle: 'stag_beetle', ladybug: 'ladybird', ladybird: 'ladybird',
  bee: 'honeybee', honeybee: 'honeybee', bumblebee: 'bumblebee',
  butterfly: 'butterfly', dragonfly: 'dragonfly', damselfly: 'damselfly',
  ant: 'ant', fly: 'fly', mosquito: 'mosquito',
  cricket: 'cricket', grasshopper: 'grasshopper', wasp: 'wasp', hornet: 'hornet',
  mantis: 'mantis', cicada: 'cicada',
  frog: 'frog', toad: 'toad', amphibian: 'frog',
  salamander: 'salamander', newt: 'newt',
  lizard: 'lizard', gecko: 'wall_gecko',
  snake: 'grass_snake', viper: 'viper',
  animal: null, mammal: null, wildlife: null, pet: null
};

function mapLabelToKey(desc) {
  const d = (desc || '').toLowerCase().trim();
  if (LABEL_TO_SPECIES[d] !== undefined) return LABEL_TO_SPECIES[d];
  for (const [k, v] of Object.entries(LABEL_TO_SPECIES)) {
    if (d.includes(k) || k.includes(d)) return v;
  }
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const image = body.image;
  if (!image || typeof image !== 'string') return json(400, { error: 'Missing image' });

  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    return json(200, {
      offline: true,
      message: 'GOOGLE_VISION_API_KEY non configuree sur Netlify',
      label: null
    });
  }

  const b64 = image.replace(/^data:image\/\w+;base64,/, '');

  try {
    const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(key);
    const payload = {
      requests: [{
        image: { content: b64 },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 15 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 5 }
        ]
      }]
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Vision error', data);
      return json(200, { error: 'Vision API error', detail: data.error || data });
    }

    const resp = data.responses && data.responses[0];
    if (!resp) return json(200, { notAnimal: true });

    const labels = (resp.labelAnnotations || []).map(l => ({ desc: l.description, score: l.score }));
    const objects = (resp.localizedObjectAnnotations || []).map(o => ({ desc: o.name, score: o.score }));
    const combined = [...objects, ...labels].sort((a, b) => (b.score || 0) - (a.score || 0));

    const animalish = combined.filter(x => {
      const d = (x.desc || '').toLowerCase();
      return /animal|mammal|bird|insect|amphibian|reptile|cat|dog|fox|wildlife|fauna|pet|bee|butterfly|frog|lizard|snake|owl|deer|rabbit/.test(d)
        || mapLabelToKey(x.desc);
    });

    const top = (animalish[0] || combined[0]);
    if (!top) return json(200, { notAnimal: true, labels });

    const speciesKey = mapLabelToKey(top.desc);
    if (!speciesKey) {
      const isAnimal = animalish.length > 0;
      if (!isAnimal) return json(200, { notAnimal: true, labels });
      return json(200, {
        label: top.desc,
        score: top.score,
        labels,
        species: {
          common_name_fr: top.desc,
          scientific_name: top.desc,
          emoji: '🐾',
          slug: top.desc.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        }
      });
    }

    return json(200, {
      label: top.desc,
      score: top.score,
      labels,
      species: { slug: speciesKey },
      mappedKey: speciesKey
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(obj) };
}
