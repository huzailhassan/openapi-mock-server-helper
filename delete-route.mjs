import crypto from 'crypto';

const BASE_URL = process.env.API_URL || 'http://localhost:4000';
const API_KEY  = process.env.API_KEY  || 'ak_live_demo';

const fileName = process.argv[2];

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ requestId: crypto.randomUUID(), requestAt: Date.now(), ...body }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text}`);
  }
}

// No argument — list all scripts
if (!fileName) {
  const json = await post('/dev/api/v1/script/list', {});
  const files = json.data?.files || [];

  if (files.length === 0) {
    console.log('\n  No scripts uploaded yet.\n');
  } else {
    console.log('\n📋  Uploaded scripts:\n');
    for (const f of files) {
      console.log(`     ${f.fileName.padEnd(20)}  →  ${f.mountedAt}  (${f.size} bytes)`);
    }
    console.log('\nTo delete:  node delete-route.mjs <fileName>');
    console.log('Example:    node delete-route.mjs wallet.js\n');
  }
  process.exit(0);
}

// Delete
console.log(`\n🗑   Deleting "${fileName}" ...\n`);

const result = await post('/dev/api/v1/script/delete', { fileName });

if (result.success) {
  console.log(`  ✅  Deleted: ${result.data.fileName}`);
  console.log(`      At:      ${result.data.deletedAt}`);
} else {
  console.log(`  ❌  Error [${result.errorCode}]: ${result.errorMessage}`);
  process.exit(1);
}

// Show what's left
const remaining = await post('/dev/api/v1/script/list', {});
const files = remaining.data?.files || [];

if (files.length > 0) {
  console.log('\n📋  Remaining scripts:');
  for (const f of files) {
    console.log(`     ${f.fileName.padEnd(20)}  →  ${f.mountedAt}`);
  }
} else {
  console.log('\n  No scripts remaining.');
}
console.log('');
