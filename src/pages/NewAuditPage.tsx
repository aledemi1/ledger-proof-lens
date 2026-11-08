import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, PlayCircle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { docTypeLabel, REPORT_EXTENSIONS, selectableDocTypes, SUPPORTING_EXTENSIONS } from "@/lib/documentTypes";
import { fileExt, formatSize, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AuditApiError } from "@/services/apiAuditService";
import { useAccount } from "@/hooks/useAccount";
import { auditService } from "@/services/auditService";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";
import type { AuditSession, DocumentType } from "@/types/audit";

interface Picked {
  key: string;
  file: File;
  type: DocumentType;
}

const steps = ["Отчёт", "Документы", "Состав"];

export function NewAuditPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [report, setReport] = useState<File | null>(null);
  const [supporting, setSupporting] = useState<Picked[]>([]);
  const [previousId, setPreviousId] = useState("");
  const [earlier, setEarlier] = useState<AuditSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<{ fileName: string; reason: string }[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    auditService.listSessions().then((sessions) => setEarlier(sessions.filter((session) => !session.isDemo))).catch(() => setEarlier([]));
  }, []);

  const canNext = [!!report, supporting.length > 0, title.trim().length > 0][step];

  const chooseReport = (file: File) => {
    setReport(file);
    if (!titleTouched) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const addSupporting = (files: File[]) => {
    const ok = files.filter((f) => SUPPORTING_EXTENSIONS.includes(fileExt(f.name)));
    const bad = files.length - ok.length;
    if (bad) toast.error(`${bad} ${plural(bad, "файл не добавлен", "файла не добавлено", "файлов не добавлено")}: неподдерживаемый формат`);
    setSupporting((prev) => [
      ...prev,
      ...ok
        .filter((f) => !prev.some((p) => p.file.name === f.name && p.file.size === f.size))
        .map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, type: "unknown" as DocumentType })),
    ]);
  };

  const create = async () => {
    if (!report) return;
    setBusy(true);
    setUploadErrors([]);
    try {
      const s = await auditService.createDraft({
        title: title.trim(),
        description: description.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
        ...(previousId ? { previousSessionId: previousId } : {}),
        report: { name: report.name, size: report.size, mimeType: report.type, type: "report", file: report },
        supporting: supporting.map((p) => ({ name: p.file.name, size: p.file.size, mimeType: p.file.type, type: p.type, file: p.file })),
      });
      toast.success("Проверка запущена");
      navigate({ to: "/audits/$id", params: { id: s.id } });
    } catch (reason) {
      const files = reason instanceof AuditApiError ? reason.files : [];
      setUploadErrors(files);
      toast.error(reason instanceof Error ? reason.message : "Не удалось запустить проверку");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Новая проверка</h1>
          <p className="mt-1 text-sm text-muted-foreground">Начните с отчёта. Название подставится из имени файла, его можно поправить перед запуском.</p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: "/audits/$id", params: { id: DEMO_SESSION_ID } })}>
          <PlayCircle /> Открыть демо-проверку
        </Button>
      </div>

      {account === null ? (
        <div className="mt-6 border-y border-border bg-card p-5 text-sm">
          <p>Загрузка документов доступна после входа. Демонстрационную проверку можно открыть без аккаунта.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild><Link to="/login">Войти</Link></Button>
            <Button asChild variant="outline"><Link to="/register">Создать аккаунт</Link></Button>
          </div>
        </div>
      ) : (
      <>
      {/* Stepper */}
      <ol className="mt-6 grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li key={s}>
            <Button variant="ghost" className="h-auto w-full flex-col items-stretch px-0 hover:bg-transparent"
              disabled={i > step}
              onClick={() => setStep(i)}
            >
              <div className={cn("h-1 rounded-full bg-muted", i <= step && "bg-primary")} />
              <div className={cn("mt-2 flex items-center gap-1.5 text-xs", i === step ? "font-semibold text-primary" : "text-muted-foreground")}>
                <span className={cn("grid size-4 place-items-center rounded-full border text-[10px]", i <= step ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {i < step ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span className="break-words">{s}</span>
              </div>
            </Button>
          </li>
        ))}
      </ol>

      <div className="mt-6 border-y border-border bg-card p-5 sm:p-6">
        {step === 0 && (
          <div>
            <h2 className="text-sm font-semibold">Основной отчёт</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Файлы и результаты сверки хранятся на сервере Sverko и привязаны к аккаунту. Содержимое файлов в браузер не записывается.
              Файлы удаляются вместе с проверкой; автоматического срока хранения нет. Учётные записи и карточки проверок лежат в базе данных.
              Если включена языковая модель, ей уходят незнакомые подписи с коротким образцом и короткие фрагменты неразобранных формулировок. Если основной OCR занят или не запускается, изображение скана уходит в запасное распознавание через тот же API.
              Суммы и статус сверки считает сервер. Демонстрационная проверка модель не вызывает и открывается без входа.
            </p>
            {report ? (
              <div className="mt-3"><FileRow file={report} onRemove={() => setReport(null)} /></div>
            ) : (
              <DropZone
                className="mt-3"
                accept={REPORT_EXTENSIONS}
                multiple={false}
                text="Перетащите отчёт сюда или выберите файл"
                onFiles={(fs) => {
                  const f = fs[0];
                  if (!f) return;
                  if (!REPORT_EXTENSIONS.includes(fileExt(f.name))) {
                    toast.error("Неподдерживаемый формат. Допустимы PDF, XLSX, XLS, CSV, DOCX");
                    return;
                  }
                  chooseReport(f);
                }}
              />
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-sm font-semibold">Подтверждающие документы</h2>
            <p className="mt-1 text-xs text-muted-foreground">Акты, счета, накладные, договоры, платёжные документы. Тип можно уточнить, но это необязательно.</p>
            <DropZone className="mt-3" accept={SUPPORTING_EXTENSIONS} multiple text="Перетащите документы сюда или выберите файлы" onFiles={addSupporting} compact={supporting.length > 0} />
            {supporting.length > 0 && (
              <div className="mt-3 divide-y divide-border rounded-md border border-border">
                {supporting.map((p) => (
                  <FileRow
                    key={p.key}
                    bare
                    file={p.file}
                    onRemove={() => setSupporting((prev) => prev.filter((x) => x.key !== p.key))}
                    extra={
                      <Select value={p.type} onValueChange={(v) => setSupporting((prev) => prev.map((x) => (x.key === p.key ? { ...x, type: v as DocumentType } : x)))}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectableDocTypes.map((t) => <SelectItem key={t} value={t}>{docTypeLabel[t]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {(step === 0 || step === 1) && (
          <p className="mt-4 text-sm text-muted-foreground">
            Файлы уйдут на сервер только после «Начать проверку». Демонстрационную проверку можно открыть без загрузки.
          </p>
        )}

        {step === 2 && report && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Название проверки</Label>
              <Input id="title" value={title} onChange={(event) => { setTitleTouched(true); setTitle(event.target.value); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></Label>
              <Textarea id="desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что проверяем и зачем" />
            </div>
            {earlier.length > 0 && (
              <div className="space-y-1.5">
                <Label>Повтор после исправлений</Label>
                <Select value={previousId || "none"} onValueChange={(value) => setPreviousId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Новая проверка" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Это новая проверка</SelectItem>
                    {earlier.map((session) => <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">После расчёта будет видно, какие замечания закрылись, какие остались и какие появились.</p>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Название</dt><dd className="font-medium">{title}</dd>
              <dt className="text-muted-foreground">Основной отчёт</dt><dd>{report.name}</dd>
              <dt className="text-muted-foreground">Подтверждающих документов</dt><dd>{supporting.length}</dd>
            </dl>
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {supporting.map((p) => (
                <div key={p.key} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                  <span className="text-xs text-muted-foreground">{docTypeLabel[p.type]}</span>
                </div>
              ))}
            </div>
            {uploadErrors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                {uploadErrors.map((item) => (
                  <p key={item.fileName}><span className="font-medium">{item.fileName}:</span> {item.reason}</p>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              После запуска сервер сохранит оригиналы и будет сверять комплект в фоне. Вкладку можно закрыть и открыть проверку позже из реестра.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        {step === 0 ? (
          <Button asChild variant="ghost"><Link to="/audits"><ArrowLeft /> К списку</Link></Button>
        ) : (
          <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft /> Назад</Button>
        )}
        {step < 2 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Далее <ArrowRight /></Button>
        ) : (
          <Button disabled={busy} onClick={create}><PlayCircle /> Начать проверку</Button>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function DropZone({ text, accept, multiple, onFiles, className, compact }: { text: string; accept: string[]; multiple: boolean; onFiles: (f: File[]) => void; className?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles(Array.from(e.dataTransfer.files));
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => ref.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input text-center transition-colors hover:border-primary/60 hover:bg-primary-soft/50",
        compact ? "py-5" : "py-12",
        over && "border-primary bg-primary-soft",
        className,
      )}
    >
      <Upload className="size-6 text-primary" />
      <p className="mt-2 text-sm font-medium">{text}</p>
      <p className="mt-1 text-xs text-muted-foreground">{accept.map((a) => a.toUpperCase()).join(", ")}</p>
      <input
        ref={ref}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept.map((a) => `.${a}`).join(",")}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function FileRow({ file, onRemove, extra, bare }: { file: File; onRemove: () => void; extra?: React.ReactNode; bare?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-3 py-2 text-sm", !bare && "rounded-md border border-border")}>
      <span className="grid size-8 place-items-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground">{fileExt(file.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{file.name}</div>
        <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
      </div>
      {extra}
      <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} aria-label="Удалить файл"><X /></Button>
    </div>
  );
}
