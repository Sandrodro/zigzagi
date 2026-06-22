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
    <header className="masthead">
      <div>
        <p className="eyebrow">
          <span className="eyebrow__tick">§</span> {eyebrow}
        </p>
        <PageTitle>{title}</PageTitle>
      </div>
      {right && <div className="masthead__right">{right}</div>}
    </header>
  );
}
