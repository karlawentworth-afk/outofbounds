var fs = require('fs');
var https = require('https');
var path = require('path');

var imgPath = process.argv[2] || path.join(__dirname, '..', '..', 'WhatsApp Image 2026-09-18 at 9.31.12 AM.jpeg');
console.log('Reading:', imgPath);

var img = fs.readFileSync(imgPath);
var b64 = img.toString('base64');
console.log('Image: ' + b64.length + ' base64 chars (' + img.length + ' bytes)');

var body = JSON.stringify({ image: b64, media_type: 'image/jpeg' });
console.log('Payload: ' + body.length + ' bytes');
console.log('Calling course-from-photo...');

var req = https.request({
  hostname: 'outofboundsscoring.netlify.app',
  port: 443,
  path: '/.netlify/functions/course-from-photo',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, function(res) {
  var chunks = [];
  res.on('data', function(c) { chunks.push(c); });
  res.on('end', function() {
    var raw = Buffer.concat(chunks).toString();
    console.log('Status: ' + res.statusCode);
    try {
      var parsed = JSON.parse(raw);
      console.log(JSON.stringify(parsed, null, 2));
    } catch(e) {
      console.log(raw);
    }
  });
});
req.on('error', function(e) { console.error('Error:', e.message); });
req.write(body);
req.end();
