// Integration test stub for public + import with mapping
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'public_and_import_with_mapping.integration.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;
