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

Postiz itself is AGPL-3.0. Keep this fork public and retain upstream license and
copyright notices when distributing or running modified builds.
