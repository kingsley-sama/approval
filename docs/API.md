# Automation API (v1)

REST API for driving the image-annotation app from n8n, Zapier, Make, custom scripts, or any HTTP client. Everything the UI can do around **projects, images, share links, and reading feedback** is exposed under:

```
https://revision.exposeprofi.de/api/v1
```

---

## How it works

The API mirrors the app's client-review workflow. A typical automation runs through four stages:

1. **Authenticate** — every call carries an `Authorization: Bearer <api-key>` header. Keys are configured server-side in the `MARKUP_API_KEYS` env var.
2. **Create a project with images** — one `POST /api/v1/projects` call sends the project name, an optional comment, and the image files themselves (multipart upload). The server stores each file in Supabase Storage, creates one annotatable image (a "thread") per file, and sets the project's cover image.
3. **Share with the client** — either in the same create call (`share_permissions` field) or later via `POST /api/v1/share-links`. The returned `shareLink.url` is a public page where the client can view, pin comments, or draw — no account needed.
4. **Read the feedback back** — `GET /api/v1/projects/{id}/comments` returns every pin with its text, author, position, and resolved/active status, so workflows can push feedback into Slack, email, or a task tracker.

All responses are JSON with a `success` boolean. Two URLs come back from project creation: `project.url` (the internal workspace, app login required) and `shareLink.url` (public, for clients).

### Quick start

```bash
# 1. On the server: add a key to the environment
#    MARKUP_API_KEYS=$(openssl rand -hex 32)

# 2. Create a project from image files and get a client link in one call
curl -X POST https://revision.exposeprofi.de/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=Kitchen Render v3" \
  -F "comment=Final materials pass" \
  -F "images=@kitchen-v3.jpg" \
  -F "share_permissions=comment"

# → { "project": { "url": "…/projects/<id>" }, "shareLink": { "url": "…/share/<token>" }, … }

# 3. Later: pull the client's feedback
curl -H "Authorization: Bearer $API_KEY" \
  "https://revision.exposeprofi.de/api/v1/projects/<id>/comments?status=active"
```

---

## Authentication

Every request must send a bearer token:

```
Authorization: Bearer <your-api-key>
```

### Setting up keys

1. Generate a key:
   ```bash
   openssl rand -hex 32
   ```
