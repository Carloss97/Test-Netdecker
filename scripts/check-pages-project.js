#!/usr/bin/env node
const account = process.argv[2] || process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!account) {
  console.error('Missing account id. Usage: CF_ACCOUNT_ID=<id> node scripts/check-pages-project.js OR node scripts/check-pages-project.js <account_id>');
  process.exit(2);
}

if (!token) {
  console.error('Missing CLOUDFLARE_API_TOKEN environment variable.');
  process.exit(2);
}

(async () => {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const json = await res.json();
    if (!res.ok) {
      console.error('API error:', json);
      process.exit(1);
    }
    if (!json.result || json.result.length === 0) {
      console.log('No Pages projects found for account:', account);
      process.exit(0);
    }
    console.log(`Found ${json.result.length} Pages project(s):`);
    for (const p of json.result) {
      console.log(`- name: ${p.name}  slug: ${p.slug}  id: ${p.id}`);
    }
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
