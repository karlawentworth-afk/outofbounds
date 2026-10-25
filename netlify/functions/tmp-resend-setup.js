// Temporary function to create Resend webhook using production RESEND_API_KEY
// DELETE THIS FILE after use
const https = require('https');

exports.handler = async (event) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const action = event.queryStringParameters?.action || 'list';

  function apiCall(method, path, body) {
    return new Promise((resolve, reject) => {
      const headers = { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' };
      if (body) headers['Content-Length'] = Buffer.byteLength(body);
      const req = https.request({ hostname: 'api.resend.com', path, method, headers }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  if (action === 'list') {
    const res = await apiCall('GET', '/webhooks');
    return { statusCode: 200, body: JSON.stringify({ action: 'list', keyLen: RESEND_API_KEY?.length, apiStatus: res.status, data: JSON.parse(res.body) }) };
  }

  if (action === 'create') {
    const res = await apiCall('POST', '/webhooks', JSON.stringify({
      url: 'https://score.outofboundsevents.com/.netlify/functions/resend-webhook',
      events: ['email.sent', 'email.delivered', 'email.bounced', 'email.complained']
    }));
    return { statusCode: 200, body: JSON.stringify({ action: 'create', apiStatus: res.status, data: JSON.parse(res.body) }) };
  }

  return { statusCode: 400, body: 'Unknown action' };
};
