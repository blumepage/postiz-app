# Blume Postiz fork

This fork keeps Blume's social publishing customizations on the `blume` branch.
The `main` branch mirrors `gitroomhq/postiz-app/main` and should not contain
Blume-only edits.

Railway deploys the `blume` branch. The weekly **Sync Postiz upstream** workflow
refreshes `main`, merges upstream into `automation/upstream-sync`, and opens a
pull request into `blume`. Resolve any conflicts in that pull request rather
than copying a new Postiz release over this repository.

## Blume-owned surface

Sanity is a native publishing channel modeled on Postiz's WordPress provider.
Connect it from **Add Channel** with a project ID, dataset, document type,
dedicated write token, published blog base URL, and Studio URL. Posts scheduled
to that channel create or replace a Sanity document when the Postiz job runs.

The channel targets the Blume `blogPost` shape: title, slug, excerpt, author,
Portable Text body, publish date, and an optional header image. A post can be
sent to the published dataset or saved under Sanity's `drafts.` namespace.
Credentials are encrypted in the same Postiz integration record used by the
WordPress channel; no Sanity token is exposed to the frontend.

The calendar month view is also Blume-owned. It presents a continuous
13-month timeline centered on the selected month, lazy-mounts month grids as
they approach the viewport, uses larger day cells, and shows media-rich post
cards with expandable copy. The channels rail defaults to its collapsed state.
Keep these changes localized to the launches calendar components when
resolving upstream updates.

## Hybrid Postiz Cloud mode

Production uses the self-hosted fork for authentication, the customized UI,
and the Sanity channel, but uses Postiz Cloud as the source of truth and
publishing engine for supported social channels. This lets social connections
use Postiz's managed OAuth applications without copying or exposing Postiz's
provider secrets.

Set `POSTIZ_CLOUD_API_KEY` on the Railway service to enable hybrid mode.
`POSTIZ_CLOUD_API_URL` is optional and defaults to
`https://api.postiz.com/public/v1`. Keep the API key server-side; it must never
be a `NEXT_PUBLIC_` variable or committed to the repository.

In hybrid mode:

- `/integrations/list` combines Postiz Cloud channels with locally connected
  Sanity channels.
- OAuth channel buttons request a supported Postiz Cloud authorization URL.
  The provider flow opens in a separate window because its callback belongs to
  Postiz Cloud.
- Social post reads, scheduling, deletion, status changes, rescheduling, and
  provider-specific tool calls go through Postiz's public API.
- Sanity scheduling and publishing continue through the local Postiz database
  and worker.
- Composer uploads are forwarded to Postiz Cloud before being saved in the
  local media library, ensuring social networks can access the media.
- Redis keeps non-authoritative editing metadata for Cloud posts created from
  this UI. This preserves media previews and multi-part editor content because
  the Cloud calendar API intentionally returns a compact post representation.

When hybrid mode is disabled, the fork falls back to normal self-hosted Postiz
behavior. OAuth providers without their own environment variables are marked
**Admin setup required**.

Postiz Cloud's public API is the integration boundary. Do not call its private
dashboard endpoints: keeping the adapter on the public API is what makes
upstream Postiz updates and Cloud changes independently maintainable.

Postiz itself is AGPL-3.0. Keep this fork public and retain upstream license and
copyright notices when distributing or running modified builds.
