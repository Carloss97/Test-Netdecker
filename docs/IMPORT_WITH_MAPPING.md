**Import with Mapping (Server-side)**

Endpoint: `POST /api/inventory/import-with-mapping`

Description: Accepts a multipart/form-data payload containing `file` (CSV/XLSX) and an optional `mapping` field (JSON string) that maps expected import fields to CSV column names. Useful for clients that cannot rewrite CSV locally or for very large files.

Form fields:
- `file`: file to upload (CSV or XLSX)
- `mapping`: JSON string mapping expected fields to CSV headers, e.g.:
  ```json
  { "tcg": "Juego", "editionCode": "EdCode", "cardCode": "CardID", "cardName": "Nombre", "quantity": "Stock", "referencePrice": "RefPrice" }
  ```
- `dryRun`: optional boolean string `true`/`false` to perform a dry-run validation.
- `importedBy`: optional string identifying who uploaded the file.

Security:
- The endpoint requires `x-api-key` header if `IMPORT_API_KEY` is set in server env.

Response:
- Standard API envelope { success: true, result } where `result` contains `total`, `success`, `failed`, `errors`.

Client usage example (curl):

```bash
curl -X POST "https://tu-app.com/api/inventory/import-with-mapping" \
  -H "x-api-key: YOUR_KEY" \
  -F "file=@myfile.csv" \
  -F 'mapping={"tcg":"Juego","editionCode":"EdCode","cardCode":"CardID","cardName":"Nombre","quantity":"Stock","referencePrice":"RefPrice"}' \
  -F "dryRun=true"
```

Notes:
- Mapping is applied server-side by rewriting the header row before parsing; all rows are then validated as usual.
- Prefer dry-run first to surface validation errors before writing to DB.
