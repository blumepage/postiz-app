'use client';

import React, {
  FC,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CalendarContext,
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useDrag, useDrop } from 'react-dnd';
import { Integration, Post, State, Tags } from '@prisma/client';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { groupBy, sortBy } from 'lodash';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { extend } from 'dayjs';
import { isUSCitizen } from './helpers/isuscitizen.utils';
import { StatisticsModal } from '@gitroom/frontend/components/launches/statistics';
import { MissingReleaseModal } from '@gitroom/frontend/components/launches/missing-release.modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import i18next from 'i18next';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import copy from 'copy-to-clipboard';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { Button } from '@gitroom/react/form/button';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';
import { useClickOutside } from '@mantine/hooks';

// Extend dayjs with necessary plugins
extend(isSameOrAfter);
extend(isSameOrBefore);
extend(localizedFormat);

// Initialize language
const updateDayjsLocale = () => {
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);
};

// Set dayjs locale whenever i18next language changes
i18next.on('languageChanged', () => {
  updateDayjsLocale();
});

// Initial setup
updateDayjsLocale();

const convertTimeFormatBasedOnLocality = (time: number) => {
  if (isUSCitizen()) {
    return `${time === 12 ? 12 : time % 12}:00 ${time >= 12 ? 'PM' : 'AM'}`;
  } else {
    return `${time}:00`;
  }
};

export const hours = Array.from(
  {
    length: 24,
  },
  (_, i) => i
);

// Shared hook for post actions (edit, delete, statistics)
const usePostActions = (onMutate?: () => void) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const { integrations, reloadCalendarView } = useCalendar();

  const mutate = useCallback(() => {
    reloadCalendarView();
    onMutate?.();
  }, [reloadCalendarView, onMutate]);

  const editPost = useCallback(
    (loadPost: any, isDuplicate?: boolean) => async () => {
      const post = {
        ...loadPost,
        publishDate: loadPost.actualDate || loadPost.publishDate,
      };

      const data = await (await fetch(`/posts/group/${post.group}`)).json();
      const date = !isDuplicate
        ? null
        : (await (await fetch('/posts/find-slot')).json()).date;
      const publishDate = dayjs.utc(date || data.posts[0].publishDate).local();
      const ExistingData = !isDuplicate
        ? ExistingDataContextProvider
        : Fragment;
      modal.openModal({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        fullScreen: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px] text-textColor',
        },
        children: (
          <ExistingData value={data}>
            <AddEditModal
              {...(isDuplicate
                ? {
                    onlyValues: data.posts.map(
                      ({ image, settings, content }: any) => ({
                        image,
                        settings,
                        content,
                      })
                    ),
                  }
                : {})}
              allIntegrations={integrations.map((p) => ({ ...p }))}
              reopenModal={editPost(post)}
              mutate={mutate}
              integrations={
                isDuplicate
                  ? integrations
                  : integrations
                      .slice(0)
                      .filter((f) => f.id === data.integration)
                      .map((p) => ({
                        ...p,
                        picture: data.integrationPicture,
                      }))
              }
              date={publishDate}
            />
          </ExistingData>
        ),
        size: '80%',
        title: ``,
      });
    },
    [integrations, fetch, modal, mutate]
  );

  const copyDebugJson = useCallback(
    (post: any) => () => {
      modal.openModal({
        title: t('copy_debug_json', 'Copy Debug JSON'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[500px]',
        },
        children: <DebugJsonModal post={post} />,
      });
    },
    [modal, t]
  );

  const deletePost = useCallback(
    (post: any) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_post',
            'Are you sure you want to delete post?'
          )
        ))
      ) {
        return;
      }

      await fetch(`/posts/${post.group}`, {
        method: 'DELETE',
      });

      toaster.show(
        t('post_deleted_successfully', 'Post deleted successfully'),
        'success'
      );

      mutate();
    },
    [toaster, t, fetch, mutate]
  );

  const openStatistics = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('statistics', 'Statistics'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px]',
        },
        children: <StatisticsModal postId={id} />,
        size: '80%',
      });
    },
    [modal, t]
  );

  const openMissingRelease = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('connect_post', 'Connect Post'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[800px]',
        },
        children: <MissingReleaseModal postId={id} onSuccess={mutate} />,
        size: '60%',
      });
    },
    [modal, t, mutate]
  );

  return {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  };
};

