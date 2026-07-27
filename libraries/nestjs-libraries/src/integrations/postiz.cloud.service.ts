import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { isPostizCloudOAuthProvider } from '@gitroom/nestjs-libraries/integrations/integration.configuration';

export type PostizCloudIntegration = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
  profile?: string;
  customer?: {
    id: string;
    name: string;
  };
};

export type PostizCloudPost = {
  id: string;
  content: string;
  publishDate: string;
  releaseURL?: string;
  releaseId?: string;
  state: string;
  group: string;
  tags?: any[];
  intervalInDays?: number;
  actualDate?: string;
  creationMethod?: string;
  integration: {
    id: string;
    providerIdentifier: string;
    name: string;
    picture?: string;
  };
  image?: any[];
  settings?: Record<string, any>;
};

type CloudPostShadow = {
  integrationId: string;
  value: Array<{
    content: string;
    image?: any[];
    delay?: number;
  }>;
  settings: Record<string, any>;
  group?: string;
};

export const isPostizCloudEnabled = () =>
  Boolean(process.env.POSTIZ_CLOUD_API_KEY?.trim());

@Injectable()
export class PostizCloudService {
  get enabled() {
    return isPostizCloudEnabled();
  }

  isOAuthProvider(identifier: string) {
    return isPostizCloudOAuthProvider(identifier);
  }

  private get baseUrl() {
    return (
      process.env.POSTIZ_CLOUD_API_URL?.replace(/\/$/, '') ||
      'https://api.postiz.com/public/v1'
    );
  }