2. Add it to your environment (`.env.local` locally, or your hosting provider's env settings):
   ```
   MARKUP_API_KEYS=6f1c9a...your-generated-key
   ```
3. Multiple keys are supported (comma-separated) so you can give each automation its own key and rotate them independently:
   ```
   MARKUP_API_KEYS=key-for-n8n,key-for-zapier
   ```

| Status | Meaning |
|---|---|
| `401` | Missing or invalid bearer token |
| `503` | `MARKUP_API_KEYS` is not configured on the server |

### Error format

All errors share one shape:

```json
{ "success": false, "error": { "code": "not_found", "message": "No project with id ..." } }
```

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/projects` | **Create a project** (name + optional comment + images + optional share link, in one call) |
| `GET` | `/api/v1/projects` | List projects (paginated, searchable) |
| `GET` | `/api/v1/projects/{id}` | Project details, images, share links |
| `DELETE` | `/api/v1/projects/{id}` | Delete a project |
| `POST` | `/api/v1/projects/{id}/images` | Add images to an existing project |
| `GET` | `/api/v1/projects/{id}/comments` | Read all pins/comments (client feedback) |
| `POST` | `/api/v1/share-links` | Create a shareable client link |
| `GET` | `/api/v1/share-links` | List share links for a project/image |
| `DELETE` | `/api/v1/share-links/{id}` | Revoke a share link |

---

## POST /api/v1/projects — create a project

The core endpoint. Creates the project, uploads the images, and (optionally) creates a client share link — all in a single call.

### Request body (multipart/form-data) — primary: send image files directly

- `name` — text field (**required**)
- `comment` — text field (optional)
- image files — attach one or more files. The canonical field name is `images`, but files under **any** field name are accepted (n8n, Zapier, etc. name binary fields differently)
- `share_permissions` — optional text field: `view` | `comment` | `draw_and_comment`. If present, a client share link is created in the same call

```bash
curl -X POST https://revision.exposeprofi.de/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=Kitchen Render v3" \
  -F "comment=Final materials pass" \
  -F "images=@kitchen-v3.jpg" \
  -F "images=@living-room.png" \
  -F "share_permissions=comment"
```

### Request body (JSON) — alternative: URLs or base64

```json
{
  "name": "Website Redesign — Round 2",
  "comment": "Second revision after client feedback",
  "images": [
    { "url": "https://example.com/renders/homepage.png" },
    { "url": "https://example.com/renders/about.png", "name": "About page" },
    { "base64": "iVBORw0KGgo...", "contentType": "image/png", "name": "Contact page" }
  ],
  "share": { "permissions": "comment" }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Project name (max 300 chars) |
| `comment` | string | — | Description/note stored on the project (max 5000 chars) |
| `images` | array | — | Up to 50 per request. Each item needs `url` **or** `base64` |
| `images[].url` | string | — | Publicly reachable http(s) image URL; the server downloads it |
| `images[].base64` | string | — | Raw base64 or a full `data:image/png;base64,...` URI |
| `images[].contentType` | string | — | Required with raw `base64` (e.g. `image/png`) |
| `images[].name` | string | — | Display name shown in the workspace |
| `share` | object | — | If present, a share link is created immediately. `permissions`: `view` \| `comment` \| `draw_and_comment` |

Allowed image types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 60 MB per source file.

The type is taken from the response's `Content-Type` when that names an allowed image type; otherwise it falls back to the file's magic bytes and then to the extension of `images[].name`. Pre-authenticated links (SharePoint/Graph `@microsoft.graph.downloadUrl`, presigned S3 URLs) often serve real images as `application/octet-stream`, and those are accepted.

> **Files over 4.5 MB must be sent as URLs, not as multipart uploads.** The production deployment runs on Vercel, whose serverless functions reject any request body larger than 4.5 MB with `413 FUNCTION_PAYLOAD_TOO_LARGE` — the platform rejects it at the edge, before this API sees it, so nothing appears in `failedImages`. Sending `{ "images": [{ "url": ... }] }` keeps the request tiny and lets the server do the download, where the 60 MB ceiling above is the only limit. Multipart uploads remain fine for small files and for local development, which has no such cap.

Ingested jpeg/png/webp images are compressed server-side before storage (downscaled to max 2560px and re-encoded as JPEG), matching the in-app uploader. GIFs are stored as-is to preserve animation.

### Response — `201 Created`

```json
{
  "success": true,
  "project": {
    "id": "0b2f6c3e-9a1d-4a7e-b7c2-1f2e3d4c5b6a",
    "name": "Website Redesign — Round 2",
    "comment": "Second revision after client feedback",
    "url": "https://revision.exposeprofi.de/projects/0b2f6c3e-9a1d-4a7e-b7c2-1f2e3d4c5b6a",
    "createdAt": "2026-07-13T10:30:00.000Z",
    "totalImages": 3
  },
  "images": [
    { "threadId": "…", "name": "homepage.png", "imageUrl": "https://…supabase.co/…", "imageIndex": 0 }
  ],
  "failedImages": [],
  "shareLink": {
    "url": "https://revision.exposeprofi.de/share/AbC123…",
    "token": "AbC123…",
    "permissions": "comment"
  }
}
```

- `project.url` — the internal annotation workspace (requires app login).
- `shareLink.url` — the public link you send to clients (no login needed).
- `failedImages` — per-image failures (bad URL, wrong type, too big). The project is still created with whatever succeeded; **check this array in your automation**.
- `shareLink` is `null` unless you passed `share`.

If images were requested but **none** could be ingested, the response is `422 all_images_failed` (with `failedImages` details) and the just-created project is rolled back — a failed run never leaves an empty project behind. Creating a project with no `images` at all remains valid and returns `201`.

Project names are unique (case-insensitive). If a project with the same name already exists, the response is `409 duplicate_name` and includes `existingProject: { id, url }` so automations can reuse or link to it instead of creating a duplicate.

---

## GET /api/v1/projects — list projects

Query params: `page` (default 1, 24 per page), `search` (name filter).

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://revision.exposeprofi.de/api/v1/projects?page=1&search=kitchen"
```

```json
{
  "success": true, "page": 1, "pageSize": 24, "total": 3,
  "projects": [
    { "id": "…", "name": "Kitchen Render v3", "coverImage": "https://…", "totalImages": 2,
      "url": "https://revision.exposeprofi.de/projects/…", "createdAt": "…", "updatedAt": "…" }
  ]
}
```

---

## GET /api/v1/projects/{id} — project details

Returns the project, all of its images, and all of its share links.

```bash
curl -H "Authorization: Bearer $API_KEY" https://revision.exposeprofi.de/api/v1/projects/PROJECT_ID
```

```json
{
  "success": true,
  "project": { "id": "…", "name": "Kitchen Render v3", "comment": "Final materials pass",
               "coverImage": "https://…", "url": "https://revision.exposeprofi.de/projects/…",
               "totalImages": 2, "createdAt": "…", "updatedAt": "…" },
  "images": [
    { "threadId": "…", "name": "kitchen-v3.jpg", "imageUrl": "https://…", "imageIndex": 0, "createdAt": "…" }
  ],
  "shareLinks": [
    { "id": "…", "url": "https://revision.exposeprofi.de/share/…", "permissions": "comment",
      "isActive": true, "accessCount": 4, "createdAt": "…" }
  ]
}
```

---

## POST /api/v1/projects/{id}/images — add images

Same image formats as project creation: multipart file uploads (any field name) or JSON `{ "images": [...] }`. New images are appended after the project's existing ones.

```bash
curl -X POST https://revision.exposeprofi.de/api/v1/projects/PROJECT_ID/images \
  -H "Authorization: Bearer $API_KEY" \
  -F "images=@revision-2.png"
```

Returns `201` with `images` + `failedImages`; returns `422 all_images_failed` if nothing could be ingested.

---

## GET /api/v1/projects/{id}/comments — read client feedback

Pulls every pin/comment across all images of the project — ideal for piping feedback into Slack, email digests, or a task tracker. Optional filter: `?status=active` or `?status=resolved`.

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://revision.exposeprofi.de/api/v1/projects/PROJECT_ID/comments?status=active"
```

```json
{
  "success": true, "total": 2,
  "comments": [
    {
      "id": "…", "threadId": "…",
      "imageName": "homepage.png", "imageUrl": "https://…",
      "author": "Jane (client)", "content": "Make this logo bigger",
      "pinNumber": 1, "x": 42.5, "y": 17.8,
      "status": "active", "isReply": false, "parentCommentId": null,
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

`x`/`y` are percentages (0–100) of the image dimensions.

---

## POST /api/v1/share-links — create a client link

```json
{ "projectId": "PROJECT_UUID", "permissions": "comment", "createdBy": "n8n" }
```

- Pass `projectId` to share a whole project, or `threadId` to share a single image (exactly one of the two).
- `permissions`: `view` (read-only) | `comment` (default — place pins + comments) | `draw_and_comment` (also draw shapes).
- `createdBy` is an optional label shown in the app (defaults to `"api"`).

Returns `201` with `shareLink.url` — send that URL to your client.

```bash
curl -X POST https://revision.exposeprofi.de/api/v1/share-links \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "PROJECT_UUID", "permissions": "draw_and_comment" }'
```

### GET /api/v1/share-links?projectId=… — list links
### DELETE /api/v1/share-links/{id} — revoke a link

Revoked links immediately stop working for anyone holding the URL.

---

## n8n recipes

### 1. Create a project from incoming image files (HTTP Request node)

Works with any trigger that produces binary data (Gmail attachment, Google Drive, Dropbox, webhook file upload, …).

- **Method:** POST
- **URL:** `https://revision.exposeprofi.de/api/v1/projects`
- **Authentication:** Generic Credential Type → *Header Auth*
  - Name: `Authorization`, Value: `Bearer YOUR_API_KEY`
- **Body Content Type:** *Form-Data*
- **Body parameters:**
  | Type | Name | Value |
  |---|---|---|
  | Form Data | `name` | `{{ $json.clientName }} — {{ $json.projectTitle }}` |
  | Form Data | `comment` | `{{ $json.notes }}` |
  | **n8n Binary File** | `images` | your binary property (e.g. `data`; add one row per file — `data0`, `data1`, … also works, any field name is accepted) |
  | Form Data | `share_permissions` | `comment` |

Downstream nodes can use `{{ $json.shareLink.url }}` (send to the client via Gmail/Slack node) and `{{ $json.project.url }}` (internal link for your team). Multiple binaries from one item: add one *n8n Binary File* row per binary property.

### 2. JSON alternative (image URLs)

If your workflow only has hosted URLs, POST JSON instead: `{ "name": "…", "images": [{ "url": "{{ $json.renderUrl }}" }], "share": { "permissions": "comment" } }`.

### 3. Daily feedback digest

Schedule Trigger → HTTP Request `GET /api/v1/projects/{{id}}/comments?status=active` → filter new comments by `createdAt` → post to Slack.

---

## Operational notes

- **Timeouts:** image-ingesting endpoints allow up to 120 s per request. For very large batches, split into a create call plus follow-up `POST …/images` calls.
- **Request body limits:** some hosts cap the request body (e.g. Vercel serverless functions at ~4.5 MB). If your files exceed your host's limit, upload them one per request via `POST …/images`, or self-host/adjust the platform limit. Self-hosted `next start` has no such cap.
- **Partial success:** ingestion never fails the whole request because one image failed — always check `failedImages`.
- **Idempotency:** calls are not idempotent; retrying a create makes a second project. In n8n, disable automatic retries on the create node or dedupe by name first via `GET /api/v1/projects?search=`.
- **Security:** treat API keys like passwords; they grant full project access (including delete). Serve the app over HTTPS only.
