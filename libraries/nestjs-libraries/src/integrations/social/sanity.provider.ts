import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { SanityDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/sanity.dto';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { htmlToPortableText } from '@gitroom/nestjs-libraries/integrations/social/sanity.portable-text';
import dayjs from 'dayjs';
import slugify from 'slugify';

const SANITY_API_VERSION = 'v2025-02-19';

type SanityCredentials = {
  projectId: string;
  dataset: string;
  token: string;
  documentType: string;
  siteUrl: string;
  studioUrl: string;
};

export class SanityProvider extends SocialAbstract implements SocialProvider {
  identifier = 'sanity';
  name = 'Sanity';
  isBetweenSteps = false;
  editor = 'html' as const;
  scopes = [] as string[];
  override maxConcurrentJob = 5;
  dto = SanityDto;

  maxLength() {
    return 100000;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async refreshToken(): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async customFields() {
    return [
      {
        key: 'projectId',
        label: 'Project ID',
        validation: `/^[a-z0-9-]+$/`,
        type: 'text' as const,
      },
      {
        key: 'dataset',
        label: 'Dataset',
        defaultValue: 'production',
        validation: `/^[a-zA-Z0-9_.-]+$/`,
        type: 'text' as const,
      },
      {
        key: 'documentType',
        label: 'Document type',
        defaultValue: 'blogPost',
        validation: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`,
        type: 'text' as const,
        hint: 'The Sanity schema type to create, for example blogPost',
      },
      {
        key: 'token',
        label: 'Write token',
        validation: `/.+/`,
        type: 'password' as const,
        hint: 'Use a dedicated Sanity robot token with Editor access',
      },
      {
        key: 'siteUrl',
        label: 'Published blog base URL',
        validation: `/^https?:\\/\\/[^\\s/$.?#].[^\\s]*$/`,
        type: 'text' as const,
        hint: 'The public blog path, for example https://blume.codes/blog',
      },
      {
        key: 'studioUrl',
        label: 'Studio URL',
        validation: `/^https?:\\/\\/[^\\s/$.?#].[^\\s]*$/`,
        type: 'text' as const,
      },
    ];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails | string> {
    let credentials: SanityCredentials;
    try {
      credentials = decodeCredentials(params.code);
    } catch {
      return 'Invalid Sanity connection details';
    }

    const queryUrl = new URL(
      `${sanityBaseUrl(credentials)}/data/query/${credentials.dataset}`
    );
    queryUrl.searchParams.set('query', 'count(*)');
    queryUrl.searchParams.set('returnQuery', 'false');

    let response: Response;
    try {
      response = await fetch(queryUrl, {
        headers: sanityHeaders(credentials),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return 'Could not reach Sanity. Check the project ID and network connection.';
    }

    if (response.status === 401 || response.status === 403) {
      return 'Sanity rejected the write token. Use a dedicated robot token with Editor access.';
    }
    if (!response.ok) {
      return `Sanity returned HTTP ${response.status}. Check the project ID and dataset.`;
    }

    const mutationUrl = new URL(
      `${sanityBaseUrl(credentials)}/data/mutate/${credentials.dataset}`
    );
    mutationUrl.searchParams.set('dryRun', 'true');
    let writeResponse: Response;
    try {
      writeResponse = await fetch(mutationUrl, {
        method: 'POST',
        headers: sanityHeaders(credentials, 'application/json'),
        body: JSON.stringify({
          mutations: [
            {
              createIfNotExists: {
                _id: 'postiz.connection-test',
                _type: credentials.documentType,
                title: 'Postiz connection test',
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return 'Could not verify Sanity write access. Try connecting again.';
    }
    if (!writeResponse.ok) {
      return 'Sanity could be read, but the token cannot write documents. Use a dedicated robot token with Editor access.';
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: params.code,
      id: `${credentials.projectId}_${credentials.dataset}_${credentials.documentType}`,
      name: `${credentials.projectId} / ${credentials.dataset}`,
      picture: '',
      username: credentials.documentType,
    };
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (status === 401 || status === 403) {
      return {
        type: 'bad-body',
        value:
          'Sanity rejected the write. Reconnect with a robot token that has Editor access.',
      };
    }
    if (body.includes('mutationError') || body.includes('"error"')) {
      return {
        type: 'bad-body',
        value: sanityErrorMessage(body),
      };
    }
    return undefined;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<SanityDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const credentials = decodeCredentials(accessToken);
    const details = postDetails[0];
    const title = details.settings.title.trim();
    const slug = slugify(title, { lower: true, strict: true, trim: true });
    const published = (details.settings.status || 'publish') === 'publish';
    const stableId = `postiz.${id.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const documentId = published ? stableId : `drafts.${stableId}`;
    const now = new Date().toISOString();

    let imageAssetId: string | undefined;
    if (details.settings.main_image?.path) {
      imageAssetId = await this.uploadImage(
        credentials,
        details.settings.main_image.path
      );
    }

    const document = {
      _id: documentId,
      _type: credentials.documentType,
      title,
      slug: { _type: 'slug', current: slug },
      excerpt:
        details.settings.excerpt?.trim() || plainTextExcerpt(details.message),
      author: details.settings.author.trim(),
      publishedAt: now,
      body: htmlToPortableText(details.message),
      ...(imageAssetId
        ? {
            headerImage: {
              _type: 'image',
              alt: title,
              asset: { _type: 'reference', _ref: imageAssetId },
            },
          }
        : {}),
    };

    const mutationUrl = new URL(
      `${sanityBaseUrl(credentials)}/data/mutate/${credentials.dataset}`
    );
    mutationUrl.searchParams.set('returnIds', 'true');
    const response = await this.fetch(mutationUrl.toString(), {
      method: 'POST',
      headers: sanityHeaders(credentials, 'application/json'),
      body: JSON.stringify({
        mutations: [{ createOrReplace: document }],
      }),
    });
    const result = (await response.json()) as {
      results?: Array<{ id?: string; documentId?: string }>;
    };
    const postId =
      result.results?.[0]?.documentId || result.results?.[0]?.id || documentId;
    const releaseURL = published
      ? `${credentials.siteUrl.replace(/\/+$/, '')}/${slug}`
      : `${credentials.studioUrl.replace(/\/+$/, '')}/structure/${
          credentials.documentType
        };${stableId}`;

    return [
      {
        id: details.id,
        status: 'completed',
        postId,
        releaseURL,
      },
    ];
  }

  private async uploadImage(
    credentials: SanityCredentials,
    imageUrl: string
  ): Promise<string> {
    const imageResponse = await this.fetch(imageUrl);
    const blob = await imageResponse.blob();
    const filename = new URL(imageUrl, 'https://postiz.invalid').pathname
      .split('/')
      .pop();
    const uploadUrl = new URL(
      `${sanityBaseUrl(credentials)}/assets/images/${credentials.dataset}`
    );
    if (filename) uploadUrl.searchParams.set('filename', filename);

    const response = await this.fetch(uploadUrl.toString(), {
      method: 'POST',
      headers: sanityHeaders(
        credentials,
        blob.type || 'application/octet-stream'
      ),
      body: blob,
    });
    const body = (await response.json()) as {
      _id?: string;
      document?: { _id?: string };
    };
    const assetId = body.document?._id || body._id;
    if (!assetId) throw new Error('Sanity did not return an image asset ID');
    return assetId;
  }
}

function decodeCredentials(value: string): SanityCredentials {
  const credentials = JSON.parse(
    Buffer.from(value, 'base64').toString()
  ) as SanityCredentials;
  if (
    !credentials.projectId ||
    !/^[a-z0-9-]+$/.test(credentials.projectId) ||
    !credentials.dataset ||
    !/^[a-zA-Z0-9_.-]+$/.test(credentials.dataset) ||
    !credentials.documentType ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(credentials.documentType) ||
    !credentials.token ||
    !isHttpUrl(credentials.siteUrl) ||
    !isHttpUrl(credentials.studioUrl)
  ) {
    throw new Error('Invalid Sanity credentials');
  }
  return credentials;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function sanityBaseUrl(credentials: SanityCredentials): string {
  return `https://${credentials.projectId}.api.sanity.io/${SANITY_API_VERSION}`;
}

function sanityHeaders(
  credentials: SanityCredentials,
  contentType?: string
): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.token}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

function plainTextExcerpt(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function sanityErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { description?: string; message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') return parsed.error;
    return (
      parsed.error?.description ||
      parsed.error?.message ||
      parsed.message ||
      'Sanity rejected the document'
    );
  } catch {
    return 'Sanity rejected the document';
  }
}
