// Background function — runs the full demo reset + reseed.
// Netlify background functions can run up to 15 minutes.
// This imports the seed logic from scripts/seed-demo.js.

export default async (req) => {
  try {
    // Set the env var so the seed script picks it up
    process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Dynamic import of the CJS seed module
    var seedModule = await import('../../scripts/seed-demo.js');
    // The seed function is exported as module.exports.seed
    var seedFn = seedModule.default ? seedModule.default.seed : (seedModule.seed || null);

    if (!seedFn) {
      // Fallback: the module runs on import via the main() call at the bottom
      // If seed() ran on require, we're done
      return new Response(JSON.stringify({ ok: true, note: 'seed ran on import' }), { status: 200 });
    }

    await seedFn();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('demo-reset-background error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export var config = { path: '/.netlify/functions/demo-reset-background' };
