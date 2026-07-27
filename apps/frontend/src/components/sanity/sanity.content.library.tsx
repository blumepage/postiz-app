'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

type PromotionStatus =
  | 'scheduling'
  | 'scheduled'
  | 'queued'
  | 'published'
  | 'partial'
  | 'error'
  | string;

type SanityArticle = {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  updatedAt: string;
  hasDraft: boolean;
  isPublished: boolean;
  socialPromotion?: {
    enabled?: boolean;
    channels?: string[];
    scheduledAt?: string;
    status?: PromotionStatus;
    lastError?: string;
    lastSyncedAt?: string;
    postCount?: number;
  };
};

type SanityArticleResponse = {
  configured: boolean;
  studioUrl?: string;
  articles: SanityArticle[];
  missing?: string[];
};

type ContentFilter = 'all' | 'drafts' | 'ready' | 'scheduled' | 'attention';

const FILTERS: Array<{ id: ContentFilter; label: string }> = [
  { id: 'all', label: 'All content' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'ready', label: 'Ready to schedule' },
  { id: 'scheduled', label: 'In Postiz' },
  { id: 'attention', label: 'Needs attention' },
];

export function SanityContentLibrary() {
  const postizFetch = useFetch();
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [search, setSearch] = useState('');
  const [schedulingId, setSchedulingId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const load = useCallback(
    async (path: string): Promise<SanityArticleResponse> => {
      const response = await postizFetch(path);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Could not load Sanity content');
      }
      return body;
    },
    [postizFetch],
  );
  const { data, error, isLoading, mutate } = useSWR('/sanity/articles', load, {
    revalidateOnFocus: false,
  });

  const articles = data?.articles ?? [];
  const counts = useMemo(
    () => ({
      drafts: articles.filter((article) => article.hasDraft).length,
      ready: articles.filter(isReadyToSchedule).length,
      inPostiz: articles.filter((article) =>
        Boolean(article.socialPromotion?.status),
      ).length,
      attention: articles.filter(needsAttention).length,
    }),
    [articles],
  );
  const visibleArticles = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return articles.filter((article) => {
      if (
        needle &&
        ![article.title, article.slug, article.excerpt]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(needle))
      ) {
        return false;
      }
      if (filter === 'drafts') return article.hasDraft;
      if (filter === 'ready') return isReadyToSchedule(article);
      if (filter === 'scheduled') {
        return Boolean(article.socialPromotion?.status);
      }
      if (filter === 'attention') return needsAttention(article);
      return true;
    });
  }, [articles, filter, search]);

  const schedule = async (article: SanityArticle) => {
    setSchedulingId(article.id);
    setActionError(undefined);
    try {
      const response = await postizFetch(
        `/sanity/articles/${encodeURIComponent(article.id)}/schedule`,
        { method: 'POST' },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Could not schedule this article');
      }
      await mutate();
    } catch (scheduleError) {
      setActionError(
        scheduleError instanceof Error
          ? scheduleError.message
          : String(scheduleError),
      );
    } finally {
      setSchedulingId(undefined);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-newBgColorInner text-textItemBlur">
        Loading Sanity content…
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Sanity is unavailable"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (data && !data.configured) {
    return (
      <EmptyState
        title="Connect Sanity to Postiz"
        description={`Add ${(
          data.missing ?? ['SANITY_PROJECT_ID', 'SANITY_DATASET']
        ).join(
          ' and ',
        )} to the Postiz service. A read token also unlocks draft previews.`}
      />
    );
  }

  return (
    <div className="flex flex-1 min-w-0 bg-newBgColorInner overflow-y-auto">
      <div className="w-full px-[28px] py-[24px] flex flex-col gap-[22px]">
        <header className="flex items-start justify-between gap-[20px]">
          <div className="max-w-[720px]">
            <div className="text-[11px] font-[700] tracking-[0.14em] uppercase text-[#612bd3] mb-[7px]">
              Content source · Sanity
            </div>
            <h2 className="text-[26px] leading-[1.2] font-[700]">
              From editorial draft to social launch
            </h2>
            <p className="text-[14px] leading-[1.6] text-textItemBlur mt-[8px]">
              Review article readiness, see every Postiz handoff, and schedule
              published stories without leaving this workspace.
            </p>
          </div>
          {data?.studioUrl ? (
            <a
              href={data.studioUrl}
              target="_blank"
              rel="noreferrer"
              className="h-[42px] px-[16px] shrink-0 rounded-[10px] border border-newTableBorder hover:bg-boxHover transition-colors inline-flex items-center gap-[8px] text-[13px] font-[600]"
            >
              Open Sanity Studio
              <ExternalIcon />
            </a>
          ) : null}
        </header>

        <section className="grid grid-cols-4 tablet:grid-cols-2 mobile:grid-cols-1 gap-[10px]">
          <SummaryCard
            label="Drafts in progress"
            value={counts.drafts}
            tone="violet"
          />
          <SummaryCard
            label="Ready to schedule"
            value={counts.ready}
            tone="green"
          />
          <SummaryCard
            label="Managed in Postiz"
            value={counts.inPostiz}
            tone="blue"
          />
          <SummaryCard
            label="Needs attention"
            value={counts.attention}
            tone="amber"
          />
        </section>

        <section className="border border-newTableBorder rounded-[14px] overflow-hidden">
          <div className="bg-newTableHeader px-[14px] py-[12px] flex tablet:flex-col gap-[12px] items-center tablet:items-stretch justify-between border-b border-newTableBorder">
            <div className="flex gap-[5px] flex-wrap">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={clsx(
                    'px-[11px] h-[34px] rounded-[8px] text-[12px] font-[600] transition-colors',
                    filter === item.id
                      ? 'bg-boxFocused text-textItemFocused'
                      : 'text-textItemBlur hover:bg-boxHover hover:text-newTextColor',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="h-[36px] w-[260px] tablet:w-full rounded-[8px] border border-newTableBorder bg-newBgColorInner flex items-center gap-[8px] px-[11px]">
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or slug"
                className="min-w-0 flex-1 bg-transparent outline-none text-[12px] placeholder:text-textItemBlur"
              />
            </label>
          </div>

          {actionError ? (
            <div className="px-[16px] py-[11px] bg-[#fff5e8] dark:bg-[#2a2115] text-[#9d5b10] dark:text-[#f0b35e] text-[12px] border-b border-newTableBorder">
              {actionError}
            </div>
          ) : null}

          <div className="divide-y divide-newTableBorder">
            {visibleArticles.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                studioUrl={data?.studioUrl}
                scheduling={schedulingId === article.id}
                onSchedule={() => schedule(article)}
              />
            ))}
          </div>

          {visibleArticles.length === 0 ? (
            <div className="py-[70px] px-[20px] text-center">
              <div className="text-[15px] font-[600]">No matching articles</div>
              <div className="text-[13px] text-textItemBlur mt-[5px]">
                Try another filter or update the article in Sanity.
              </div>
            </div>
          ) : null}
        </section>

        <div className="text-[11px] text-textItemBlur flex items-center gap-[7px]">
          <span className="w-[7px] h-[7px] rounded-full bg-[#54b978]" />
          Secure server-to-server connection · Sanity tokens stay in the Postiz
          backend
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'violet' | 'green' | 'blue' | 'amber';
}) {
  const tones = {
    violet: 'from-[#6e38db] to-[#8b5ae8]',
    green: 'from-[#278d57] to-[#4eaf77]',
    blue: 'from-[#316fae] to-[#5796ce]',
    amber: 'from-[#a36b21] to-[#d49a49]',
  };
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[15px] min-h-[102px]">
      <div
        className={clsx(
          'absolute top-0 left-0 w-[4px] h-full bg-gradient-to-b',
          tones[tone],
        )}
      />
      <div className="text-[11px] font-[600] text-textItemBlur">{label}</div>
      <div className="text-[30px] leading-none font-[700] mt-[18px]">
        {value}
      </div>
    </div>
  );
}

