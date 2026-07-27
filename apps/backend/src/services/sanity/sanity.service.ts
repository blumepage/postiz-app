import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const SANITY_REQUEST_TIMEOUT_MS = 10_000;
const SCHEDULE_REQUEST_TIMEOUT_MS = 15_000;
const SANITY_API_VERSION = '2025-02-19';
const MAX_ARTICLES = 200;

type SanityPromotion = {
  enabled?: boolean;
  channels?: string[];
  scheduledAt?: string;
  status?: string;
  lastError?: string;
  lastSyncedAt?: string;
  postCount?: number;
};

export type SanityRawArticle = {
  _id: string;
  _updatedAt: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  socialPromotion?: SanityPromotion;
};

export type SanityArticle = {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  updatedAt: string;
  hasDraft: boolean;
  isPublished: boolean;
  socialPromotion?: SanityPromotion;
};

export type SanityArticleList = {
  configured: boolean;
  studioUrl?: string;
  articles: SanityArticle[];
  missing?: string[];
};

@Injectable()
export class SanityService {
  async listArticles(): Promise<SanityArticleList> {
    const config = this.getReadConfig();
    if (config.missing.length > 0) {
      return {
        configured: false,
        articles: [],
        missing: config.missing,
      };
    }

    const query = `*[_type == "blogPost"] | order(_updatedAt desc)[0...${MAX_ARTICLES}] {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      excerpt,
      publishedAt,
      "socialPromotion": socialPromotion {
        enabled,
        channels,
        scheduledAt,
        status,
        lastError,
        lastSyncedAt,
        "postCount": count(postizPosts)
      }
    }`;
    const url = new URL(
      `https://${config.projectId}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${config.dataset}`,
    );
    url.searchParams.set('query', query);
    url.searchParams.set('perspective', config.token ? 'raw' : 'published');
    url.searchParams.set('returnQuery', 'false');

    const response = await fetch(url, {
      headers: config.token
        ? { Authorization: `Bearer ${config.token}` }
        : undefined,
      signal: AbortSignal.timeout(SANITY_REQUEST_TIMEOUT_MS),
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new BadGatewayException(
        `Sanity ${response.status}: ${errorDetail(body, response.statusText)}`,
      );
    }

    const rawArticles =
      body &&
      typeof body === 'object' &&
      Array.isArray((body as { result?: unknown }).result)
        ? ((body as { result: SanityRawArticle[] }).result ?? [])
        : [];

    return {
      configured: true,
      studioUrl: config.studioUrl,
      articles: normalizeSanityArticles(rawArticles),
    };
  }

  async scheduleArticle(documentId: string): Promise<unknown> {
    const id = normalizeDocumentId(documentId);
    const scheduleUrl = process.env.SANITY_SOCIAL_SCHEDULE_URL?.trim();
    const scheduleSecret = process.env.SANITY_SOCIAL_SCHEDULE_SECRET?.trim();
    const missing = [
      !scheduleUrl && 'SANITY_SOCIAL_SCHEDULE_URL',
      !scheduleSecret && 'SANITY_SOCIAL_SCHEDULE_SECRET',
    ].filter((value): value is string => Boolean(value));

    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Sanity scheduling is not configured: ${missing.join(', ')}`,
      );
    }

    const url = new URL(scheduleUrl);
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    ) {
      throw new ServiceUnavailableException(
        'SANITY_SOCIAL_SCHEDULE_URL must use HTTPS',
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${scheduleSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _id: id }),
      signal: AbortSignal.timeout(SCHEDULE_REQUEST_TIMEOUT_MS),
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new BadGatewayException(
        `Social scheduling ${response.status}: ${errorDetail(
          body,
          response.statusText,
        )}`,
      );
    }

    return body;
  }

  private getReadConfig(): {
    projectId: string;
    dataset: string;
    token?: string;
    studioUrl?: string;
    missing: string[];
  } {
    const projectId = (
      process.env.SANITY_PROJECT_ID ||
      process.env.PUBLIC_SANITY_PROJECT_ID ||
      ''
    ).trim();
    const dataset = (
      process.env.SANITY_DATASET ||
      process.env.PUBLIC_SANITY_DATASET ||
      ''
    ).trim();
    const token = process.env.SANITY_API_READ_TOKEN?.trim() || undefined;
    const studioUrl =
      process.env.SANITY_STUDIO_URL?.trim().replace(/\/+$/, '') || undefined;
    const missing = [
      !projectId && 'SANITY_PROJECT_ID',
      !dataset && 'SANITY_DATASET',
    ].filter((value): value is string => Boolean(value));

    if (projectId && !/^[a-z0-9-]+$/.test(projectId)) {
      missing.push('SANITY_PROJECT_ID (invalid)');
    }
    if (dataset && !/^[a-zA-Z0-9_.-]+$/.test(dataset)) {
      missing.push('SANITY_DATASET (invalid)');
    }

    return { projectId, dataset, token, studioUrl, missing };
  }
}

export function normalizeSanityArticles(
  documents: SanityRawArticle[],
): SanityArticle[] {
  const versions = new Map<
    string,
    { draft?: SanityRawArticle; published?: SanityRawArticle }
  >();

  for (const document of documents) {
    if (
      !document ||
      typeof document._id !== 'string' ||
      document._id.length === 0 ||
      typeof document._updatedAt !== 'string'
    ) {
      continue;
    }

    const isDraft = document._id.startsWith('drafts.');
    const id = normalizeDocumentId(document._id);
    const current = versions.get(id) ?? {};
    if (isDraft) current.draft = document;
    else current.published = document;
    versions.set(id, current);
  }

  return [...versions.entries()]
    .map(([id, version]): SanityArticle => {
      const current = version.draft ?? version.published!;
      return {
        id,
        title: current.title?.trim() || 'Untitled article',
        slug: current.slug,
        excerpt: current.excerpt,
        publishedAt: version.published?.publishedAt ?? current.publishedAt,
        updatedAt: current._updatedAt,
        hasDraft: Boolean(version.draft),
        isPublished: Boolean(version.published),
        socialPromotion: current.socialPromotion,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}

function normalizeDocumentId(value: string): string {
  const id = value.replace(/^drafts\./, '');
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new BadGatewayException('Invalid Sanity document ID');
  }
  return id;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorDetail(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.slice(0, 500);
  if (body && typeof body === 'object') {
    const value = body as {
      message?: unknown;
      error?: { description?: unknown; message?: unknown } | unknown;
    };
    if (typeof value.message === 'string') return value.message;
    if (value.error && typeof value.error === 'object') {
      const error = value.error as { description?: unknown; message?: unknown };
      if (typeof error.description === 'string') return error.description;
      if (typeof error.message === 'string') return error.message;
    }
  }
  return fallback;
}
