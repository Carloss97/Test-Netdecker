import { createClient } from 'redis';
const url = process.env.REDIS_URL || 'redis://localhost:6379';
const client = createClient({ url });
client.on('error', (e) => console.error('redis error', e.message));

try {
  await client.connect();
  const keys = await client.keys('*');
  console.log('redis keys count:', keys.length);
  if (keys.includes('tcgs:all')) {
    await client.del('tcgs:all');
    console.log('deleted tcgs:all');
  } else {
    console.log('tcgs:all not found');
  }
  await client.disconnect();
} catch (err) {
  console.error('redis op failed', err);
  process.exitCode = 1;
}
