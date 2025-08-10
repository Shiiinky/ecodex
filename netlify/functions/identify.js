// netlify/functions/identify.js
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE || '0.6');
const PROVIDER = (process.env.PROVIDER || 'google').toLowerCase();

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    const base64 = image.split(',')[1];
    let best = null;

    if (PROVIDER === 'google') {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.warn('[identify] GOOGLE_API_KEY missing');
      } else {
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const payload = {
          requests: [{
            image: { content: base64 },
            features: [{ type: 'LABEL_DETECTION', maxResults: 10 }]
          }]
        };
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          const data = await r.json();
          
          const obj = data?.responses?.[0]?.localizedObjectAnnotations || [];
          if (obj.length) {
            obj.sort((a,b)=>(b.score||0)-(a.score||0));
            const o = obj[0];
            if ((o.score || 0) >= MIN_CONFIDENCE) {
              best = { label: o.name, score: o.score, type: 'object' };
            }
          }
          if (!best) {
            const labels = data?.responses?.[0]?.labelAnnotations || [];
            if (labels.length) {
              labels.sort((a,b)=>(b.score||0)-(a.score||0));
              const top = labels[0];
              if ((top.score || 0) >= MIN_CONFIDENCE) {
                best = { label: top.description, score: top.score, type: 'label' };
              }
            }
          }
        } else {
          console.error('[identify] Vision API error:', await r.text());
        }
      }
    }

    if (!best) return { statusCode: 200, body: JSON.stringify({}) };
    return { statusCode: 200, body: JSON.stringify(best) };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
