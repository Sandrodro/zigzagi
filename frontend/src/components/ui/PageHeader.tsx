import type { ReactNode } from "react";

import { PageTitle } from "./Typography";

interface PageHeaderProps {
  title: ReactNode;
  /** Small-caps label above the title; defaults to the wordmark. */
  eyebrow?: ReactNode;
  /** Right-aligned slot (e.g. the timer). */
  right?: ReactNode;
}

export function PageHeader({ title, eyebrow = "ზიგზაგი", right }: PageHeaderProps) {
  return (
    <header className="relative mb-6 flex items-end justify-between gap-4 border-b border-ink pb-2.5 after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-rule after:content-['']">
      <div>
        <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          <span className="text-ochre">§</span> {eyebrow}
        </p>
        <PageTitle>{title}</PageTitle>
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}
