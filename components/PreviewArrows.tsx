import { ChevronLeft, ChevronRight } from "lucide-react";

export function PreviewArrows({ previous, next, onPrevious, onNext, previousDisabled = false, nextDisabled = false }: {
  previous: string; next: string; onPrevious: () => void; onNext: () => void;
  previousDisabled?: boolean; nextDisabled?: boolean;
}) {
  return <>
    {[
      { label: previous, onClick: onPrevious, disabled: previousDisabled, position: "left-3", Icon: ChevronLeft },
      { label: next, onClick: onNext, disabled: nextDisabled, position: "right-3", Icon: ChevronRight },
    ].map(({ label, onClick, disabled, position, Icon }) => <button key={label} type="button" data-preview-arrow
      aria-label={label} disabled={disabled} onClick={onClick}
      className={`absolute top-1/2 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--page-bg)] text-[var(--page-text)] shadow-sm transition-opacity hover:bg-[var(--surface-bg)] disabled:cursor-default disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--accent))] ${position}`}>
      <Icon size={18} aria-hidden />
    </button>)}
  </>;
}
