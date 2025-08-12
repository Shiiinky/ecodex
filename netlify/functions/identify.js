// netlify/functions/identify.js (v3.4.1b)
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.5');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

// Supabase env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

const sHeaders = {
  'apikey': SUPABASE_SERVICE_ROLE || '',
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE || ''}`,
  'Content-Type': 'application/json'
};

// ---------- Helpers
const animalWords = [
  'animal','mammal','reptile','amphibian','fish','bird',
  'cat','kitten','feline','dog','puppy','canine',
  'rabbit','hare','deer','fox','hedgehog','squirrel',
  'duck','goose','swan','heron','gull','pigeon','sparrow','blackbird','robin',
  'lizard','frog','toad','dragonfly','butterfly','bee','bumblebee','ladybird','ladybug'
];
const humanNoise = [
  'face','person','people','human','man','woman','boy','girl','selfie',
  'skin','hair','beard','moustache','mustache','mouth','nose','eye','ear','forehead','cheek','chin'
];
const objNoise = ['floor','wall','ceiling','table','desk','chair','paper','screen','phone','laptop','carpet','tile','furniture','room'];

const hasWord = (s, arr) => {
  const l = (s||'').toLowerCase();
  return arr.some(w => l.includes(w));
};
function escLike(s=''){ return s.replace(/[%_]/g, m => '\\' + m); }
function norm(s=''){ return (s||'').toLowerCase().trim().replace(/\s+/g,' '); }
function randomId(n=6){ return Array.from({length:n},()=>Math.floor(Math.random()*36).toString(36)).join(''); }

async function findSpeciesId(labelRaw){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !labelRaw) return null;
  const q = norm(labelRaw);
  const like = `*${escLike(q)}*`;
  const head = q.split(' ')[0];
  const likeHead = `${escLike(head)}*`;

  // contains full string
  let url = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(like)}&limit=1`;
  let r = await fetch(url, { headers: sHeaders });
  if (r.ok){
    const rows = await r.json();
    if(rows.length) return rows[0].species_id;
  }

  // variants
  const variants = [
    q.replace(/-?haired/g, ' hair').trim(),
    q.replace(/\b(cat|dog)\b/g, '').trim(),
    q.replace(/ +/g,' ')
  ].filter(Boolean);

  for(const v of variants){
    const u = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(`*${escLike(v)}*`)}&limit=1`;
    const rr = await fetch(u, { headers: sHeaders });
    if(rr.ok){
      const rows = await rr.json();
      if(rows.length) return rows[0].species_id;
    }
  }

  // prefix
  const u2 = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(likeHead)}&limit=1`;
  const r2 = await fetch(u2, { headers: sHeaders });
  if(r2.ok){
    const rows = await r2.json();
    if(rows.length) return rows[0].species_id;
  }
  return null;
}

async function fetchSpecies(species_id){
  if(!species_id || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  const su = `${SUPABASE_URL}/rest/v1/species?select=slug,common_name_fr,common_name_en,scientific_name,emoji,tip,habitat,id=eq.${species_id}`;
  const r = await fetch(su, { headers: sHeaders });
  if(!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function uploadToSupabase(base64){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !base64) return null;
  try{
    const path = `obs_${Date.now()}_${randomId()}.jpg`;
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(path)}`;
    const bin = Buffer.from(base64, 'base64');
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: bin
    });
    if(!r.ok){
      console.error('[supabase upload] failed', await r.text());
      return null;
    }
    // public URL pattern
    return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;
  }catch(e){
    console.error(e);
    return null;
  }
}

async function insertObservation(obs){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/observations`, {
    method:'POST',
    headers:{ ...sHeaders, Prefer:'return=representation' },
    body: JSON.stringify(obs)
  });
  if(!r.ok){
    console.error('[supabase insert] failed', await r.text());
    return null;
  }
  const rows = await r.json();
  return rows[0] || null;
}

exports.handler = async (event) => {
  try{
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image, location } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const base64 = image.split(',')[1];

    let best = null;
    let visionResp = null;

    if (PROVIDER === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.warn('[identify] GOOGLE_API_KEY missing');
      } else {
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const payload = {
          requests: [{
            image: { content: base64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'WEB_DETECTION', maxResults: 10 }
            ]
          }]
        };
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          const data = await r.json();
          const resp = data?.responses?.[0] || {};
          visionResp = resp;

          // Gather tokens
          const labels = resp.labelAnnotations || [];
          const objects = resp.localizedObjectAnnotations || [];
          const webEnts = (resp.webDetection?.webEntities) || [];
          const bestGuess = resp.webDetection?.bestGuessLabels || [];
          const tokens = [
            ...labels.map(x=>x.description||''),
            ...objects.map(x=>x.name||''),
            ...webEnts.map(x=>x.description||''),
            ...bestGuess.map(x=>x.label||'')
          ];
          console.log('[vision tokens]', tokens);

          const animalHit = tokens.some(t => hasWord(t, animalWords));

          if (!animalHit) {
            // not an animal -> stop early
            return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };
          }

          // choose best label: first animal-ish label if available, else top
          let chosen = labels.find(lb => hasWord(lb.description, animalWords)) || labels[0] || null;
          if (chosen && (chosen.score || 0) >= 0) {
            best = { label: chosen.description, score: chosen.score };
          }
        } else {
          console.error('[identify] Vision API error:', await r.text());
        }
      }
    }

    if (!best) return { statusCode: 200, body: JSON.stringify({ notAnimal: true }) };

    // Try mapping to species
    const species_id = await findSpeciesId(best.label);
    const species = species_id ? await fetchSpecies(species_id) : null;

    // Upload to Supabase Storage
    const photoUrl = await uploadToSupabase(base64);

    // Insert observation
    const obs = await insertObservation({
      species_id: species_id || null,
      label_raw: best.label,
      score: best.score || null,
      lat: location?.lat || null,
      lng: location?.lng || null,
      photo_url: photoUrl || null
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        label: best.label,
        score: best.score || null,
        species_id: species_id || null,
        species: species || null,
        photo: photoUrl || null
      })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
