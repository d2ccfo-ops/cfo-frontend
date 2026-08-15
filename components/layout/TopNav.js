// Mirrors ai-cfo-design's PageHeader (src/components/console.tsx): a plain
// inline header inside the page's content column — deliberately no border,
// background or full-bleed bar of its own.
export default function TopNav({ title = "Overview", subtitle = "", actions = null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-7">
      <div>
        <h1 className="text-[26px] font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
