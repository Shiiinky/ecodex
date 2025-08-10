// netlify/functions/identify.js (mock demo)
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { image } = JSON.parse(event.body || '{}');
    if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
      return { statusCode: 200, body: JSON.stringify({}) };
    }
    return { statusCode: 200, body: JSON.stringify({ key: 'hedgehog' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};