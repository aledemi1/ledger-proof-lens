import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Check, PlayCircle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { SelectionPanel } from "@/components/audit/SelectionPanel";
import { WaitTime } from "@/components/audit/WaitTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REPORT_EXTENSIONS, SUPPORTING_EXTENSIONS } from "@/lib/documentTypes";
import { fileExt, formatSize } from "@/lib/format";
import { previewWait } from "@/lib/waitEstimate";
import { cn } from "@/lib/utils";
import { AuditApiError } from "@/services/apiAuditService";
import { useCopy } from "@/i18n/messages";
import { auditService } from "@/services/auditService";
import { DEMO_SESSION_ID } from "@/mocks/demoAudit";
import type { AuditDocument, AuditSession, DocumentType } from "@/types/audit";

interface Picked {
  key: string;
  file: File;
  type: DocumentType;
}

export function NewAuditPage() {
  const navigate = useNavigate();
  const t = useCopy();
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<AuditSession | null>(null);
  const [liveDocs, setLiveDocs] = useState<AuditDocument[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());
  const preparing = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    auditService.listSessions().then((sessions) => setEarlier(sessions.filter((session) => !session.isDemo))).catch(() => setEarlier([]));
  }, []);

  useEffect(() => {
    if (!draftId || liveSession?.processingStage === "selecting" || liveSession?.processingStage === "failed") return;
    const timer = window.setInterval(() => {
      void auditService.getSession(draftId).then((session) => {
        if (session) setLiveSession(session);
      }).catch(() => undefined);
      void auditService.getDocuments(draftId).then(setLiveDocs).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [draftId, liveSession?.processingStage]);

  const canNext = [!!report, supporting.length > 0, title.trim().length > 0][step];

  const chooseReport = (file: File) => {
    setReport(file);
    if (!titleTouched) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const addSupporting = (files: File[]) => {
    const ok = files.filter((f) => SUPPORTING_EXTENSIONS.includes(fileExt(f.name)));
    const bad = files.length - ok.length;
    if (bad) toast.error(`${bad} ${t.neu.badSupporting}`);
    setSupporting((prev) => [
      ...prev,
      ...ok
        .filter((f) => !prev.some((p) => p.file.name === f.name && p.file.size === f.size))
        .map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, type: "unknown" as DocumentType })),
    ]);
  };

  const prepare = async (force = false) => {
    if (!report || preparing.current || (!force && draftId)) return;
    const ticket = generation.current;
    preparing.current = true;
    setBusy(true);
    setUploadErrors([]);
    try {
      const s = await auditService.createDraft({
        title: title.trim(),
        description: description.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
        deferSelection: true,
        ...(previousId ? { previousSessionId: previousId } : {}),
        report: { name: report.name, size: report.size, mimeType: report.type, type: "report", file: report },
        supporting: supporting.map((p) => ({ name: p.file.name, size: p.file.size, mimeType: p.file.type, type: p.type, file: p.file })),
      });
      if (ticket !== generation.current) {
        await auditService.deleteDraft(s.id).catch(() => undefined);
        return;
      }
      setDraftId(s.id);
      setLiveSession(s);
      const docs = await auditService.getDocuments(s.id);
      setLiveDocs(docs);
    } catch (reason) {
      const files = reason instanceof AuditApiError ? reason.files : [];
      setUploadErrors(files);
      toast.error(reason instanceof Error ? reason.message : t.neu.failed);
      preparing.current = false;
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    generation.current += 1;
    const id = draftId;
    setDraftId(null);
    setLiveSession(null);
    setLiveDocs([]);
    preparing.current = false;
    idempotencyKey.current = crypto.randomUUID();
    if (id) await auditService.deleteDraft(id).catch(() => undefined);
  };

  useEffect(() => {
    if (step !== 2 || draftId || !report || !title.trim() || supporting.length === 0) return;
    void prepare();
    // prepare reads the latest files when the step opens; later edits go through abandon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draftId, supporting.length]);

  useEffect(() => {
    if (!draftId || !title.trim()) return;
    const handle = window.setTimeout(() => {
      void auditService.updateDetails(draftId, { title: title.trim(), description: description.trim() }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draftId, title, description]);

  return (
    <div className={cn("mx-auto px-4 py-6 lg:px-8 lg:py-8", liveSession?.processingStage === "selecting" ? "max-w-6xl" : "max-w-3xl")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t.neu.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.neu.lead}</p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: "/audits/$id", params: { id: DEMO_SESSION_ID } })}>
          <PlayCircle /> {t.neu.openDemo}
        </Button>
      </div>

      <ol className="mt-6 grid grid-cols-3 gap-2">
        {t.neu.steps.map((s, i) => (
          <li key={s}>
            <Button variant="ghost" className="h-auto w-full flex-col items-stretch px-0 hover:bg-transparent"
              disabled={i > step}
              onClick={() => {
                if (step === 2 && i < 2) void abandon();
                setStep(i);
              }}
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
            <h2 className="text-sm font-semibold">{t.neu.report}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t.neu.privacy}</p>
            {report ? (
              <div className="mt-3"><FileRow file={report} onRemove={() => setReport(null)} /></div>
            ) : (
              <DropZone
                className="mt-3"
                accept={REPORT_EXTENSIONS}
                multiple={false}
                text={t.neu.dropReport}
                onFiles={(fs) => {
                  const f = fs[0];
                  if (!f) return;
                  if (!REPORT_EXTENSIONS.includes(fileExt(f.name))) {
                    toast.error(t.neu.badReport);
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
            <h2 className="text-sm font-semibold">{t.neu.documents}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.neu.documentsLead}</p>
            <DropZone className="mt-3" accept={SUPPORTING_EXTENSIONS} multiple text={t.neu.dropSupporting} onFiles={addSupporting} compact={supporting.length > 0} />
            {supporting.length > 0 && (
              <div className="mt-3 divide-y divide-border rounded-md border border-border">
                {supporting.map((p) => (
                  <FileRow
                    key={p.key}
                    bare
                    file={p.file}
                    onRemove={() => setSupporting((prev) => prev.filter((x) => x.key !== p.key))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {(step === 0 || step === 1) && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t.neu.afterStart}
          </p>
        )}

        {step === 2 && report && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">{t.neu.titleLabel}</Label>
                <Input id="title" value={title} onChange={(event) => { setTitleTouched(true); setTitle(event.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">{t.neu.description}</Label>
                <Textarea id="desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.neu.description} />
              </div>
            </div>
            {earlier.length > 0 && !draftId && (
              <div className="space-y-1.5">
                <Label>{t.neu.recheck}</Label>
                <Select value={previousId || "none"} onValueChange={(value) => setPreviousId(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder={t.neu.none} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.neu.none}</SelectItem>
                    {earlier.map((session) => <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {uploadErrors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                {uploadErrors.map((item) => (
                  <p key={item.fileName}><span className="font-medium">{item.fileName}:</span> {item.reason}</p>
                ))}
              </div>
            )}
            {liveSession?.processingStage === "selecting" && liveSession.selection ? (
              <SelectionPanel
                session={liveSession}
                report={liveDocs.find((doc) => doc.id === liveSession.reportDocumentId) ?? {
                  id: liveSession.reportDocumentId ?? "report",
                  name: report.name,
                  type: "report",
                  mimeType: report.type,
                  size: report.size,
                  pageCount: 0,
                  preview: { kind: "none", reason: t.work.opening },
                }}
                copy={t}
                onStarted={() => navigate({ to: "/audits/$id", params: { id: liveSession.id } })}
              />
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 text-sm">
                <p className="font-medium">{liveSession?.processingError ? t.work.incomplete : t.neu.preparing}</p>
                <WaitTime seconds={liveSession?.estimateSeconds ?? previewWait([{ name: report.name, size: report.size }, ...supporting.map((item) => ({ name: item.file.name, size: item.file.size }))])} />
                {liveSession?.processingError && <p className="mt-2 text-destructive">{liveSession.processingError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        {step === 0 ? (
          <Button asChild variant="ghost"><Link to="/audits"><ArrowLeft /> {t.neu.toList}</Link></Button>
        ) : (
          <Button variant="ghost" onClick={() => { if (step === 2) void abandon(); setStep(step - 1); }}><ArrowLeft /> {t.neu.back}</Button>
        )}
        {step < 2 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{t.neu.next} <ArrowRight /></Button>
        ) : liveSession?.processingStage === "failed" ? (
          <Button onClick={() => {
            const failedId = draftId;
            preparing.current = false;
            setDraftId(null);
            setLiveSession(null);
            idempotencyKey.current = crypto.randomUUID();
            if (failedId) void auditService.deleteDraft(failedId).catch(() => undefined);
            void prepare(true);
          }}>{t.common.tryAgain}</Button>
        ) : (
          <span />
        )}
      </div>
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
  const t = useCopy();
  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-3 py-2 text-sm", !bare && "rounded-md border border-border")}>
      <span className="grid size-8 place-items-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground">{fileExt(file.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{file.name}</div>
        <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
      </div>
      {extra}
      <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} aria-label={t.neu.remove}><X /></Button>
    </div>
  );
}
