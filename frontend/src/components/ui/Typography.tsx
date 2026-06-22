import type { HTMLAttributes } from "react";

const join = (base: string, className?: string) => (className ? `${base} ${className}` : base);

export function PageTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={join("m-0 font-serif font-semibold text-[1.85rem] leading-[1.1] tracking-[0.01em]", className)} {...rest} />;
}

export function SectionTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={join("mt-0 mb-2 font-serif font-semibold text-[1.15rem]", className)} {...rest} />;
}

export function Eyebrow({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("m-0 mb-1 text-[0.72rem] font-semibold tracking-[0.14em] uppercase text-ink-soft", className)} {...rest} />;
}

export function Muted({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("text-ink-soft", className)} {...rest} />;
}

export function Text({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("my-1.5", className)} {...rest} />;
}
