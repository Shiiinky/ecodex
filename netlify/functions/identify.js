// netlify/functions/identify.js (mock demo)
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image } = JSON.parse(event.body || '{}');

    // Si pas d'image valide -> non reconnue
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }

    // Démo : renvoie toujours "hedgehog"
    return { statusCode: 200, body: JSON.stringify({ key: 'hedgehog' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};