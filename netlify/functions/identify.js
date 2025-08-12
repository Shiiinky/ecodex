// netlify/functions/identify.js - v3.4.1
// Soft animal filter + robust alias mapping + species details + logging

const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.5');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'observations';

const sHeaders = {
  'apikey': SUPABASE_SERVICE_ROLE || '',
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE || ''}`,
  'Content-Type': 'application/json'
};

function escLike(s=''){ return s.replace(/[%_]/g, m => '\\' + m); }
function norm(s=''){ return (s||'').toLowerCase().trim().replace(/\s+/g,' '); }

function isAnimalLabel(label){
  const l = (label || '').toLowerCase();
  const allow = [
    'animal','mammal','bird','reptile','amphibian','fish',
    'insect','spider','arthropod','butterfly','bee','beetle',
    'cat','kitten','feline','dog','puppy','canine',
    'hedgehog','fox','deer','rabbit','hare','squirrel','boar','badger',
    'mouse','rat','bat','horse','cow','sheep','goat','pig',
    'duck','swan','goose','heron','gull','pigeon','sparrow','blackbird','robin','magpie',
    'lizard','frog','toad','snake','turtle','tortoise','dragonfly','ladybird','ladybug','bumblebee'
  ];
  return allow.some(k => l.includes(k));
}

function isHumanOrNoise(label){
  const l = (label || '').toLowerCase();
  const block = [
    'face','person','people','human','man','woman','boy','girl','selfie','portrait',
    'skin','hair','beard','moustache','mustache','mouth','nose','eye','ear','forehead','cheek','chin',
    'floor','wall','ceiling','paper','furniture','room','table','carpet','tile','electronics','device','keyboard','monitor'
  ];
  return block.some(k => l.includes(k));
}

async function findSpeciesId(labelRaw){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  const q = norm(labelRaw);
  const like = `*${escLike(q)}*`;
  const head = q.split(' ')[0];
  const likeHead = `${escLike(head)}*`;

  // contains full
  let url = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(like)}&limit=1`;
  let r = await fetch(url, { headers: sHeaders });
  if (r.ok) { const rows = await r.json(); if (rows.length) return rows[0].species_id; }

  // small variants
  const variants = [
    q.replace(/-?haired/g, ' hair').trim(),
    q.replace(/\b(cat|dog)\b/g, '').trim(),
    q.replace(/ +/g,' ')
  ].filter(Boolean);

  for (const v of variants){
    const u = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(`*${escLike(v)}*`)}&limit=1`;
    const rr = await fetch(u, { headers: sHeaders });
    if (rr.ok){ const rows = await rr.json(); if (rows.length) return rows[0].species_id; }
  }

  // prefix
  const u2 = `${SUPABASE_URL}/rest/v1/species_alias?select=species_id&label=ilike.${encodeURIComponent(likeHead)}&limit=1`;
  const r2 = await fetch(u2, { headers: sHeaders });
  if (r2.ok){ const rows = await r2.json(); if (rows.length) return rows[0].species_id; }

  return null;
}

async function getSpeciesById(id){
  try{
    const u = `${SUPABASE_URL}/rest/v1/species?select=slug,common_name_fr,common_name_en,scientific_name,emoji,tip,habitat&id=eq.${id}&limit=1`;
    const r = await fetch(u, { headers: sHeaders });
    if(r.ok){ const rows = await r.json(); return rows[0] || null; }
  }catch(e){}
  return null;
}

async function uploadToSupabase(base64jpeg){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  try{
    const fileName = `obs_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(fileName)}`;
    const bin = Buffer.from(base64jpeg, 'base64');
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type': 'image/jpeg'
      },
      body: bin
    });
    if(!r.ok){
      console.error('[supabase upload] failed', await r.text());
      return null;
    }
    // public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(fileName)}`;
    return publicUrl;
  }catch(e){
    console.error(e);
    return null;
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const { image, location } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    const base64 = image.split(',')[1];

    let best = null;
    let labels = [];
    let objects = [];
    let webEntities = [];
    let bestGuesses = [];

    if (PROVIDER === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) console.warn('[identify] GOOGLE_API_KEY missing');
      else {
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
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.ok) {
          const data = await r.json();
          const resp = data?.responses?.[0] || {};
          labels = resp.labelAnnotations || [];
          objects = resp.localizedObjectAnnotations || [];
          webEntities = (resp.webDetection && resp.webDetection.webEntities) || [];
          bestGuesses = (resp.webDetection && resp.webDetection.bestGuessLabels) || [];
          // pick best label by score
          const allLabels = [...labels].sort((a,b)=>(b.score||0)-(a.score||0));
          if (allLabels.length && (allLabels[0].score || 0) >= (MIN_CONFIDENCE*0.7)) {
            best = { label: allLabels[0].description, score: allLabels[0].score };
          }
        } else {
          console.error('[identify] Vision API error:', await r.text());
        }
      }
    }

    const labelTexts = [
      ...labels.map(l=>l.description),
      ...objects.map(o=>o.name),
      ...webEntities.map(w=>w.description).filter(Boolean),
      ...bestGuesses.map(g=>g.label).filter(Boolean)
    ];

    console.log('[vision labels]', labelTexts);

    const hasAnimal = labelTexts.some(isAnimalLabel);
    const hasHumanNoise = labelTexts.some(isHumanOrNoise);

    if (!hasAnimal || hasHumanNoise) {
      return { statusCode: 200, body: JSON.stringify({ notAnimal: true, _debug: { hasAnimal, hasHumanNoise, labelTexts } }) };
    }

    // Fallback: if no "best" yet, but we have any animal-ish label, choose first one
    if(!best){
      const candidate = labels.find(lb => isAnimalLabel(lb.description)) || labels[0] || objects[0];
      if(candidate){ best = { label: candidate.description || candidate.name, score: candidate.score || 0.6 }; }
    }

    const finalLabel = best?.label || (labelTexts[0] || 'Unknown animal');

    // Map to species
    let species_id = await findSpeciesId(finalLabel);
    let species = null;
    if (species_id) species = await getSpeciesById(species_id);

    // Upload photo
    const photoUrl = await uploadToSupabase(base64);

    // Insert observation
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
      const obsBody = {
        species_id: species_id || null,
        label_raw: finalLabel,
        score: best?.score || null,
        lat: location?.lat || null,
        lng: location?.lng || null,
        photo_url: photoUrl || null
      };
      const obsRes = await fetch(`${SUPABASE_URL}/rest/v1/observations`, {
        method: 'POST',
        headers: { ...sHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(obsBody)
      });
      if(!obsRes.ok) console.error('[supabase insert] failed', await obsRes.text());
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        label: finalLabel,
        score: best?.score || null,
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
