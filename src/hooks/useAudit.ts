import { useCallback, useEffect, useState } from "react";
import { auditService } from "@/services/auditService";
import type { AuditDocument, AuditSession } from "@/types/audit";

/** Loads on the client (data lives in localStorage) and refreshes on any service mutation. */
export function useSessions() {
  const [sessions, setSessions] = useState<AuditSession[] | null>(null);
  useEffect(() => {
    const load = () => auditService.listSessions().then(setSessions);
    load();
    return auditService.subscribe(load);
  }, []);
  return sessions;
}

export function useAuditSession(id: string) {
  const [session, setSession] = useState<AuditSession | null | undefined>(undefined);
  const [documents, setDocuments] = useState<AuditDocument[]>([]);
  const load = useCallback(async () => {
    const [s, d] = await Promise.all([auditService.getSession(id), auditService.getDocuments(id)]);
    setSession(s);
    setDocuments(d);
  }, [id]);
  useEffect(() => {
    load();
    return auditService.subscribe(load);
  }, [load]);
  return { session, documents, loading: session === undefined };
}
