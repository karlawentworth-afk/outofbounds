'use strict';

var sb = require('./shared/supabase');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return sb.respond(204, '');

  var qs = event.queryStringParameters || {};
  var token = qs.token;

  if (!token || token.length !== 32) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Invalid link</h2><p>This removal link is not valid.</p></body></html>'
    };
  }

  try {
    // Find the person by remove_token
    var people = await sb.sbGet(
      'people?remove_token=eq.' + encodeURIComponent(token) +
      '&deleted_at=is.null' +
      '&select=id,organiser_id,first_name,last_name,email' +
      '&limit=1'
    );

    if (!people || !people.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Already removed</h2><p>You have already been removed, or this link has expired.</p></body></html>'
      };
    }

    var person = people[0];

    // Soft delete
    await sb.sbPatch(
      'people?id=eq.' + person.id,
      { deleted_at: new Date().toISOString() }
    );

    // Email the organiser
    var orgs = await sb.sbGet(
      'organisers?id=eq.' + person.organiser_id +
      '&select=name,contact_email&limit=1'
    );
    var org = (orgs && orgs[0]) || {};

    if (org.contact_email && process.env.RESEND_API_KEY) {
      var fromAddr = process.env.RESEND_FROM || 'noreply@outofboundsevents.com';
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Out of Bounds <' + fromAddr + '>',
            to: [org.contact_email],
            subject: person.first_name + ' ' + person.last_name + ' has asked to be removed',
            html: '<p>' + person.first_name + ' ' + person.last_name +
              (person.email ? ' (' + person.email + ')' : '') +
              ' has removed themselves from your people list.</p>' +
              '<p style="color:#666;font-size:13px;">This was requested via the removal link in an invite email.</p>'
          })
        });
      } catch (emailErr) {
        console.error('Failed to notify organiser:', emailErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body style="font-family:sans-serif;padding:40px;text-align:center;">' +
        '<h2>You\'ve been removed</h2>' +
        '<p>' + person.first_name + ', you have been removed from ' + (org.name || 'the organiser') + '\'s list.</p>' +
        '<p style="color:#666;">They will not contact you again through Out of Bounds.</p>' +
        '</body></html>'
    };
  } catch (err) {
    console.error('people-remove error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Something went wrong</h2><p>Please try again later.</p></body></html>'
    };
  }
};
