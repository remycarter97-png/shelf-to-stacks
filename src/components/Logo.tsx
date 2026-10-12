export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-9 w-7 rounded-sm bg-primary shadow-sm" aria-hidden>
        <div className="absolute inset-x-1 top-1 h-0.5 bg-primary-foreground/60" />
        <div className="absolute inset-x-1 top-2.5 h-0.5 bg-primary-foreground/40" />
        <div className="absolute inset-x-1 top-4 h-0.5 bg-primary-foreground/30" />
      </div>
      <span className="font-display text-lg font-medium">Shelf to Stacks</span>
    </div>
  );
}
