# Blume Postiz fork

This fork keeps Blume's social publishing customizations on the `blume` branch.
The `main` branch mirrors `gitroomhq/postiz-app/main` and should not contain
Blume-only edits.

Railway deploys the `blume` branch. The weekly **Sync Postiz upstream** workflow
refreshes `main`, merges upstream into `automation/upstream-sync`, and opens a
pull request into `blume`. Resolve any conflicts in that pull request rather
than copying a new Postiz release over this repository.

## Blume-owned surface

The native `/content` view reads blog articles from Sanity through an
authenticated Postiz backend route. It can:

- show published articles and draft overlays without exposing the Sanity token;
- surface social opt-in, Postiz status, and automation errors;
- open the document in Sanity Studio;
- call Blume's Vercel social-scheduling route from Postiz.

Configure the Postiz service with:

```env
SANITY_PROJECT_ID=rhfgd9vo
SANITY_DATASET=production
SANITY_API_READ_TOKEN=
SANITY_STUDIO_URL=https://blume-blog.sanity.studio
SANITY_SOCIAL_SCHEDULE_URL=https://blume.codes/api/blog/social/schedule
SANITY_SOCIAL_SCHEDULE_SECRET=
```

`SANITY_API_READ_TOKEN` should be a read-only token. It is optional for a public
dataset, but required to include draft overlays. The schedule secret must match
`BLOG_SOCIAL_SECRET` in the Blume website's Vercel environment.

Postiz itself is AGPL-3.0. Keep this fork public and retain upstream license and
copyright notices when distributing or running modified builds.
