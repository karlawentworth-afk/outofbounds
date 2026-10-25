// Temporary function to create Resend webhook
// DELETE THIS FILE after use
const https = require('https');

exports.handler = async (event) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const action = event.queryStringParameters?.action || 'list';

  // Diagnostic: show key shape without revealing it
  const keyInfo = {
    length: RESEND_API_KEY?.length,
    starts: RESEND_API_KEY?.substring(0, 3),
    ends: RESEND_API_KEY?.slice(-4),
    hasStars: RESEND_API_KEY?.includes('*'),
    context: process.env.CONTEXT || 'unknown'
  };

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

  if (action === 'diag') {
    return { statusCode: 200, body: JSON.stringify(keyInfo) };
  }

  if (action === 'list') {
    const res = await apiCall('GET', '/webhooks');
    return { statusCode: 200, body: JSON.stringify({ action: 'list', keyInfo, apiStatus: res.status, data: JSON.parse(res.body) }) };
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
