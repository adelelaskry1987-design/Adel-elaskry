import React from 'react';

export interface PageTitleProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Unified AH2 Page Title Component
 * 
 * Complies with strict project requirements:
 * 1. Large, clear, bold, black font (text-lg sm:text-2xl font-black text-black).
 * 2. Thin horizontal black lines on the right and left, with title centered between them.
 * 3. Transparent background matching the page background naturally (no card, box, or strip).
 * 4. Zero text, description, subtitle, or info below the title.
 * 5. Responsive, symmetrical, and consistent across mobile, tablet, and desktop.
 * 6. Strictly the FIRST visible element in the page content area.
 *    Any action buttons (such as Share) appear cleanly below the title line, never above.
 */
export const PageTitle: React.FC<PageTitleProps> = ({ title, action, className = '' }) => {
  return (
    <div className={`w-full mb-3 sm:mb-4 select-none ${className}`}>
      {/* 1. Centered Title flanked by thin horizontal black lines - STRICTLY FIRST */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 w-full">
        {/* Right line (in RTL: start line) */}
        <div className="flex-1 min-w-[12px] h-px bg-black" />

        {/* Title Text: Black, Bold, Large, Centered */}
        <h1 className="text-lg sm:text-2xl font-black text-black text-center whitespace-nowrap px-1 shrink-0 tracking-normal">
          {title}
        </h1>

        {/* Left line (in RTL: end line) */}
        <div className="flex-1 min-w-[12px] h-px bg-black" />
      </div>

      {/* 2. Optional action buttons (like Share) placed cleanly BELOW the title line, never above */}
      {action && (
        <div className="flex items-center justify-end mt-2.5 gap-2">
          {action}
        </div>
      )}
    </div>
  );
};

export default PageTitle;