  private get apiKey() {
    const key = process.env.POSTIZ_CLOUD_API_KEY?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Postiz Cloud has not been connected yet.'
      );
    }
    return key;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    responseType: 'json' | 'empty' = 'json'
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: this.apiKey,
          ...(init.body instanceof FormData
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(init.headers || {}),
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Postiz Cloud is temporarily unreachable.'
      );
    }

    const text = await response.text();
    let data: any = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      throw new HttpException(
        data?.msg ||
          data?.message ||
          `Postiz Cloud request failed (${response.status}).`,
        response.status
      );
    }

    return responseType === 'empty' ? ({} as T) : (data as T);
  }

  async listIntegrations() {
    if (!this.enabled) {
      return [] as PostizCloudIntegration[];
    }
    return this.request<PostizCloudIntegration[]>('/integrations');
  }

  async hasIntegration(id: string) {
    return (await this.listIntegrations()).some(
      (integration) => integration.id === id
    );
  }

  async getAuthUrl(identifier: string, refresh?: string) {
    const params = new URLSearchParams();
    if (refresh) {
      params.set('refresh', refresh);
    }
    return this.request<{ url: string }>(
      `/social/${encodeURIComponent(identifier)}${
        params.size ? `?${params.toString()}` : ''
      }`
    );
  }

  async getPosts(
    organizationId: string,
    query: {
      startDate: string;
      endDate: string;
      customer?: string;
    }
  ) {
    if (!this.enabled) {
      return [] as PostizCloudPost[];
    }

    const params = new URLSearchParams({
      startDate: query.startDate,
      endDate: query.endDate,
    });
    if (query.customer) {
      params.set('customer', query.customer);
    }

    const response = await this.request<{ posts: PostizCloudPost[] }>(
      `/posts?${params.toString()}`
    );
    return this.decoratePosts(organizationId, response.posts || []);
  }

  async getAllPosts(organizationId: string) {
    return this.getPosts(organizationId, {
      startDate: '2010-01-01T00:00:00.000Z',
      endDate: '2100-01-01T00:00:00.000Z',
    });
  }

  private shadowKey(organizationId: string, postId: string) {
    return `postiz-cloud:shadow:${organizationId}:${postId}`;
  }

  private async readShadow(organizationId: string, postId: string) {
    try {
      const value = await ioRedis.get(this.shadowKey(organizationId, postId));
      return value ? (JSON.parse(value) as CloudPostShadow) : undefined;
    } catch {
      return undefined;
    }
  }

  private async writeShadow(
    organizationId: string,
    postId: string,
    shadow: CloudPostShadow
  ) {
    try {
      await ioRedis.set(
        this.shadowKey(organizationId, postId),
        JSON.stringify(shadow)
      );
    } catch {
      // Shadow data only enriches editing and media previews. Cloud remains
      // the publishing source of truth if Redis is temporarily unavailable.
    }
  }

  private async deleteShadow(organizationId: string, postId: string) {
    try {
      await ioRedis.del(this.shadowKey(organizationId, postId));
    } catch {
      // Cloud deletion already succeeded; stale preview metadata is harmless.
    }
  }

  private async decoratePosts(
    organizationId: string,
    posts: PostizCloudPost[]
  ) {
    return Promise.all(
      posts.map(async (post) => {
        const shadow = await this.readShadow(organizationId, post.id);
        if (shadow && shadow.group !== post.group) {
          shadow.group = post.group;
          await this.writeShadow(organizationId, post.id, shadow);
        }

        return {
          ...post,
          image: shadow?.value?.[0]?.image || post.image || [],
          settings: shadow?.settings || {
            __type: post.integration.providerIdentifier,
          },
        };
      })
    );
  }

  async createPosts(organizationId: string, rawBody: any) {
    const type = rawBody?.type === 'update' ? 'draft' : rawBody?.type;
    const integrations = await this.listIntegrations();
    const integrationMap = new Map(
      integrations.map((integration) => [integration.id, integration])
    );

    const posts = (rawBody?.posts || []).map((post: any) => {
      const integration = integrationMap.get(post?.integration?.id);
      if (!integration) {
        throw new HttpException(
          `Postiz Cloud channel ${
            post?.integration?.id || 'unknown'
          } was not found.`,
          400
        );
      }
      return {
        ...post,
        integration: { id: integration.id },
        settings: {
          ...(post.settings || {}),
          __type: integration.identifier,
        },
      };
    });

    const created = await this.request<
      Array<{ postId: string; integration: string }>
    >('/posts', {
      method: 'POST',
      body: JSON.stringify({
        ...rawBody,
        type,
        posts,
      }),
    });

    await Promise.all(
      created.map(async (item) => {
        const source = posts.find(
          (post: any) => post.integration.id === item.integration
        );
        if (!source) {
          return;
        }
        await this.writeShadow(organizationId, item.postId, {
          integrationId: item.integration,
          value: source.value || [],
          settings: source.settings || {},
        });
      })
    );

    return created;
  }

  async getPostGroup(organizationId: string, group: string) {
    const posts = (await this.getAllPosts(organizationId)).filter(
      (post) => post.group === group
    );
    if (!posts.length) {
      return undefined;
    }

    const root = posts[0];
    const shadow = await this.readShadow(organizationId, root.id);
    const values = shadow?.value?.length
      ? shadow.value
      : [{ content: root.content, image: root.image || [], delay: 0 }];

    return {
      group,
      posts: values.map((value, index) => ({
        ...root,
        id: index === 0 ? root.id : `${root.id}:cloud-shadow:${index}`,
        parentPostId: index === 0 ? null : root.id,
        content: value.content,
        delay: value.delay || 0,
        image: value.image || [],
        integration: index === 0 ? root.integration : undefined,
      })),
      integrationPicture: root.integration.picture,
      integration: root.integration.id,
      settings: shadow?.settings || {
        __type: root.integration.providerIdentifier,
      },
    };
  }

  async getPostById(organizationId: string, id: string) {
    const post = (await this.getAllPosts(organizationId)).find(
      (candidate) => candidate.id === id
    );
    if (!post) {
      return undefined;
    }
    return this.getPostGroup(organizationId, post.group);
  }

  async deletePostGroup(organizationId: string, group: string) {
    const posts = (await this.getAllPosts(organizationId)).filter(
      (post) => post.group === group
    );
    await this.request(`/posts/group/${encodeURIComponent(group)}`, {
      method: 'DELETE',
    });
    await Promise.all(
      posts.map((post) => this.deleteShadow(organizationId, post.id))
    );
    return { id: posts[0]?.id || group };
  }

  async changePostStatus(id: string, status: 'draft' | 'schedule') {
    return this.request<{ id: string; state: string }>(`/posts/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async reschedulePostGroup(
    organizationId: string,
    group: string,
    date: string
  ) {
    const existing = await this.getPostGroup(organizationId, group);
    if (!existing) {
      throw new HttpException('Postiz Cloud post was not found.', 404);
    }

    const root = existing.posts[0];
    const state = root.state === 'DRAFT' ? 'draft' : 'schedule';
    await this.deletePostGroup(organizationId, group);
    return this.createPosts(organizationId, {
      type: state,
      date,
      shortLink: false,
      tags:
        root.tags?.map((tagWrapper: any) => ({
          value: tagWrapper?.tag?.id,
          label: tagWrapper?.tag?.name,
        })) || [],
      posts: [
        {
          integration: { id: existing.integration },
          settings: existing.settings,
          value: existing.posts.map((post: any) => ({
            content: post.content,
            image: post.image || [],
            delay: post.delay || 0,
          })),
        },
      ],
    });
  }

  async findSlot(integrationId: string) {
    return this.request<{ date: string }>(
      `/find-slot/${encodeURIComponent(integrationId)}`
    );
  }

  async deleteIntegration(id: string) {
    return this.request(`/integrations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async triggerIntegration(
    id: string,
    methodName: string,
    data: Record<string, any>
  ) {
    return this.request<{ output: any }>(
      `/integration-trigger/${encodeURIComponent(id)}`,
      {
        method: 'POST',
        body: JSON.stringify({ methodName, data }),
      }
    );
  }

  async upload(file: Express.Multer.File) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname
    );
    return this.request<{
      id: string;
      name: string;
      originalName?: string;
      path: string;
    }>('/upload', {
      method: 'POST',
      body: form,
    });
  }
}
