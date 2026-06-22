import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const field = "w-full rounded border border-rule-strong bg-paper-raised px-2.5 py-2 text-[0.9rem] text-ink";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`.trim()} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${field} min-h-[5rem] resize-y ${className}`.trim()} {...rest} />;
}