export const DayView = () => {
  const calendar = useCalendar();
  const { integrations, posts, startDate } = calendar;

  // Set dayjs locale based on current language
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);

  const currentDay = dayjs.utc(startDate);

  const options = useMemo(() => {
    const createdPosts = posts.map((post) => ({
      integration: [integrations.find((i) => i.id === post.integration.id)!],
      image: post?.integration?.picture || '',
      identifier: post?.integration?.providerIdentifier || '',
      id: post?.integration?.id || '',
      name: post?.integration?.name || '',
      time: dayjs
        .utc(post.publishDate)
        .diff(dayjs.utc(post.publishDate).startOf('day'), 'minute'),
    }));
    return sortBy(
      Object.values(
        groupBy(
          [
            ...createdPosts,
            ...integrations.flatMap((p) =>
              p.time.flatMap((t) => ({
                integration: p,
                identifier: p?.identifier,
                name: p?.name,
                id: p?.id,
                image: p?.picture,
                time: t?.time,
              }))
            ),
          ],
          (p: any) => p.time
        )
      ),
      (p) => p[0].time
    );
  }, [integrations, posts]);

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {options.map((option) => (
          <Fragment key={option[0].time}>
            <div className="text-center text-[14px] min-h-[21px]">
              {newDayjs()
                .utc()
                .startOf('day')
                .add(option[0].time, 'minute')
                .local()
                .format(isUSCitizen() ? 'hh:mm A' : 'LT')}
            </div>
            <div
              key={option[0].time}
              className="min-h-[60px] rounded-[10px] flex justify-center items-center gap-[10px] mb-[20px]"
            >
              <CalendarContext.Provider
                value={{
                  ...calendar,
                  integrations: option.flatMap((p) => p.integration),
                }}
              >
                <CalendarColumn
                  getDate={currentDay
                    .startOf('day')
                    .add(option[0].time, 'minute')
                    .local()}
                />
              </CalendarContext.Provider>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};
export const WeekView = () => {
  const { startDate, endDate } = useCalendar();
  const t = useT();

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    const weekStart = newDayjs(startDate);
    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, 'day');
      days.push({
        name: day.format('dddd'),
        day: day.format('L'),
        date: day,
      });
    }
    return days;
  }, [i18next.resolvedLanguage, startDate]);

  return (
    <div className="flex flex-col text-textColor flex-1">
      <div className="flex-1 relative">
        <div className="grid [grid-template-columns:136px_repeat(7,_minmax(0,_1fr))] gap-[4px] rounded-[10px] absolute h-full start-0 top-0 w-full overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          <div className="z-10 bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0"></div>
          {localizedDays.map((day, index) => (
            <div
              key={day.name}
              className="p-2 text-center bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0 z-[20]"
            >
              <div className="text-[14px] font-[500] text-newTableText">
                {day.name}
              </div>
              <div
                className={clsx(
                  'text-[14px] font-[600] flex items-center justify-center gap-[6px]',
                  day.day === newDayjs().format('L') &&
                    'text-newTableTextFocused'
                )}
              >
                {day.day === newDayjs().format('L') && (
                  <div className="w-[6px] h-[6px] bg-newTableTextFocused rounded-full" />
                )}
                {day.day}
              </div>
            </div>
          ))}
          {hours.map((hour) => (
            <Fragment key={hour}>
              <div className="p-2 pe-4 text-center items-center justify-center flex text-[14px] text-newTableText">
                {convertTimeFormatBasedOnLocality(hour)}
              </div>
              {localizedDays.map((day, indexDay) => (
                <Fragment
                  key={`${startDate}-${day.date.format('YYYY-MM-DD')}-${hour}`}
                >
                  <div className="relative">
                    <CalendarColumn
                      getDate={day.date.hour(hour).startOf('hour')}
                    />
                  </div>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

const ContinuousMonthSection: FC<{
  month: {
    key: string;
    label: string;
    isAnchor: boolean;
    cells: Array<dayjs.Dayjs | null>;
  };
  anchorRef: React.RefObject<HTMLDivElement | null>;
}> = ({ month, anchorRef }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(month.isAnchor);
  const estimatedHeight = (month.cells.length / 7) * 264 + 46;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      sectionRef.current = node;
      if (month.isAnchor) {
        anchorRef.current = node;
      }
    },
    [anchorRef, month.isAnchor]
  );

  return (
    <section
      ref={setRefs}
      data-month={month.key}
      className="scroll-mt-[104px]"
      style={{ minHeight: estimatedHeight }}
    >
      <div className="sticky top-[62px] z-[30] flex h-[42px] items-center border-b border-newTableBorder bg-newBgColorInner/95 px-[12px] text-[15px] font-[600] backdrop-blur">
        {month.label}
      </div>
      {isVisible && (
        <div className="grid grid-cols-7 gap-[4px] pt-[4px]">
          {month.cells.map((date, index) =>
            date ? (
              <CalendarColumn
                key={date.format('YYYY-MM-DD')}
                getDate={date.endOf('day')}
                randomHour={true}
              />
            ) : (
              <div
                key={`${month.key}-empty-${index}`}
                className="min-h-[260px] rounded-[8px] border border-newTextColor/5 bg-newBgColorInner/30"
              />
            )
          )}
        </div>
      )}
    </section>
  );
};

export const MonthView = () => {
  const { startDate } = useCalendar();
  const scrollContainer = useRef<HTMLDivElement>(null);
  const anchorMonth = useRef<HTMLDivElement>(null);

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    // Starting from Monday (1) to Sunday (7)
    for (let i = 1; i <= 7; i++) {
      days.push(newDayjs().day(i).format('dddd'));
    }
    return days;
  }, [i18next.resolvedLanguage]);

  const months = useMemo(() => {
    const selectedMonth = newDayjs(startDate).startOf('month');
    return Array.from({ length: 13 }, (_, monthIndex) => {
      const month = selectedMonth.add(monthIndex - 6, 'month');
      const leadingDays = month.isoWeekday() - 1;
      const cells: Array<dayjs.Dayjs | null> = [
        ...Array.from({ length: leadingDays }, () => null),
        ...Array.from({ length: month.daysInMonth() }, (_, dayIndex) =>
          month.date(dayIndex + 1)
        ),
      ];
      const trailingDays = (7 - (cells.length % 7)) % 7;
      cells.push(...Array.from({ length: trailingDays }, () => null));
      return {
        key: month.format('YYYY-MM'),
        label: month.format('MMMM YYYY'),
        isAnchor: month.isSame(selectedMonth, 'month'),
        cells,
      };
    });
  }, [startDate]);

  useEffect(() => {
    const container = scrollContainer.current;
    const anchor = anchorMonth.current;
    if (!container || !anchor) {
      return;
    }
    container.scrollTop = Math.max(0, anchor.offsetTop - 104);
  }, [startDate, months]);

  return (
    <div className="flex flex-col text-textColor flex-1 relative min-w-0">
      <div
        ref={scrollContainer}
        className="absolute inset-0 overflow-auto rounded-[10px] scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary"
      >
        <div className="sticky top-0 z-[40] grid min-w-[1330px] grid-cols-7 gap-[4px] bg-newBgColorInner pb-[4px]">
          {localizedDays.map((day) => (
            <div
              key={day}
              className="p-2 bg-newTableHeader flex justify-center items-center flex-col h-[58px] rounded-[8px] text-[13px] font-[600]"
            >
              <div>{day}</div>
            </div>
          ))}
        </div>
        <div className="flex min-w-[1330px] flex-col gap-[28px] pb-[32px]">
          {months.map((month) => (
            <ContinuousMonthSection
              key={month.key}
              month={month}
              anchorRef={anchorMonth}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
export const ListView = () => {
  const t = useT();
  const user = useUser();
  const { integrations, loading, listPosts, listState } = useCalendar();
  const emptyMessage =
    listState === 'scheduled'
      ? t('no_upcoming_posts', 'No upcoming posts scheduled')
      : listState === 'draft'
      ? t('no_draft_posts', 'No draft posts')
      : listState === 'published'
      ? t('no_published_posts', 'No published posts')
      : t('no_posts', 'No posts');

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();

  // Group posts by date
  const groupedPosts = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    listPosts.forEach((post) => {
      const dateKey = newDayjs(post.publishDate).local().format('YYYY-MM-DD');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(post);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [listPosts]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  if (listPosts.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor text-[16px]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {groupedPosts.map(([dateKey, datePosts]) => (
          <Fragment key={dateKey}>
            <div className="text-center text-[14px] min-h-[21px] text-textColor font-[500] mt-[10px]">
              {newDayjs(dateKey).format(
                isUSCitizen() ? 'dddd, MMMM D, YYYY' : 'dddd, D MMMM YYYY'
              )}
            </div>
            <div className="flex flex-col gap-[10px] mb-[20px] px-[10px]">
              {datePosts.map((post) => (
                <CalendarItem
                  key={post.id}
                  compact
                  isBeforeNow={false}
                  date={newDayjs(post.publishDate)}
                  state={post.state}
                  statistics={openStatistics(post.id)}
                  missingRelease={openMissingRelease(post.id)}
                  editPost={editPost(post, false)}
                  duplicatePost={editPost(post, true)}
                  copyDebugJson={
                    user?.isSuperAdmin ? copyDebugJson(post) : undefined
                  }
                  post={post}
                  integrations={integrations}
                  deletePost={deletePost(post)}
                  showTime={true}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export const Calendar = () => {
  const { display } = useCalendar();
  return (
    <>
      {display === 'list' ? (
        <ListView />
      ) : display === 'day' ? (
        <DayView />
      ) : display === 'week' ? (
        <WeekView />
      ) : (
        <MonthView />
      )}
    </>
  );
};
export const CalendarColumn: FC<{
  getDate: dayjs.Dayjs;
  randomHour?: boolean;
}> = memo((props) => {
  const t = useT();

  const { getDate, randomHour } = props;
  const user = useUser();
  const {
    integrations,
    posts,
    now,
    changeDate,
    display,
    reloadCalendarView,
    sets,
    signature,
    loading,
  } = useCalendar();
  const modal = useModals();
  const fetch = useFetch();

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();
  const postList = useMemo(() => {
    return posts.filter((post) => {
      const pList = dayjs.utc(post.publishDate).local();
      const check =
        display === 'day'
          ? pList.format('YYYY-MM-DD HH:mm') ===
            getDate.format('YYYY-MM-DD HH:mm')
          : display === 'week'
          ? pList.isSameOrAfter(getDate.startOf('hour')) &&
            pList.isBefore(getDate.endOf('hour'))
          : pList.format('DD/MM/YYYY') === getDate.format('DD/MM/YYYY');
      return check;
    });
  }, [posts, display, getDate]);
  const [showAll, setShowAll] = useState(false);
  const showAllFunc = useCallback(() => {
    setShowAll(true);
  }, []);
  const showLessFunc = useCallback(() => {
    setShowAll(false);
  }, []);
  const list = useMemo(() => {
    if (showAll) {
      return postList;
    }
    return postList.slice(0, 3);
  }, [postList, showAll]);

  const isBeforeNow = useMemo(() => {
    const originalUtc = getDate.startOf('hour');
    return originalUtc.startOf('hour').isBefore(now.startOf('hour').utc());
  }, [getDate, now]);
  const [{ canDrop }, drop] = useDrop(
    () => ({
      accept: 'post',
      drop: async (item: any) => {
        if (isBeforeNow) return;

        // Find the post to check its state
        const post = posts.find((p) => p.id === item.id);
        let action: 'schedule' | 'update' = 'schedule';

        // Check if post is already published or queued in the past
        if (
          post &&
          (post.state === 'PUBLISHED' ||
            (post.state === 'QUEUE' &&
              dayjs().isAfter(dayjs.utc(post.publishDate))))
        ) {
          const whatToDo = await new Promise<'schedule' | 'update' | 'cancel'>(
            (resolve) => {
              modal.openModal({
                title: t('what_do_you_want_to_do', 'What do you want to do?'),
                children: (
                  <div className="flex flex-col">
                    <div className="text-[20px] mb-[20px]">
                      {t(
                        'post_already_published_drag',
                        'This post was already published, what do you want to do?'
                      )}
                    </div>
                    <div className="flex w-full gap-[10px]">
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('update');
                          }}
                        >
                          {t(
                            'just_update_post_details',
                            'Just update the post details'
                          )}
                        </Button>
                      </div>
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('schedule');
                          }}
                        >
                          {t('reschedule_post', 'Reschedule the post')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ),
                onClose: () => resolve('cancel'),
              });
            }
          );

          if (whatToDo === 'cancel') {
            return;
          }
          action = whatToDo;
        }

        if (!item.interval) {
          changeDate(item.id, getDate);
        }
        const { status } = await fetch(`/posts/${item.id}/date`, {
          method: 'PUT',
          body: JSON.stringify({
            date: getDate.utc().format('YYYY-MM-DDTHH:mm:ss'),
            action,
          }),
        });
        if (status !== 500) {
          if (item.interval || action === 'schedule') {
            reloadCalendarView();
            return;
          }
          return;
        }
      },
      collect: (monitor) => ({
        canDrop: isBeforeNow
          ? false
          : !!monitor.canDrop() && !!monitor.isOver(),
      }),
    }),
    [posts]
  );

  const addModal = useCallback(async () => {
    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            askClose: false,
            closeOnEscape: true,
            withCloseButton: true,
            onClose: () => resolve('exit'),
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: {
        modal: 'w-[100%] max-w-[1400px] text-textColor',
      },
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          integrations={integrations.slice(0).map((p) => ({
            ...p,
          }))}
          mutate={reloadCalendarView}
          {...(signature?.id && !set
            ? {
                onlyValues: [
                  {
                    content: '\n' + signature.content,
                  },
                ],
              }
            : {})}
          date={
            randomHour
              ? getDate.hour(Math.floor(Math.random() * 24))
              : getDate.format('YYYY-MM-DDTHH:mm:ss') ===
                newDayjs().startOf('hour').format('YYYY-MM-DDTHH:mm:ss')
              ? newDayjs().add(10, 'minute')
              : getDate
          }
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={() => ({})}
        />
      ),
      size: '80%',
    });
  }, [integrations, getDate, sets, signature]);

  const addProvider = useAddProvider();
  return (
    <div
      className={clsx(
        'flex flex-col w-full min-h-full relative',
        display === 'month' &&
          'min-h-[260px] rounded-[8px] bg-newBgColorInner/60',
        isBeforeNow && 'repeated-strip',
        loading && 'animate-pulse',
        isBeforeNow
          ? 'cursor-not-allowed'
          : 'border border-newTextColor/5 rounded-[8px]'
      )}
      ref={drop as any}
    >
      {display === 'month' && (
        <div
          className={clsx(
            'flex min-h-[34px] items-center justify-between px-[9px] pt-[5px] text-[12px] font-[600]',
            getDate.isSame(newDayjs(), 'day') && 'text-newTableTextFocused'
          )}
        >
          <span>{getDate.date()}</span>
          {getDate.isSame(newDayjs(), 'day') && (
            <span className="h-[6px] w-[6px] rounded-full bg-newTableTextFocused" />
          )}
        </div>
      )}
      <div
        className={clsx(
          'relative flex flex-col flex-1 text-white rounded-[8px] min-h-[70px]',
          canDrop && 'border border-[#612BD3]'
        )}
      >
        <div
          className={clsx(
            'flex-col text-[12px] pointer w-full flex scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary',
            isBeforeNow ? 'flex-1' : 'cursor-pointer',
            isBeforeNow && postList.length === 0 && 'col-calendar'
          )}
        >
          {loading && (
            <div className="h-full w-full p-[5px] animate-pulse absolute left-0 top-0 z-[50]">
              <div className="h-full w-full bg-newSettings rounded-[10px]" />
            </div>
          )}
          {list.map((post) => (
            <div
              key={post.id}
              className={clsx(
                'text-textColor p-[3px] relative flex flex-col justify-center items-center'
              )}
            >
              <div className="relative w-full flex flex-col items-center p-[2.5px]">
                <CalendarItem
                  isBeforeNow={isBeforeNow}
                  date={getDate}
                  state={post.state}
                  statistics={openStatistics(post.id)}
                  missingRelease={openMissingRelease(post.id)}
                  editPost={editPost(post, false)}
                  duplicatePost={editPost(post, true)}
                  copyDebugJson={
                    user?.isSuperAdmin ? copyDebugJson(post) : undefined
                  }
                  post={post}
                  integrations={integrations}
                  deletePost={deletePost(post)}
                />
              </div>
            </div>
          ))}
          {!showAll && postList.length > 3 && (
            <div
              className="text-center hover:underline py-[6px] text-[11px] text-textColor"
              onClick={showAllFunc}
            >
              {t('show_more', '+ Show more')} ({postList.length - 3})
            </div>
          )}
          {showAll && postList.length > 3 && (
            <div
              className="text-center hover:underline py-[6px] text-[11px]"
              onClick={showLessFunc}
            >
              {t('show_less', '- Show less')}
            </div>
          )}
        </div>
        {!isBeforeNow && (
          <div
            className="pb-[2.5px] px-[5px] flex-1 flex"
            onClick={integrations.length ? addModal : addProvider}
          >
            <div
              className={clsx(
                display === ('month' as any)
                  ? 'flex-1 min-h-[40px] w-full'
                  : !postList.length
                  ? 'min-h-full w-full p-[5px]'
                  : 'min-h-[40px] w-full',
                'flex items-center justify-center cursor-pointer pb-[2.5px]'
              )}
            >
              {display !== 'day' && (
                <div
                  className={clsx(
                    'group hover:before:h-[30px] w-full h-full rounded-[10px] flex justify-center items-center text-white'
                  )}
                >
                  <div
                    className={`group-hover:before:content-["+"] pb-[5px] flex justify-center items-center rounded-[8px] transition-all group-hover:bg-btnPrimary w-full h-full max-w-[40px] max-h-[40px]`}
                  />
                </div>
              )}
              {display === 'day' && (
                <div
                  className={`w-full h-full rounded-[10px] py-[10px] flex-wrap hover:border hover:border-seventh flex justify-center items-center gap-[20px] opacity-30 grayscale hover:grayscale-0 hover:opacity-100`}
                >
                  {integrations.map((selectedIntegrations) => (
                    <div
                      className="relative"
                      key={selectedIntegrations.identifier}
                    >
                      <div
                        className={clsx(
                          'relative w-[34px] h-[34px] rounded-[8px] flex justify-center items-center filter transition-all duration-500'
                        )}
                      >
                        <SafeImage
                          src={
                            selectedIntegrations.picture || '/no-picture.jpg'
                          }
                          className="rounded-[8px]"
                          alt={selectedIntegrations.identifier}
                          width={32}
                          height={32}
                        />
                        {selectedIntegrations.identifier === 'youtube' ? (
                          <img
                            src="/icons/platforms/youtube.svg"
                            className="absolute z-10 -bottom-[5px] -end-[5px]"
                            width={20}
                          />
                        ) : (
                          <SafeImage
                            src={`/icons/platforms/${selectedIntegrations.identifier}.png`}
                            className="rounded-[8px] absolute z-10 -bottom-[5px] -end-[5px] border border-fifth"
                            alt={selectedIntegrations.identifier}
                            width={20}
                            height={20}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
const CalendarItem: FC<{
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  statistics: () => void;
  missingRelease?: () => void;
  integrations: Integrations[];
  state: State;
  showTime?: boolean;
  compact?: boolean;
  post: Post & {
    integration: Integration;
    tags: {
      tag: Tags;
    }[];
  };
}> = memo((props) => {
  const t = useT();
  const {
    editPost,
    statistics,
    duplicatePost,
    copyDebugJson,
    post,
    date,
    isBeforeNow,
    state,
    deletePost,
    showTime,
    missingRelease,
    compact = false,
  } = props;
  const { disableXAnalytics } = useVariables();
  const mediaDirectory = useMediaDirectory();
  const [contentExpanded, setContentExpanded] = useState(false);
  const [contentOverflows, setContentOverflows] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const user = useUser();
  const showCreationMethodBadge =
    user?.impersonate &&
    post.creationMethod &&
    post.creationMethod !== 'UNKNOWN';
  const preview = useCallback(() => {
    window.open(`/p/` + post.id + '?share=true', '_blank');
  }, [post]);
  const content = useMemo(
    () =>
      stripHtmlValidation('none', post.content, false, true, false) ||
      t('no_content', 'no content'),
    [post.content, t]
  );
  const firstMedia = useMemo(() => {
    try {
      const media = Array.isArray(post.image)
        ? post.image
        : JSON.parse(post.image || '[]');
      return media?.[0]?.path ? media[0] : undefined;
    } catch {
      return undefined;
    }
  }, [post.image]);
  useEffect(() => {
    setContentExpanded(false);
  }, [content]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || contentExpanded) {
      return;
    }

    const measureOverflow = () => {
      setContentOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measureOverflow();

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, content, contentExpanded]);

  const canExpandContent = contentOverflows || contentExpanded;
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: 'post',
      item: {
        id: post.id,
        interval: !!post.intervalInDays,
        date,
      },
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : 1,
      }),
    }),
    []
  );
  return (
    <div
      className={clsx(
        'w-full flex h-full flex-1 flex-col group',
        'relative',
        actionsOpen && 'z-[110]',
        state === 'ERROR' && 'rounded-[10px] ring-2 ring-red-500'
      )}
      style={{
        opacity,
      }}
    >
      {state === 'ERROR' && (
        <div
          className="absolute -top-[6px] -left-[6px] z-20 w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={
            post.error || 'An error occurred while publishing this post'
          }
        >
          !
        </div>
      )}
      {showCreationMethodBadge && (
        <div className="absolute -bottom-[4px] -right-[4px] z-10">
          <CreationMethodBadge
            creationMethod={post.creationMethod}
            ringColor="var(--new-bgColor)"
          />
        </div>
      )}
      <div
        className={clsx(
          'relative min-h-[34px] w-full rounded-t-[10px] border border-b-0 border-newTextColor/5',
          'flex items-center gap-[6px] bg-newSettings/75 px-[7px] text-[10px] text-textColor/70'
        )}
      >
        <SafeImage
          src={`/icons/platforms/${post.integration?.providerIdentifier}.png`}
          className="h-[18px] w-[18px] shrink-0 rounded-[5px] object-cover"
          alt={post.integration?.providerIdentifier || 'Platform'}
          width={18}
          height={18}
        />
        <SafeImage
          src={post.integration.picture || '/no-picture.jpg'}
          className="h-[18px] w-[18px] shrink-0 rounded-[5px] object-cover"
          alt={post.integration.name || 'Account'}
          width={18}
          height={18}
        />
        {post?.tags?.[0]?.tag?.color && (
          <span
            className="h-[6px] w-[6px] shrink-0 rounded-full"
            style={{ backgroundColor: post.tags[0].tag.color }}
          />
        )}
        <div className="min-w-0 flex-1 truncate">
          {post.tags.map((p) => p.tag.name).join(', ') ||
            post.integration.name ||
            t('untagged_post', 'Post')}
        </div>
        <CalendarItemActions
          copyDebugJson={copyDebugJson}
          duplicatePost={duplicatePost}
          preview={preview}
          statistics={
            (post.integration.providerIdentifier === 'x' &&
              disableXAnalytics) ||
            !post.releaseId
              ? undefined
              : post.releaseId === 'missing'
              ? missingRelease
              : statistics
          }
          deletePost={deletePost}
          onOpenChange={setActionsOpen}
        />
      </div>
      <div
        onClick={editPost}
        className={clsx(
          'relative flex w-full flex-1 rounded-b-[10px] border border-t-0 border-newTextColor/5',
          compact ? 'min-h-[72px]' : 'min-h-[118px]',
          'bg-newColColor p-[7px] text-[11px]',
          isBeforeNow && '!grayscale'
        )}
      >
        <div className="w-full min-w-0 flex-1 flex flex-col gap-[5px]">
          <div
            // @ts-ignore
            ref={dragRef}
            className="flex min-w-0 flex-col gap-[5px]"
          >
            <div className="flex items-center justify-between gap-[6px] text-start text-[10px] text-textColor/55">
              <span>
                {state === 'DRAFT'
                  ? t('draft', 'Draft')
                  : newDayjs(post.publishDate)
                      .local()
                      .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
              </span>
            </div>
            {!compact && firstMedia?.path && (
              <div className="h-[82px] w-full overflow-hidden rounded-[7px] border border-newTextColor/5 bg-newSettings">
                <VideoOrImage
                  src={mediaDirectory.set(firstMedia.path)}
                  autoplay={false}
                  imageClassName="object-cover"
                  videoClassName="object-cover"
                />
              </div>
            )}
            <div
              ref={contentRef}
              className={clsx(
                'w-full break-words text-start leading-[1.45]',
                !contentExpanded &&
                  (compact ? 'line-clamp-2' : 'line-clamp-4')
              )}
            >
              {content}
            </div>
          </div>
          {canExpandContent && (
            <button
              type="button"
              className="self-start text-[10px] font-[600] text-btnPrimary hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                setContentExpanded((expanded) => !expanded);
              }}
            >
              {contentExpanded
                ? t('show_less', 'Show less')
                : t('show_more', 'Show more')}
            </button>
          )}
        </div>
        {showTime && (
          <div className="text-textColor/50 text-[12px] whitespace-nowrap flex items-center">
            {newDayjs(post.publishDate)
              .local()
              .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
          </div>
        )}
      </div>
    </div>
  );
});

const CalendarItemActions: FC<{
  copyDebugJson?: () => void;
  duplicatePost: () => void;
  preview: () => void;
  statistics?: () => void;
  deletePost: () => void;
  onOpenChange: (open: boolean) => void;
}> = ({
  copyDebugJson,
  duplicatePost,
  preview,
  statistics,
  deletePost,
  onOpenChange,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);
  const ref = useClickOutside(closeMenu);
  const runAction = useCallback(
    (action: () => void) => (event: React.MouseEvent) => {
      event.stopPropagation();
      closeMenu();
      action();
    },
    [closeMenu]
  );

  return (
    <div
      ref={ref}
      className="relative ms-auto shrink-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          closeMenu();
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('post_actions', 'Post actions')}
        aria-expanded={open}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const next = !open;
          setOpen(next);
          onOpenChange(next);
        }}
        className={clsx(
          'flex h-[24px] w-[24px] items-center justify-center rounded-[6px]',
          'text-textColor/55 transition-colors hover:bg-newColColor hover:text-textColor'
        )}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          role="group"
          aria-label={t('post_actions', 'Post actions')}
          className={clsx(
            'absolute end-0 top-[calc(100%+4px)] z-[100] min-w-[152px] overflow-hidden',
            'rounded-[8px] border border-newTextColor/10 bg-newSettings p-[4px] text-[11px]',
            'text-textColor shadow-[0_12px_32px_rgba(0,0,0,0.22)]'
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {copyDebugJson && (
            <CalendarAction
              icon={<CopyDebug />}
              label={t('copy_debug_json', 'Copy Debug JSON')}
              onClick={runAction(copyDebugJson)}
            />
          )}
          <CalendarAction
            icon={<Duplicate />}
            label={t('duplicate_post', 'Duplicate Post')}
            onClick={runAction(duplicatePost)}
          />
          <CalendarAction
            icon={<Preview />}
            label={t('preview_post', 'Preview Post')}
            onClick={runAction(preview)}
          />
          {statistics && (
            <CalendarAction
              icon={<Statistics />}
              label={t('post_statistics', 'Post Statistics')}
              onClick={runAction(statistics)}
            />
          )}
          <div className="my-[3px] h-px bg-newTextColor/10" />
          <CalendarAction
            destructive
            icon={<DeletePost />}
            label={t('delete_post', 'Delete Post')}
            onClick={runAction(deletePost)}
          />
        </div>
      )}
    </div>
  );
};

const CalendarAction: FC<{
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ icon, label, destructive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex w-full items-center gap-[9px] rounded-[6px] px-[8px] py-[7px] text-start',
      destructive
        ? 'text-red-400 hover:bg-red-500/10'
        : 'text-textColor/80 hover:bg-newColColor hover:text-textColor'
    )}
  >
    <span className="flex h-[15px] w-[15px] items-center justify-center">
      {icon}
    </span>
    <span>{label}</span>
  </button>
);

const MoreIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
  </svg>
);

const DebugJsonModal: FC<{ post: any }> = ({ post }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { closeCurrent } = useModals();

  const copyPostId = useCallback(() => {
    copy(post.id);
    toaster.show(t('post_id_copied', 'Post ID copied to clipboard'), 'success');
    closeCurrent();
  }, [post, toaster, t, closeCurrent]);

  const copyJson = useCallback(async () => {
    try {
      const data = await (
        await fetch(`/posts/group/${post.group}/debug-export`)
      ).json();
      copy(JSON.stringify(data, null, 2));
      toaster.show(
        t('debug_json_copied', 'Debug JSON copied to clipboard'),
        'success'
      );
      closeCurrent();
    } catch {
      toaster.show(
        t('debug_json_copy_failed', 'Failed to copy debug data'),
        'warning'
      );
    }
  }, [fetch, post, toaster, t, closeCurrent]);

  return (
    <div className="flex flex-col gap-[16px] p-[16px]">
      <div className="text-textColor text-[14px]">
        {t('debug_choose_copy', 'Choose what you want to copy')}
      </div>
      <div className="flex gap-[10px]">
        <Button onClick={copyPostId}>
          {t('copy_post_id', 'Copy post id')}
        </Button>
        <Button secondary onClick={copyJson}>
          {t('copy_debug_json', 'Copy Debug JSON')}
        </Button>
      </div>
    </div>
  );
};
const CopyDebug = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('copy_debug_json', 'Copy Debug JSON')}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
};
const Duplicate = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('duplicate_post', 'Duplicate Post')}
    >
      <path
        d="M27 5H9C8.46957 5 7.96086 5.21071 7.58579 5.58579C7.21071 5.96086 7 6.46957 7 7V9H5C4.46957 9 3.96086 9.21071 3.58579 9.58579C3.21071 9.96086 3 10.4696 3 11V25C3 25.5304 3.21071 26.0391 3.58579 26.4142C3.96086 26.7893 4.46957 27 5 27H23C23.5304 27 24.0391 26.7893 24.4142 26.4142C24.7893 26.0391 25 25.5304 25 25V23H27C27.5304 23 28.0391 22.7893 28.4142 22.4142C28.7893 22.0391 29 21.5304 29 21V7C29 6.46957 28.7893 5.96086 28.4142 5.58579C28.0391 5.21071 27.5304 5 27 5ZM23 11V13H5V11H23ZM23 25H5V15H23V25ZM27 21H25V11C25 10.4696 24.7893 9.96086 24.4142 9.58579C24.0391 9.21071 23.5304 9 23 9H9V7H27V21Z"
        fill="currentColor"
      />
    </svg>
  );
};
const Preview = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('preview_post', 'Preview Post')}
    >
      <path
        d="M30.9137 15.595C30.87 15.4963 29.8112 13.1475 27.4575 10.7937C24.3212 7.6575 20.36 6 16 6C11.64 6 7.67874 7.6575 4.54249 10.7937C2.18874 13.1475 1.12499 15.5 1.08624 15.595C1.02938 15.7229 1 15.8613 1 16.0012C1 16.1412 1.02938 16.2796 1.08624 16.4075C1.12999 16.5062 2.18874 18.8538 4.54249 21.2075C7.67874 24.3425 11.64 26 16 26C20.36 26 24.3212 24.3425 27.4575 21.2075C29.8112 18.8538 30.87 16.5062 30.9137 16.4075C30.9706 16.2796 31 16.1412 31 16.0012C31 15.8613 30.9706 15.7229 30.9137 15.595ZM16 24C12.1525 24 8.79124 22.6012 6.00874 19.8438C4.86704 18.7084 3.89572 17.4137 3.12499 16C3.89551 14.5862 4.86686 13.2915 6.00874 12.1562C8.79124 9.39875 12.1525 8 16 8C19.8475 8 23.2087 9.39875 25.9912 12.1562C27.1352 13.2912 28.1086 14.5859 28.8812 16C27.98 17.6825 24.0537 24 16 24ZM16 10C14.8133 10 13.6533 10.3519 12.6666 11.0112C11.6799 11.6705 10.9108 12.6075 10.4567 13.7039C10.0026 14.8003 9.88377 16.0067 10.1153 17.1705C10.3468 18.3344 10.9182 19.4035 11.7573 20.2426C12.5965 21.0818 13.6656 21.6532 14.8294 21.8847C15.9933 22.1162 17.1997 21.9974 18.2961 21.5433C19.3924 21.0892 20.3295 20.3201 20.9888 19.3334C21.6481 18.3467 22 17.1867 22 16C21.9983 14.4092 21.3657 12.884 20.2408 11.7592C19.1159 10.6343 17.5908 10.0017 16 10ZM16 20C15.2089 20 14.4355 19.7654 13.7777 19.3259C13.1199 18.8864 12.6072 18.2616 12.3045 17.5307C12.0017 16.7998 11.9225 15.9956 12.0768 15.2196C12.2312 14.4437 12.6122 13.731 13.1716 13.1716C13.731 12.6122 14.4437 12.2312 15.2196 12.0769C15.9956 11.9225 16.7998 12.0017 17.5307 12.3045C18.2616 12.6072 18.8863 13.1199 19.3259 13.7777C19.7654 14.4355 20 15.2089 20 16C20 17.0609 19.5786 18.0783 18.8284 18.8284C18.0783 19.5786 17.0609 20 16 20Z"
        fill="currentColor"
      />
    </svg>
  );
};
export const Statistics = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('post_statistics', 'Post Statistics')}
    >
      <path
        d="M28 25H27V5C27 4.73478 26.8946 4.48043 26.7071 4.29289C26.5196 4.10536 26.2652 4 26 4H19C18.7348 4 18.4804 4.10536 18.2929 4.29289C18.1054 4.48043 18 4.73478 18 5V10H12C11.7348 10 11.4804 10.1054 11.2929 10.2929C11.1054 10.4804 11 10.7348 11 11V16H6C5.73478 16 5.48043 16.1054 5.29289 16.2929C5.10536 16.4804 5 16.7348 5 17V25H4C3.73478 25 3.48043 25.1054 3.29289 25.2929C3.10536 25.4804 3 25.7348 3 26C3 26.2652 3.10536 26.5196 3.29289 26.7071C3.48043 26.8946 3.73478 27 4 27H28C28.2652 27 28.5196 26.8946 28.7071 26.7071C28.8946 26.5196 29 26.2652 29 26C29 25.7348 28.8946 25.4804 28.7071 25.2929C28.5196 25.1054 28.2652 25 28 25ZM20 6H25V25H20V6ZM13 12H18V25H13V12ZM7 18H11V25H7V18Z"
        fill="currentColor"
      />
    </svg>
  );
};

