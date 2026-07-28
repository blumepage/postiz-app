'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useDrop } from 'react-dnd';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import {
  CalendarItem,
  usePostActions,
} from '@gitroom/frontend/components/launches/calendar';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

type IdeaStage = 'INBOX' | 'PICKED' | 'POLISHED' | 'SCHEDULED';

type Idea = {
  group: string;
  stage: IdeaStage;
  publishDate: string;
  posts: any[];
};

type IdeasResponse = {
  ideas: Idea[];
};

const columns: Array<{
  stage: IdeaStage;
  title: string;
  description: string;
}> = [
  {
    stage: 'INBOX',
    title: 'Inbox',
    description: 'New drafts and unprocessed ideas',
  },
  {
    stage: 'PICKED',
    title: 'Picked',
    description: 'Ideas selected for development',
  },
  {
    stage: 'POLISHED',
    title: 'Polished',
    description: 'Ready to schedule',
  },
  {
    stage: 'SCHEDULED',
    title: 'Scheduled',
    description: 'Drop here to use the next available slot',
  },
];

const IdeaCard: FC<{
  idea: Idea;
  integrations: Integrations[];
  mutate: () => void;
  pending: boolean;
}> = ({ idea, integrations, mutate, pending }) => {
  const user = useUser();
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions(mutate, integrations);
  const post = idea.posts[0];
  const channelCount = new Set(
    idea.posts.map((item) => item.integration?.id).filter(Boolean)
  ).size;

  if (!post) {
    return null;
  }

  return (
    <div
      className={clsx(
        'relative transition-opacity',
        pending && 'pointer-events-none opacity-50'
      )}
    >
      <CalendarItem
        isBeforeNow={false}
        date={newDayjs(post.publishDate)}
        state={post.state}
        statistics={openStatistics(post.id)}
        missingRelease={openMissingRelease(post.id)}
        editPost={editPost(post, false)}
        duplicatePost={editPost(post, true)}
        copyDebugJson={user?.isSuperAdmin ? copyDebugJson(post) : undefined}
        post={post}
        integrations={integrations}
        deletePost={deletePost(post)}
        dragType="idea"
        dragItem={{ group: idea.group, stage: idea.stage }}
        canDrag={idea.stage !== 'SCHEDULED' && !pending}
      />
      {channelCount > 1 && (
        <div className="mt-[5px] px-[4px] text-[10px] text-textColor/40">
          {channelCount} channels
        </div>
      )}
    </div>
  );
};

const IdeaColumn: FC<{
  column: (typeof columns)[number];
  ideas: Idea[];
  integrations: Integrations[];
  pendingGroups: Set<string>;
  mutate: () => void;
  onMove: (group: string, stage: IdeaStage) => Promise<void>;
}> = ({ column, ideas, integrations, pendingGroups, mutate, onMove }) => {
  const [{ isOver, canDrop }, dropRef] = useDrop<
    { group: string; stage: IdeaStage },
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: 'idea',
      canDrop: (item: { group: string; stage: IdeaStage }) =>
        item.stage !== 'SCHEDULED' && item.stage !== column.stage,
      drop: (item: { group: string }) => {
        void onMove(item.group, column.stage);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [column.stage, onMove]
  );

  return (
    <section
      ref={(node) => {
        dropRef(node);
      }}
      className={clsx(
        'flex min-h-full w-[310px] shrink-0 flex-col rounded-[14px] border bg-newSettings/35 p-[10px] transition-colors',
        isOver && canDrop
          ? 'border-btnPrimary bg-btnPrimary/5'
          : 'border-newTextColor/5'
      )}
    >
      <div className="mb-[10px] px-[3px]">
        <div className="flex items-center justify-between gap-[8px]">
          <h2 className="text-[13px] font-[600] text-textColor/85">
            {column.title}
          </h2>
          <span className="rounded-full bg-newBgColorInner px-[7px] py-[2px] text-[10px] text-textColor/45">
            {ideas.length}
          </span>
        </div>
        <p className="mt-[2px] text-[10px] leading-[1.4] text-textColor/35">
          {column.description}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-[10px]">
        {ideas.map((idea) => (
          <IdeaCard
            key={idea.group}
            idea={idea}
            integrations={integrations}
            mutate={mutate}
            pending={pendingGroups.has(idea.group)}
          />
        ))}
        {!ideas.length && (
          <div
            className={clsx(
              'flex min-h-[120px] flex-1 items-center justify-center rounded-[10px] border border-dashed px-[20px] text-center text-[11px] text-textColor/30',
              isOver && canDrop
                ? 'border-btnPrimary/60'
                : 'border-newTextColor/10'
            )}
          >
            Drop an idea here
          </div>
        )}
      </div>
    </section>
  );
};

