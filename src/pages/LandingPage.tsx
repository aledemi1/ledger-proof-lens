import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ClipboardCheck,
  FileSearch,
  FileText,
  FileWarning,
  GitCompareArrows,
  LayoutList,
  ScanSearch,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    Icon: UploadCloud,
    title: "Загрузите документы",
    text: "Отчёт и подтверждающие документы: счета, накладные, акты, договоры. Поддерживаются PDF, DOCX, XLSX и сканы.",
  },
  {
    Icon: GitCompareArrows,
    title: "Система сопоставляет показатели",
    text: "Каждый показатель отчёта сверяется с первичными документами: суммы, количества, даты и реквизиты.",
  },
  {
    Icon: FileSearch,
    title: "Проверьте замечания",
    text: "Расхождения показаны в таблице, а рядом — документ с подсвеченным местом, откуда взято значение.",
  },
  {
    Icon: ClipboardCheck,
    title: "Получите заключение",
    text: "Sverko формирует обоснованное заключение: принять отчёт или вернуть на доработку с перечнем замечаний.",
  },
];

const outcomes = [
  {
    Icon: FileWarning,
    title: "Расхождения",
    text: "Значение в отчёте не совпадает с первичным документом — видно оба значения и источник.",
  },
  {
    Icon: FileText,
    title: "Неподтверждённые показатели",
    text: "Для показателя не нашлось подтверждающего документа в комплекте.",
  },
  {
    Icon: ScanSearch,
    title: "Ручная проверка",
    text: "Случаи, где система не уверена, помечаются для решения проверяющего — ничего не теряется.",
  },
];

export function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 lg:px-8">
      {/* Hero */}
      <section className="py-12 text-center lg:py-20">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-panel">
          <Sparkles className="size-3.5 text-primary" />
          Автоматизированная сверка отчётности
        </div>
        <h1 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[44px] lg:leading-tight">
          Проверяйте отчёты по первичным документам за минуты, а не дни
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground">
          Sverko сопоставляет показатели отчёта со счетами, накладными и актами, находит расхождения
          и готовит обоснованное заключение — со ссылками на источник каждого значения.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/new">
              Начать проверку <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/audits">
              <LayoutList /> Открыть демо-проверку
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Демо-проверка работает на синтетических данных — можно посмотреть весь процесс без загрузки файлов.
        </p>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-xl font-semibold tracking-tight">Как это работает</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-lg border border-border bg-card p-4 shadow-panel">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-md bg-primary-soft text-primary">
                  <s.Icon className="size-4" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Шаг {i + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What it finds */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-semibold tracking-tight">Что находит Sverko</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {outcomes.map((o) => (
            <div key={o.title} className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <o.Icon className="size-5 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{o.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{o.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="mt-14 rounded-xl border border-border bg-card p-6 shadow-panel lg:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Каждое замечание — с источником</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Проверяющий не верит системе на слово: клик по строке таблицы открывает документ
              и подсвечивает место, откуда взято значение. Решение по каждому замечанию остаётся
              за человеком — система лишь показывает факты и считает итог.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Подсветка значений прямо в документе",
                "Раздельно: результат системы и решение проверяющего",
                "Заключение с перечнем замечаний для печати и PDF",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-background p-4">
            <div className="rounded-md border border-border bg-card p-3 text-xs shadow-panel">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-medium">Количество оборудования</span>
                <span className="rounded bg-danger-soft px-1.5 py-0.5 font-medium text-danger">Расхождение</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded bg-muted px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">В отчёте</div>
                  <div className="mt-0.5 font-semibold tabular">50 шт.</div>
                </div>
                <div className="rounded bg-muted px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">По накладной</div>
                  <div className="mt-0.5 font-semibold tabular">47 шт.</div>
                </div>
              </div>
              <div className="mt-2 rounded border border-highlight-ring bg-highlight px-2 py-1.5 text-[11px] text-ink">
                Накладная № 114 от 12.03.2026 · «Дозатор лабораторный ДЛ-1000 — 47 шт.»
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-14 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Попробуйте на демонстрационных данных</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Откройте готовую проверку с замечаниями, посмотрите документы с подсветкой и сформируйте заключение.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/audits">
              Открыть демо-проверку <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/new">Загрузить свои документы</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
