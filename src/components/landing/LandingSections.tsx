import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Wallet, ShieldCheck, Search, FileStack, Highlighter, MessageSquareText, Scale, FileCheck2, Lock, UserCheck, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";

const rub = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";
const num = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));

function Field({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular">{num(value)} {suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-primary" />
    </label>
  );
}

function SavingsCalculator() {
  const [reports, setReports] = useState(40);
  const [hoursManual, setHoursManual] = useState(3);
  const [hoursWith, setHoursWith] = useState(1);
  const [rate, setRate] = useState(900);
  const savedHours = Math.max(0, hoursManual - hoursWith) * reports;
  const savedMonth = savedHours * rate;
  return (
    <section id="savings" className="border-b border-border py-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-primary">Для руководителя</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Сколько стоит ручная сверка в вашей компании</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">Ручная проверка — это часы сотрудников на поиск значений в актах, счетах и накладных. Укажите свои параметры: расчёт показывает время, которое высвобождается, если поиск источников и сопоставление берёт на себя Sverko, а за человеком остаётся решение.</p>
          <p className="mt-3 text-xs text-muted-foreground">Значения по умолчанию — пример для иллюстрации, а не результаты измерений. Подставьте данные своей команды.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-panel sm:p-6">
          <div className="space-y-5">
            <Field label="Отчётов на проверку в месяц" value={reports} min={5} max={300} step={5} suffix="шт." onChange={setReports} />
            <Field label="Часов на один отчёт вручную" value={hoursManual} min={0.5} max={16} step={0.5} suffix="ч" onChange={(v) => { setHoursManual(v); if (hoursWith > v) setHoursWith(v); }} />
            <Field label="Часов на отчёт с Sverko" value={hoursWith} min={0} max={hoursManual} step={0.25} suffix="ч" onChange={setHoursWith} />
            <Field label="Стоимость часа сотрудника" value={rate} min={300} max={5000} step={50} suffix="₽" onChange={setRate} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Часов в месяц</div><div className="mt-1 text-xl font-semibold tabular">{num(savedHours)}</div></div>
            <div><div className="text-xs text-muted-foreground">Экономия в месяц</div><div className="mt-1 text-xl font-semibold tabular text-success">{rub(savedMonth)}</div></div>
            <div><div className="text-xs text-muted-foreground">Экономия в год</div><div className="mt-1 text-xl font-semibold tabular text-success">{rub(savedMonth * 12)}</div></div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">≈ {(savedHours / 164).toFixed(1).replace(".", ",")} ставки сотрудника в месяц (164 рабочих часа).</p>
        </div>
      </div>
    </section>
  );
}

export function LandingSections() {
  const benefits = [
    { Icon: Clock, title: "Часы вместо дней", text: "Сотрудник не листает десятки страниц: каждое значение отчёта уже сопоставлено с местом в первичном документе." },
    { Icon: Wallet, title: "Меньше затрат на контроль", text: "Та же команда проверяет больше отчётов. Рост объёма не требует пропорционального найма." },
    { Icon: ShieldCheck, title: "Меньше пропущенных ошибок", text: "Проверяется каждая строка, а не выборка. Расхождения в суммах, количестве и реквизитах не теряются из-за усталости." },
    { Icon: Scale, title: "Решения, которые можно защитить", text: "У каждого замечания есть источник, страница и комментарий проверяющего — понятно, почему отчёт принят или возвращён." },
  ];
  const features = [
    { Icon: FileStack, title: "Сверка с несколькими документами", text: "Отчёт сопоставляется сразу с договором, актами, накладными, счетами и платёжками." },
    { Icon: Highlighter, title: "Подсветка в источнике", text: "Клик по строке открывает документ на нужной странице и выделяет найденное значение." },
    { Icon: Search, title: "Четыре понятных статуса", text: "Совпадает, расхождение, нет подтверждения, требует проверки. Отсутствие документа не выдаётся за ошибку." },
    { Icon: MessageSquareText, title: "Ручное рассмотрение", text: "Подтвердите или снимите замечание с причиной. Решение человека хранится отдельно от автоматического результата." },
    { Icon: FileCheck2, title: "Готовое заключение", text: "Деловой текст со списком замечаний и ссылками на документы — скопировать или сохранить в PDF." },
    { Icon: UserCheck, title: "Окончательное слово за человеком", text: "Система рекомендует, проверяющий решает. Расхождение с рекомендацией требует обоснования." },
  ];
  const compare = [
    ["Поиск значения в документах", "Вручную, по всем файлам", "Источник найден и подсвечен"],
    ["Охват проверки", "Часто выборочно", "Каждый показатель отчёта"],
    ["Фиксация замечаний", "Таблицы, почта, заметки", "Замечание, источник и комментарий вместе"],
    ["Подготовка заключения", "Пишется с нуля", "Формируется из результатов"],
    ["Прозрачность для руководителя", "Со слов исполнителя", "Каждый вывод с подтверждением"],
  ];
  const faq = [
    ["Заменяет ли Sverko бухгалтера?", "Нет. Sverko выполняет рутинный поиск и сопоставление, а принимать или возвращать отчёт решает сотрудник."],
    ["Какие форматы поддерживаются?", "Отчёт — PDF, XLSX, XLS, CSV, DOCX. Подтверждающие документы — те же форматы, по нескольку файлов в одной проверке."],
    ["Что если подтверждение не найдено?", "Показатель получает статус «Не найдено подтверждение». Система не утверждает, что значение неверно, — она сообщает, что документального основания нет."],
    ["Передаются ли документы сторонним сервисам?", "В текущей версии загруженные файлы не отправляются во внешние сервисы и не сохраняются в браузере. Анализ станет доступен после подключения серверной обработки."],
  ];
  return (
    <>
      <section className="border-b border-border py-12">
        <p className="text-sm font-medium text-primary">Зачем это бизнесу</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold sm:text-3xl">Проверка отчётности быстрее, дешевле и надёжнее</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ Icon, title, text }) => <div key={title}><div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></div><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
        </div>
      </section>
      <SavingsCalculator />
      <section className="border-b border-border py-12">
        <p className="text-sm font-medium text-primary">Возможности</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Всё для проверки в одном рабочем пространстве</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ Icon, title, text }) => <div key={title} className="bg-card p-5"><Icon className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
        </div>
      </section>
      <section className="border-b border-border py-12">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ручная сверка и Sverko</h2>
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium"></th><th className="px-4 py-3 font-medium">Вручную</th><th className="px-4 py-3 font-medium text-primary">С Sverko</th></tr></thead>
            <tbody>{compare.map(([a, b, c]) => <tr key={a} className="border-t border-border"><td className="px-4 py-3 font-medium">{a}</td><td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-2"><X className="size-4 shrink-0 text-danger" />{b}</span></td><td className="px-4 py-3"><span className="flex items-center gap-2"><Check className="size-4 shrink-0 text-success" />{c}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-8 border-b border-border py-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">Частые вопросы</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" />Выводы системы всегда опираются на документ. Решение — за человеком.</p>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {faq.map(([q, a]) => <details key={q} className="group px-5 py-4"><summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p></details>)}
        </div>
      </section>
      <section className="py-12 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Посмотрите сверку на примере</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Демо-проверка поставки оборудования: 12 показателей, 4 первичных документа, расхождения с подсветкой источников.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/audits/$id" params={{ id: DEMO_SESSION_ID }}>Открыть демо-проверку <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline" className="bg-card"><Link to="/new">Новая проверка</Link></Button>
        </div>
      </section>
    </>
  );
}