function ArticleRow({
  article,
  studioUrl,
  scheduling,
  onSchedule,
}: {
  article: SanityArticle;
  studioUrl?: string;
  scheduling: boolean;
  onSchedule: () => void;
}) {
  const promotion = article.socialPromotion;
  const status = resolveStatus(article);
  const studioDocumentUrl = studioUrl
    ? `${studioUrl}/structure/blogPost;${encodeURIComponent(article.id)}`
    : undefined;

  return (
    <article className="px-[16px] py-[15px] grid grid-cols-[minmax(0,1fr)_180px_180px] tablet:grid-cols-1 gap-[16px] items-center hover:bg-boxHover transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-[8px] flex-wrap">
          <h3 className="text-[14px] font-[600] truncate">{article.title}</h3>
          {article.hasDraft ? (
            <Pill label="Draft changes" tone="violet" />
          ) : null}
          {!article.isPublished ? (
            <Pill label="Not published" tone="neutral" />
          ) : null}
        </div>
        <div className="flex gap-[8px] items-center text-[11px] text-textItemBlur mt-[6px]">
          <span className="truncate">
            {article.slug ? `/${article.slug}` : 'No slug'}
          </span>
          <span>·</span>
          <span className="shrink-0">
            Updated {formatDate(article.updatedAt)}
          </span>
        </div>
        {promotion?.lastError ? (
          <div className="text-[11px] text-[#b96b19] dark:text-[#efb15e] mt-[7px] line-clamp-1">
            {promotion.lastError}
          </div>
        ) : null}
      </div>

      <div className="tablet:order-3">
        <Pill label={status.label} tone={status.tone} />
        <div className="text-[10px] text-textItemBlur mt-[6px]">
          {promotion?.postCount
            ? `${promotion.postCount} social post${
                promotion.postCount === 1 ? '' : 's'
              }`
            : promotion?.enabled
              ? 'Social promotion enabled'
              : 'Opt in from Sanity'}
        </div>
      </div>

      <div className="flex items-center justify-end tablet:justify-start gap-[8px]">
        {studioDocumentUrl ? (
          <a
            href={studioDocumentUrl}
            target="_blank"
            rel="noreferrer"
            className="h-[36px] px-[11px] rounded-[8px] border border-newTableBorder inline-flex items-center gap-[6px] text-[11px] font-[600] hover:bg-newBgColorInner"
          >
            Edit
            <ExternalIcon />
          </a>
        ) : null}
        {isReadyToSchedule(article) ? (
          <button
            type="button"
            onClick={onSchedule}
            disabled={scheduling}
            className="h-[36px] px-[13px] rounded-[8px] bg-btnPrimary text-white text-[11px] font-[700] hover:opacity-90 disabled:opacity-60 disabled:cursor-wait"
          >
            {scheduling ? 'Scheduling…' : 'Schedule in Postiz'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: 'violet' | 'green' | 'blue' | 'amber' | 'red' | 'neutral';
}) {
  const tones = {
    violet: 'bg-[#f0ebff] dark:bg-[#2b2142] text-[#6737c6] dark:text-[#b89ae9]',
    green: 'bg-[#e9f7ee] dark:bg-[#182b20] text-[#257644] dark:text-[#6bd08d]',
    blue: 'bg-[#eaf3fb] dark:bg-[#182735] text-[#2d679b] dark:text-[#78b1df]',
    amber: 'bg-[#fff4e5] dark:bg-[#2d2417] text-[#9b641d] dark:text-[#e4ad62]',
    red: 'bg-[#fdecec] dark:bg-[#341c1d] text-[#a84242] dark:text-[#e88484]',
    neutral: 'bg-newTableHeader text-textItemBlur',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center px-[8px] h-[24px] rounded-full text-[10px] font-[700] whitespace-nowrap',
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-newBgColorInner p-[24px]">
      <div className="max-w-[520px] rounded-[16px] border border-newTableBorder p-[28px] text-center">
        <div className="w-[44px] h-[44px] rounded-[12px] bg-boxFocused text-textItemFocused mx-auto flex items-center justify-center">
          <DocumentIcon />
        </div>
        <h2 className="text-[18px] font-[700] mt-[16px]">{title}</h2>
        <p className="text-[13px] leading-[1.6] text-textItemBlur mt-[8px]">
          {description}
        </p>
      </div>
    </div>
  );
}

function isReadyToSchedule(article: SanityArticle): boolean {
  const promotion = article.socialPromotion;
  return Boolean(
    article.isPublished &&
    promotion?.enabled &&
    !promotion.status &&
    !promotion.postCount,
  );
}

function needsAttention(article: SanityArticle): boolean {
  return (
    article.socialPromotion?.status === 'error' ||
    article.socialPromotion?.status === 'partial' ||
    Boolean(article.socialPromotion?.lastError)
  );
}

function resolveStatus(article: SanityArticle): {
  label: string;
  tone: 'violet' | 'green' | 'blue' | 'amber' | 'red' | 'neutral';
} {
  const status = article.socialPromotion?.status;
  if (status === 'published') return { label: 'Published', tone: 'green' };
  if (status === 'error') return { label: 'Error', tone: 'red' };
  if (status === 'partial') return { label: 'Partial', tone: 'amber' };
  if (status === 'scheduled') return { label: 'Scheduled', tone: 'blue' };
  if (status === 'queued') return { label: 'Queued', tone: 'blue' };
  if (status === 'scheduling') return { label: 'Scheduling', tone: 'violet' };
  if (isReadyToSchedule(article)) {
    return { label: 'Ready', tone: 'green' };
  }
  if (article.hasDraft) return { label: 'In editorial', tone: 'violet' };
  if (!article.socialPromotion?.enabled) {
    return { label: 'Not opted in', tone: 'neutral' };
  }
  return { label: status || 'Not ready', tone: 'neutral' };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 5h5v5m0-5-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-6-6 6 6m-6-6v6h6M8 13h8M8 17h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
