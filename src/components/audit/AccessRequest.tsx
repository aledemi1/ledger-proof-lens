import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCopy } from "@/i18n/messages";

const ACCESS_EMAIL = "aledemi1@mail.ru";

/** Opens a request for access instead of starting a new review. */
export function AccessRequest({ children }: { children: ReactNode }) {
  const t = useCopy();
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.access.title}</DialogTitle>
        </DialogHeader>
        <a href={`mailto:${ACCESS_EMAIL}`} className="text-base font-medium text-primary underline underline-offset-4">{ACCESS_EMAIL}</a>
      </DialogContent>
    </Dialog>
  );
}
