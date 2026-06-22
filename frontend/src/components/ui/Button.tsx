import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
}

export function Button({ variant = "ghost", size = "md", className = "", ...rest }: ButtonProps) {
  const cls = ["btn", `btn--${variant}`, size === "sm" && "btn--sm", className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest} />;
}
