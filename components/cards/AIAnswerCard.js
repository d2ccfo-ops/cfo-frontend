export default function AIAnswerCard({
  question = "You asked",
  answer = "",
  figures = [],
  drivers = [],
  warnings = [],
  actions = [],
  evidenceLinks = [],
  meta = "",
}) {
  return (
    <div className="gcard p-5">
      <div className="text-[13.5px] text-muted-foreground">{question}</div>
      <p className="mb-0 mt-1.5 text-[15px] leading-[1.6] text-foreground">{answer}</p>

      {figures.length > 0 ? (
        <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {figures.map((f, i) => (
            <div key={i} className="rounded-md bg-muted px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{f.label}</div>
              <div className="text-[19px] font-medium text-foreground">{f.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {drivers.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Main drivers</div>
          <ul className="mt-1.5 pl-[18px]">
            {drivers.map((d, i) => (
              <li key={i} className="mb-1 text-[13.5px] text-foreground">{d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Warnings</div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <div key={i} className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">{w}</div>
            ))}
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Recommended actions</div>
          <div className="mt-1.5 flex flex-col gap-2">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2.5 rounded-md bg-primary-soft px-3 py-2.5">
                <span className="text-[13px] text-primary">{a}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2.5 border-t border-border pt-3">
        <div className="flex gap-3.5">
          {evidenceLinks.map((label, i) => (
            <button key={i} className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-primary" type="button">
              {label} ↗
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted-foreground">{meta}</span>
      </div>
    </div>
  );
}