export const DeletePost = () => {
  const t = useT();
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('delete_post', 'Delete Post')}
    >
      <path
        d="M15 10V18H9V10H15ZM14 4H9.9L8.9 5H6V7H18V5H15L14 4ZM17 8H7V18C7 19.1 7.9 20 9 20H15C16.1 20 17 19.1 17 18V8Z"
        fill="currentColor"
      />
    </svg>
  );
};

export const SetSelectionModal: FC<{
  sets: any[];
  onSelect: (set: any) => void;
  onContinueWithoutSet: () => void;
}> = ({ sets, onSelect, onContinueWithoutSet }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      <div className="text-lg font-medium">
        {t('choose_set_or_continue', 'Choose a set or continue without one')}
      </div>

      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
        {sets.map((set) => (
          <div
            key={set.id}
            onClick={() => onSelect(set)}
            className="p-3 border border-tableBorder rounded-lg cursor-pointer hover:transition-colors"
          >
            <div className="font-medium">{set.name}</div>
            {set.description && (
              <div className="text-sm text-gray-400 mt-1">
                {set.description}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t border-tableBorder">
        <button
          onClick={onContinueWithoutSet}
          className="flex-1 px-4 py-2 text-textColor rounded-lg hover:transition-colors"
        >
          {t('continue_without_set', 'Continue without set')}
        </button>
      </div>
    </div>
  );
};
