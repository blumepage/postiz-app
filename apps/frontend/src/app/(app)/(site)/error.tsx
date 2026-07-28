'use client';

import { useEffect } from 'react';

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center bg-newBgColorInner p-[24px]">
      <div className="flex max-w-[520px] flex-col items-center gap-[14px] rounded-[14px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
        <div className="text-[22px] font-semibold">
          This view could not be loaded
        </div>
        <div className="text-[14px] leading-[22px] text-textItemBlur">
          Something went wrong while loading this page. Your work is safe, and
          you can retry without leaving the app.
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-[8px] bg-primary px-[16px] py-[9px] text-[14px] font-medium text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
