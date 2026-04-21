export async function onRequest(context) {
  try {
    return new Response(JSON.stringify({ success: true, imported: false, message: 'stub - import-with-mapping accepted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
