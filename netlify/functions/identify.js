
// netlify/functions/identify.js - v3.3 (softer animal filter + alias mapping + Supabase upload)
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.55');

const PROVIDER = 'google';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

const sHeaders = SUPABASE_URL && SUPABASE_SERVICE_ROLE ? {
  'apikey': SUPABASE_SERVICE_ROLE,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
  'Content-Type': 'application/json'
} : null;

function normLabel(s=''){
  return (s || '').toLowerCase().trim().replace(/\s+/g,' ');
}

function isAnimalLabel(label){
  const l = normLabel(label);
  const allow = [
    // broad
    'animal','mammal','bird','avian','reptile','amphibian','fish','insect','arthropod','spider','arachnid',
    // common pets
    'cat','dog','puppy','kitten',
    // frequent families/terms
    'feline','canine','rodent','mustelid','ungulate','equid','herbivore','carnivore','omnivore','vertebrate',
    // explicit species words
    'hedgehog','fox','deer','rabbit','hare','squirrel','boar','badger','bear','wolf','horse','cow','sheep','goat',
    'duck','goose','swan','pigeon','sparrow','robin','magpie','crow','gull','heron','eagle','owl',
    'frog','toad','lizard','snake','turtle',
    'butterfly','dragonfly','bee','bumblebee','ladybird','ladybug'
  ];
  return allow.some(k => l.includes(k));
}

function isNotAnimalLabel(label){
  const l = normLabel(label);
  const block = [
    'floor','wall','ceiling','furniture','paper','document','text','human','person','people','man','woman',
    'face','beard','hair','skin','selfie','portrait','eyebrow','nose','mouth','eye','forehead','ear',
    'building','road','carpet','tile','ceramic','plastic','metal','wood','clothing','shirt','pants','shoe','hat'
  ];
  return block.some(k => l.includes(k));
}

async function callVision(base64){
  if(!GOOGLE_API_KEY) return null;
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
  const payload = {
    requests: [{
      image: { content: base64 },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 20 },
        { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
        { type: 'WEB_DETECTION', maxResults: 5 }
      ],
      imageContext: { languageHints: ['fr','en'] }
    }]
  };
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if(!r.ok) {
    const t = await r.text();
    console.error('[vision] http', r.status, t);
    return null;
  }
  return await r.json();
}

async function uploadToSupabase(buffer, ext='jpg'){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !buffer) return { url: null };
  const name = `obs_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const u = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(name)}`;
  const res = await fetch(u, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'apikey': SUPABASE_SERVICE_ROLE,
      'Content-Type': 'image/jpeg'
    },
    body: buffer
  });
  if(!res.ok){
    console.error('[supabase upload] failed', res.status, await res.text());
    return { url: null };
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(name)}`;
  return { url: publicUrl };
}

async function findSpeciesId(labelRaw){
  try{
    if(!sHeaders) return null;
    const q = normLabel(labelRaw);
    // exact ilike
    let url = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(q)}`;
    let r = await fetch(url, { headers: sHeaders });
    if(r.ok){
      const rows = await r.json();
      if(rows.length) return rows[0].species_id;
    }
    // variants
    const candidates = [q.replace(/ +/g,' '), q.replace(/-?haired/g,' hair'), q.split(' ').slice(-2).join(' ')];
    for(const c of candidates){
      const u = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(c)}`;
      const rr = await fetch(u, { headers: sHeaders });
      if(rr.ok){
        const rows = await rr.json();
        if(rows.length) return rows[0].species_id;
      }
    }
    // prefix
    const p = q.split(' ')[0];
    const u2 = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(p + '%')}`;
    const r2 = await fetch(u2, { headers: sHeaders });
    if(r2.ok){
      const rows = await r2.json();
      if(rows.length) return rows[0].species_id;
    }
  }catch(e){
    console.error('[alias] error', e.message);
  }
  return null;
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { image, location } = JSON.parse(event.body || '{}');
    if(!image || typeof image !== 'string' || !image.startsWith('data:image')){
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const base64 = image.split(',')[1];
    const vision = await callVision(base64);
    if(!vision) return { statusCode: 200, body: JSON.stringify({}) };

    const resp = vision?.responses?.[0] || {};
    const labels = (resp.labelAnnotations || []).filter(x => (x.score || 0) >= MIN_CONFIDENCE);
    const objects = (resp.localizedObjectAnnotations || []);
    const web = (resp.webDetection?.bestGuessLabels || []).map(x => ({ description: x.label }));

    // decide animal vs not animal using all sources
    const allLabels = [
      ...labels.map(l => l.description),
      ...objects.map(o => o.name),
      ...web.map(w => w.description)
    ];

    const hasAnimal = allLabels.some(isAnimalLabel);
    const hasBlock = allLabels.some(isNotAnimalLabel);

    if(!hasAnimal && hasBlock){
      return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
    }
    if(!hasAnimal){
      // be permissive: if any object is known animal container words like 'cat' in name, accept
      const anyCatDog = allLabels.some(s => /\b(cat|dog|bird|mammal|animal)\b/i.test(s||''));
      if(!anyCatDog){
        return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
      }
    }

    // choose best label: prefer object names, then high score label
    let bestLabel = null, bestScore = null;
    if(objects.length){
      const animalObjs = objects.filter(o => isAnimalLabel(o.name));
      if(animalObjs.length){
        bestLabel = animalObjs[0].name;
        bestScore = animalObjs[0].score || null;
      }
    }
    if(!bestLabel && labels.length){
      bestLabel = labels[0].description;
      bestScore = labels[0].score || null;
    }
    if(!bestLabel && allLabels.length){
      bestLabel = allLabels[0];
      bestScore = null;
    }
    if(!bestLabel){
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    // upload image to Supabase if possible
    let photoUrl = null;
    try{
      const buf = Buffer.from(base64, 'base64');
      const up = await uploadToSupabase(buf, 'jpg');
      photoUrl = up.url;
    }catch(e){
      console.error('[upload] error', e.message);
    }

    // map to species_id via alias
    const species_id = await findSpeciesId(bestLabel);

    // insert observation
    if(SUPABASE_URL && SUPABASE_SERVICE_ROLE){
      const obsBody = {
        species_id,
        label_raw: bestLabel,
        score: bestScore,
        lat: location?.lat || null,
        lng: location?.lng || null,
        photo_url: photoUrl || null
      };
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/observations`, {
        method: 'POST', headers: { ...sHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(obsBody)
      });
      if(!ins.ok){
        console.error('[observations insert] failed', ins.status, await ins.text());
      }
    }

    return { statusCode: 200, body: JSON.stringify({ label: bestLabel, score: bestScore, photo: photoUrl, species_id }) };
  }catch(e){
    console.error(e);
    return { statusCode: 200, body: JSON.stringify({}) };
  }
};
