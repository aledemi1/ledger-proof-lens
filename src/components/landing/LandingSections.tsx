import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Wallet, ShieldCheck, Search, FileStack, Highlighter, MessageSquareText, Scale, FileCheck2, Lock, UserCheck, X, Check } from "lucide-react";
import { AccessRequest } from "@/components/audit/AccessRequest";
import { Button } from "@/components/ui/button";
import { LOCALE_INTL } from "@/i18n/locales";
import { fill } from "@/i18n/fill";
import { useCopy } from "@/i18n/messages";
import { useLocale } from "@/i18n/use-locale";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";
import { PrivacySection } from "@/components/landing/PrivacySection";

const SPEEDUP = 2;

function Field({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular">{value} {suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-primary" />
    </label>
  );
}

function SavingsCalculator() {
  const t = useCopy();
  const locale = useLocale();
  const number = new Intl.NumberFormat(LOCALE_INTL[locale], { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat(LOCALE_INTL[locale], { maximumFractionDigits: 0, style: "currency", currency: "RUB" });
  const [reports, setReports] = useState(40);
  const [hoursManual, setHoursManual] = useState(3);
  const [rate, setRate] = useState(900);
  const hoursWith = hoursManual / SPEEDUP;
  const savedHours = (hoursManual - hoursWith) * reports;
  const savedMonth = savedHours * rate;
  return (
    <section id="savings" className="border-b border-border py-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-primary">{t.landing.forLeaders}</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t.landing.savingsTitle}</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{t.landing.savingsLead}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.landing.savingsNote}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-panel sm:p-6">
          <div className="space-y-5">
            <Field label={t.landing.reports} value={reports} min={5} max={300} step={5} suffix={t.landing.pieces} onChange={setReports} />
            <Field label={t.landing.hoursManual} value={hoursManual} min={0.5} max={16} step={0.5} suffix={t.landing.hours} onChange={setHoursManual} />
            <div className="flex items-baseline justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm"><span className="text-muted-foreground">{t.landing.hoursWith}</span><span className="font-semibold tabular">{new Intl.NumberFormat(LOCALE_INTL[locale], { maximumFractionDigits: 2 }).format(hoursWith)} {t.landing.hours}</span></div>
            <Field label={t.landing.rate} value={rate} min={300} max={5000} step={50} suffix="₽" onChange={setRate} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">{t.landing.hoursMonth}</div><div className="mt-1 text-xl font-semibold tabular">{number.format(savedHours)}</div></div>
            <div><div className="text-xs text-muted-foreground">{t.landing.saveMonth}</div><div className="mt-1 text-xl font-semibold tabular text-success">{money.format(savedMonth)}</div></div>
            <div><div className="text-xs text-muted-foreground">{t.landing.saveYear}</div><div className="mt-1 text-xl font-semibold tabular text-success">{money.format(savedMonth * 12)}</div></div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{fill(t.landing.fte, { n: new Intl.NumberFormat(LOCALE_INTL[locale], { maximumFractionDigits: 1 }).format(savedHours / 164) })}</p>
        </div>
      </div>
    </section>
  );
}

export function LandingSections() {
  const t = useCopy().landing;
  const benefits = [
    { Icon: Clock, title: t.b1, text: t.b1t },
    { Icon: Wallet, title: t.b2, text: t.b2t },
    { Icon: ShieldCheck, title: t.b3, text: t.b3t },
    { Icon: Scale, title: t.b4, text: t.b4t },
  ];
  const features = [
    { Icon: FileStack, title: t.f1, text: t.f1t },
    { Icon: Highlighter, title: t.f2, text: t.f2t },
    { Icon: Search, title: t.f3, text: t.f3t },
    { Icon: MessageSquareText, title: t.f4, text: t.f4t },
    { Icon: FileCheck2, title: t.f5, text: t.f5t },
    { Icon: UserCheck, title: t.f6, text: t.f6t },
  ];
  const compare = [
    [t.c1, t.c1a, t.c1b],
    [t.c2, t.c2a, t.c2b],
    [t.c3, t.c3a, t.c3b],
    [t.c4, t.c4a, t.c4b],
    [t.c5, t.c5a, t.c5b],
  ];
  const faq = [
    [t.q1, t.a1],
    [t.q2, t.a2],
    [t.q3, t.a3],
    [t.q4, t.a4],
  ];
  return (
    <>
      <section className="border-b border-border py-12">
        <p className="text-sm font-medium text-primary">{t.why}</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold sm:text-3xl">{t.whyTitle}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ Icon, title, text }) => <div key={title}><div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></div><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
        </div>
      </section>
      <SavingsCalculator />
      <section className="border-b border-border py-12">
        <p className="text-sm font-medium text-primary">{t.features}</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t.featuresTitle}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ Icon, title, text }) => <div key={title} className="bg-card p-5"><Icon className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
        </div>
      </section>
      <section className="border-b border-border py-12">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t.compareTitle}</h2>
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium"></th><th className="px-4 py-3 font-medium">{t.manual}</th><th className="px-4 py-3 font-medium text-primary">{t.withSverko}</th></tr></thead>
            <tbody>{compare.map(([a, b, c]) => <tr key={a} className="border-t border-border"><td className="px-4 py-3 font-medium">{a}</td><td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-2"><X className="size-4 shrink-0 text-danger" />{b}</span></td><td className="px-4 py-3"><span className="flex items-center gap-2"><Check className="size-4 shrink-0 text-success" />{c}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <PrivacySection />
      <section className="grid gap-8 border-b border-border py-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">{t.faq}</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" />{t.faqNote}</p>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {faq.map(([q, a]) => <details key={q} className="group px-5 py-4"><summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p></details>)}
        </div>
      </section>
      <section className="py-12 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">{t.cta}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t.ctaText}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>{t.openDemo} <ArrowRight /></Link></Button>
          <AccessRequest><Button size="lg" variant="outline" className="bg-card">{t.newCheck}</Button></AccessRequest>
        </div>
      </section>
    </>
  );
}
