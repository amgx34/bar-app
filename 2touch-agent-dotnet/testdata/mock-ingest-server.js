/**
 * Mock of POST /api/2touch/ingest for local agent testing.
 *
 * Mirrors the real route's auth exactly — HMAC-SHA256 over the RAW request
 * body, compared as lowercase hex (see app/api/2touch/ingest/route.ts) — but
 * writes nothing to Supabase. Lets you prove the agent's serialization and
 * signing are correct before pointing it at a real org.
 *
 *   node mock-ingest-server.js
 *   → listens on http://localhost:3999
 */

const http = require('http');
const { createHmac } = require('crypto');

const PORT       = Number(process.env.PORT ?? 3999);
const ORG_ID     = process.env.MOCK_ORG_ID ?? '00000000-0000-0000-0000-000000000000';
const AGENT_TOKEN = process.env.MOCK_AGENT_TOKEN ?? 'test-agent-token-do-not-use-in-production';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/2touch/ingest')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  // Collect the raw bytes — never re-serialize before verifying.
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const sig  = req.headers['x-rail-signature'] ?? '';

    const json = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.error('✗ Invalid JSON body');
      return json(400, { error: 'Invalid JSON' });
    }

    if (!parsed.org_id) {
      console.error('✗ org_id missing from payload');
      return json(400, { error: 'org_id required in payload' });
    }
    if (parsed.org_id !== ORG_ID) {
      console.error(`✗ org_id mismatch — got ${parsed.org_id}, expected ${ORG_ID}`);
      return json(401, { error: 'Unauthorized' });
    }

    const expected = createHmac('sha256', AGENT_TOKEN).update(body).digest('hex');
    if (expected !== sig) {
      console.error('✗ HMAC mismatch');
      console.error(`   expected: ${expected}`);
      console.error(`   received: ${sig || '(none)'}`);
      return json(401, { error: 'Unauthorized' });
    }

    const result = {
      zReports:  parsed.zReports?.length  ?? 0,
      ewReports: parsed.ewReports?.length ?? 0,
      itemAudit: parsed.itemAudit?.length ?? 0,
      errors:    [],
    };

    console.log(`\n✓ HMAC verified — agent: ${req.headers['x-rail-agent'] ?? 'unknown'}`);
    console.log(`  org_id:   ${parsed.org_id}`);
    console.log(`  source:   ${parsed.source}`);
    console.log(`  pulledAt: ${parsed.pulledAt}`);
    console.log(`  body:     ${body.length} bytes`);
    console.log(`  rows:     Z=${result.zReports} EW=${result.ewReports} Audit=${result.itemAudit}`);
    if (parsed.zReports?.[0])  console.log(`  Z[0]:     ${JSON.stringify(parsed.zReports[0])}`);
    if (parsed.ewReports?.[0]) console.log(`  EW[0]:    ${JSON.stringify(parsed.ewReports[0])}`);
    if (parsed.itemAudit?.[0]) console.log(`  Item[0]:  ${JSON.stringify(parsed.itemAudit[0])}`);

    json(200, result);
  });
});

server.listen(PORT, () => {
  console.log(`Mock ingest listening on http://localhost:${PORT}/api/2touch/ingest`);
  console.log(`  expecting org_id: ${ORG_ID}`);
  console.log(`  agent token:      ${AGENT_TOKEN}`);
});