export const IdeasComponent = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { data: integrations = [] } = useIntegrationList();
  const [pendingGroups, setPendingGroups] = useState<Set<string>>(new Set());

  const loadIdeas = useCallback(async () => {
    const response = await fetch('/ideas');
    if (!response.ok) {
      throw new Error('Could not load ideas');
    }
    return (await response.json()) as IdeasResponse;
  }, [fetch]);

  const { data, isLoading, mutate } = useSWR('/ideas-board', loadIdeas, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });

  const ideasByStage = useMemo(() => {
    return columns.reduce(
      (result, column) => ({
        ...result,
        [column.stage]: (data?.ideas || []).filter(
          (idea) => idea.stage === column.stage
        ),
      }),
      {} as Record<IdeaStage, Idea[]>
    );
  }, [data?.ideas]);

  const moveIdea = useCallback(
    async (group: string, stage: IdeaStage) => {
      const previous = data;
      setPendingGroups((current) => new Set(current).add(group));
      await mutate(
        (current) =>
          current
            ? {
                ideas: current.ideas.map((idea) =>
                  idea.group === group ? { ...idea, stage } : idea
                ),
              }
            : current,
        { revalidate: false }
      );

      try {
        const response =
          stage === 'SCHEDULED'
            ? await fetch(`/ideas/${encodeURIComponent(group)}/schedule`, {
                method: 'POST',
              })
            : await fetch(`/ideas/${encodeURIComponent(group)}/stage`, {
                method: 'PUT',
                body: JSON.stringify({ stage }),
              });
        if (!response.ok) {
          throw new Error(await response.text());
        }

        if (stage === 'SCHEDULED') {
          const scheduled = await response.json();
          toaster.show(
            t(
              'idea_scheduled_for',
              `Scheduled for ${newDayjs(scheduled.date).local().format('lll')}`
            ),
            'success'
          );
        }
        await mutate();
      } catch {
        await mutate(previous, { revalidate: false });
        toaster.show(
          t('idea_move_failed', 'Could not move this idea. Please try again.'),
          'warning'
        );
      } finally {
        setPendingGroups((current) => {
          const next = new Set(current);
          next.delete(group);
          return next;
        });
      }
    },
    [data, fetch, mutate, t, toaster]
  );

  return (
    <DNDProvider>
      <main className="flex min-h-0 flex-1 flex-col bg-newBgColorInner p-[20px]">
        <div className="mb-[18px]">
          <h1 className="text-[24px] font-[600] tracking-[-0.02em] text-textColor">
            {t('ideas', 'Ideas')}
          </h1>
          <p className="mt-[3px] text-[12px] text-textColor/45">
            {t(
              'ideas_description',
              'Develop drafts into polished posts, then schedule them at the next available slot.'
            )}
          </p>
        </div>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-textColor/40">
            {t('loading_ideas', 'Loading ideas...')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-[12px] overflow-x-auto overflow-y-hidden pb-[8px] scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary">
            {columns.map((column) => (
              <div
                key={column.stage}
                className="min-h-0 overflow-y-auto scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary"
              >
                <IdeaColumn
                  column={column}
                  ideas={ideasByStage[column.stage] || []}
                  integrations={integrations}
                  pendingGroups={pendingGroups}
                  mutate={() => {
                    mutate();
                  }}
                  onMove={moveIdea}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </DNDProvider>
  );
};
