import type { HTMLAttributes } from "react";

const join = (base: string, className?: string) => (className ? `${base} ${className}` : base);

export function PageTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={join("page-title", className)} {...rest} />;
}

export function SectionTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={join("section-title", className)} {...rest} />;
}

export function Eyebrow({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("eyebrow", className)} {...rest} />;
}

export function Muted({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("muted", className)} {...rest} />;
}

export function Text({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={join("text", className)} {...rest} />;
}
