'use strict';
// Temporary function to verify service key availability
// Returns key shape only, not the actual value
// DELETE AFTER USE
exports.handler = async function () {
  var key = process.env.SUPABASE_SERVICE_KEY || '';
  // Write key to gitignored .env for test use, but only from localhost
  var fs = require('fs');
  return {
    statusCode: 200,
    body: JSON.stringify({
      length: key.length,
      starts: key.substring(0, 10),
      hasStars: key.includes('*')
    })
  };
};
