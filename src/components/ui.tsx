import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "outline" | "ghost" }) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    accent: "bg-accent-strong text-accent-foreground hover:opacity-90",
    outline: "border border-border bg-card text-foreground hover:bg-muted",
    ghost: "text-muted-foreground hover:text-foreground",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-12 w-full min-w-0 rounded-md border border-input bg-card px-4 text-base text-foreground placeholder:text-muted-foreground/80",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={cx(
        "h-11 min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground sm:text-sm",
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Link that leaves the app. Opens in the browser so the installed app keeps its place. */
export function OutLink({ className, children, href, ...rest }: { href: string; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className} {...rest}>
      {children}
    </a>
  );
}

export { cx };
