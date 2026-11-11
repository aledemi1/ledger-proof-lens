import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/i18n/use-locale";
import { setDemoLocale } from "@/mocks/demoLocale";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession } from "@/types/audit";

/** Loads audits and refreshes when the service changes or a server job is still running. */
export function useSessions() {
  const locale = useLocale();
  setDemoLocale(locale);
  const [sessions, setSessions] = useState<AuditSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const list = await auditService.listSessions();
      setSessions(list);
      setError(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось загрузить проверки";
      setError(message);
      setSessions((current) => current ?? []);
    }
  }, [locale]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => auditService.subscribe(load), [load]);
  return { sessions, error };
}

export function useAuditSession(id: string) {
  const locale = useLocale();
  setDemoLocale(locale);
  const [session, setSession] = useState<AuditSession | null | undefined>(undefined);
  const [documents, setDocuments] = useState<AuditDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [nextSession, nextDocuments] = await Promise.all([auditService.getSession(id), auditService.getDocuments(id)]);
      setSession(nextSession);
      setDocuments(nextDocuments);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить проверку");
      setSession(null);
      setDocuments([]);
    }
  }, [id, locale]);
  useEffect(() => {
    void load();
    return auditService.subscribe(load);
  }, [load]);
  useEffect(() => {
    if (!session || session.status !== "awaiting_processing" || session.processingError) return;
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, [session, load]);
  return { session, documents, loading: session === undefined && !error, error };
}
