import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded border font-medium leading-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const sizes: Record<"md" | "sm", string> = {
  md: "min-h-[38px] px-3.5 py-2 text-sm",
  sm: "min-h-[30px] px-2 py-1 text-xs",
};

const variants: Record<Variant, string> = {
  primary: "bg-teal border-teal text-white hover:bg-teal-deep hover:border-teal-deep",
  ghost: "bg-paper-raised border-rule-strong text-black hover:border-ink-soft",
  danger: "bg-paper-raised border-[#e0c4c4] text-cinnabar hover:bg-[#f6ecec] hover:border-cinnabar",
  quiet: "bg-transparent border-transparent text-black hover:bg-teal-faint",
};

export function Button({ variant = "ghost", size = "md", className = "", ...rest }: ButtonProps) {
  return <button type="button" className={`${base} ${sizes[size]} ${variants[variant]} ${className}`.trim()} {...rest} />;
}
