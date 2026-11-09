import { ArrowDown, Calculator, EyeOff, Lock, ScanLine, ShieldCheck } from "lucide-react";
import { useCopy } from "@/i18n/messages";

/** Splits "text [value|LABEL] text" into plain parts and masked values. */
function parseSample(sample: string) {
  return sample.split(/(\[[^\]|]+\|[^\]]+\])/).filter(Boolean).map((part) => {
    const m = part.match(/^\[([^\]|]+)\|([^\]]+)\]$/);
    return m ? { value: m[1], label: m[2] } : { text: part };
  });
}

export function PrivacySection() {
  const t = useCopy().landing;
  const parts = parseSample(t.privacySample);
  const points = [
    { Icon: EyeOff, title: t.privacyP1, text: t.privacyP1t },
    { Icon: ScanLine, title: t.privacyP2, text: t.privacyP2t },
    { Icon: Calculator, title: t.privacyP3, text: t.privacyP3t },
    { Icon: Lock, title: t.privacyP4, text: t.privacyP4t },
  ];
  return (
    <section id="security" aria-labelledby="data-privacy" className="border-b border-border py-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" /> {t.privacyKicker}</p>
          <h2 id="data-privacy" className="mt-2 text-2xl font-semibold sm:text-3xl">{t.privacyTitle}</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{t.privacyLead}</p>
        </div>
        <figure className="rounded-lg border border-border bg-card p-4 shadow-panel sm:p-5">
          <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.privacyExample}</figcaption>
          <div className="mt-3 rounded-md border border-border bg-paper p-4 text-ink shadow-paper">
            <p className="text-xs font-medium text-muted-foreground">{t.privacyOriginal}</p>
            <p className="mt-2 font-doc text-[15px] leading-relaxed">
              {parts.map((p, i) => "text" in p ? <span key={i}>{p.text}</span> : <mark key={i} className="rounded-sm bg-highlight px-0.5 text-ink">{p.value}</mark>)}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground">
            <ArrowDown className="size-4 text-primary" />
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 font-mono">pii-mask · Presidio</span>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-medium text-primary">{t.privacyMasked}</p>
            <p className="mt-2 text-[15px] leading-loose">
              {parts.map((p, i) => "text" in p ? <span key={i}>{p.text}</span> : <code key={i} className="whitespace-nowrap rounded border border-primary/30 bg-card px-1.5 py-0.5 font-mono text-[13px] text-primary">{`{{${p.label}}}`}</code>)}
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.privacyNote}</p>
        </figure>
      </div>
      <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {points.map(({ Icon, title, text }) => (
          <div key={title} className="bg-card p-5">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></div>
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
