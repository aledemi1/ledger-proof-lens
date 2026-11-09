export interface Copy {
  language: string;
  nav: { home: string; audits: string; new: string; users: string; login: string; logout: string; exit: string };
  theme: { label: string; light: string; dusk: string; night: string };
  meta: { homeTitle: string; homeDescription: string; login: string; register: string; admin: string; newTitle: string; newDescription: string; auditsTitle: string; auditsDescription: string; workspace: string; conclusion: string };
  common: { loading: string; notFoundTitle: string; notFoundText: string; home: string; tryAgain: string; pageFailed: string; pageFailedText: string; cancel: string; save: string; close: string; demo: string; demoTitle: string; example: string };
  status: { match: string; mismatch: string; notFound: string; needsReview: string };
  category: { match: string; mismatch: string; notFound: string; needsReview: string };
  reviewer: { pending: string; confirmed: string; verified: string };
  session: { awaiting: string; review: string; completed: string };
  filters: { all: string; review: string; awaiting: string; completed: string };
  recommendation: { revise: string; reviseShort: string; manual: string; manualShort: string; accept: string; acceptShort: string };
  severity: { high: string; medium: string; low: string };
  doc: { report: string; contract: string; act: string; waybill: string; invoice: string; payment: string; other: string; unknown: string; mainReport: string };
  units: { b: string; kb: string; mb: string; page: string; fragment: string };
  landing: {
    kicker: string; title: string; titleMuted: string; lead: string; openDemo: string; newCheck: string; sample: string; reportAndSources: string; demoData: string; indicator: string; inReport: string; loadingSample: string; allResults: string; source: string; inDocument: string; difference: string; sourceFragment: string;
    step1: string; step1text: string; step2: string; step2text: string; step3: string; step3text: string;
    privacyKicker: string; privacyTitle: string; privacyLead: string; privacyExample: string; privacyOriginal: string; privacyMasked: string; privacySample: string; privacyNote: string; privacyP1: string; privacyP1t: string; privacyP2: string; privacyP2t: string; privacyP3: string; privacyP3t: string; privacyP4: string; privacyP4t: string;
    forLeaders: string; savingsTitle: string; savingsLead: string; savingsNote: string; reports: string; hoursManual: string; hoursWith: string; rate: string; hoursMonth: string; saveMonth: string; saveYear: string; fte: string; pieces: string; hours: string;
    why: string; whyTitle: string;
    b1: string; b1t: string; b2: string; b2t: string; b3: string; b3t: string; b4: string; b4t: string;
    features: string; featuresTitle: string;
    f1: string; f1t: string; f2: string; f2t: string; f3: string; f3t: string; f4: string; f4t: string; f5: string; f5t: string; f6: string; f6t: string;
    compareTitle: string; manual: string; withSverko: string;
    c1: string; c1a: string; c1b: string; c2: string; c2a: string; c2b: string; c3: string; c3a: string; c3b: string; c4: string; c4a: string; c4b: string; c5: string; c5a: string; c5b: string;
    faq: string; faqNote: string;
    q1: string; a1: string; q2: string; a2: string; q3: string; a3: string; q4: string; a4: string;
    cta: string; ctaText: string; footer: string; footerNote: string;
  };
  auth: { loginTitle: string; loginLead: string; email: string; password: string; signingIn: string; signIn: string; noAccount: string; create: string; registerTitle: string; registerLead: string; creating: string; createAccount: string; haveAccount: string; signInLink: string; badLogin: string; badRegister: string; sentTitle: string; sentLead: string; verifyTitle: string; verifyPending: string; verifyOk: string; verifyFail: string; toAudits: string };
  audits: { title: string; lead: string; new: string; apiError: string; signIn: string; or: string; createAccount: string; search: string; empty: string; loading: string; noReport: string; report: string; primary: string };
  neu: {
    title: string; lead: string; openDemo: string; guest: string; signIn: string; create: string;
    steps: [string, string, string]; report: string; privacy: string; dropReport: string; badReport: string; documents: string; documentsLead: string; dropSupporting: string; badSupporting: string; composition: string; titleLabel: string; description: string; recheck: string; none: string; afterStart: string;
    toList: string; back: string; next: string; start: string; started: string; failed: string; remove: string;
  };
  work: {
    loading: string; openFailed: string; backToAudits: string; missing: string; reviewed: string; of: string; summary: string; summaryLead: string; results: string; hideHint: string; auditStatus: string; more: string; reset: string; resetDone: string; toConclusion: string; unread: string; recheck: string;
    prevIssue: string; nextIssue: string; issues: string; hidden: string; none: string; all: string; search: string; onlyOpen: string; moreRelated: string; noFilter: string; noReport: string; pickSource: string;
    skipped: string; demoLocked: string; addedOne: string; addedMany: string; addFailed: string; add: string; paragraph: string; table: string; findFragment: string; openSourceFirst: string; noRows: string;
    inReport: string; notFoundIn: string; inDocument: string; difference: string; sourceN: string; prevSource: string; nextSource: string; hide: string; details: string; notInOpen: string; openFile: string;
    calculation: string; chosen: string; autoStatus: string; wrongDoc: string; clearChoice: string; severity: string; sheet: string; columnWidth: string; zoomOut: string; zoomIn: string; pickDocument: string; noDocument: string; copy: string; copyTitle: string; sourceBadge: string; noPrimary: string; page: string; moreFiles: string;
    reading: string; matching: string; running: string; waiting: string; incomplete: string; background: string; created: string; composition: string; deleteDraft: string; fileOpenFailed: string; pdfFailed: string; opening: string; sheets: string;
    noteDatesSame: string; noteDatesDiffer: string; noteSaved: string; noteSame: string; noteDiffer: string; noteNoNumber: string;
    commentRequired: string; comment: string; whyDismiss: string; commentPh: string; dismiss: string; confirmIssue: string; commentSaved: string; issueConfirmed: string; issueDismissed: string; decisionUndone: string; commentMark: string; undo: string; autoKept: string;
  };
  conclusion: {
    loading: string; missing: string; title: string; back: string; system: string; recommendation: string; openIssues: string; manualLeft: string; clear: string; reviewer: string; reason: string; change: string; notYet: string; accept: string; revise: string;
    copy: string; copied: string; copyFailed: string; excel: string; print: string; brand: string; date: string; demoMark: string;
    s1: string; report: string; checked: string; confirmed: string; mismatches: string; unconfirmed: string; manual: string; unreviewed: string;
    s2: string; noFindings: string; position: string; inReport: string; inSource: string; status: string; notFound: string;
    s3: string; appendix: string; reviewerComment: string; notDecided: string; conflictTitle: string; conflictText: string; reasonPh: string; confirm: string;
    textIntro: string; textMismatch: string; textMissing: string; textManual: string; textUnreviewed: string;
    recRevise: string; recManual: string; recAccept: string;
    excelField: string; excelReport: string; excelSource: string; excelStatus: string; excelDecision: string; excelComment: string; excelSources: string; excelDocument: string; excelPlace: string; sheetFindings: string; sheetEvidence: string; fileSuffix: string;
    decisionAccept: string; decisionRevise: string; findingsHeading: string; systemLine: string; reviewerLine: string; none: string;
  };
  admin: { title: string; lead: string; forbidden: string; loadFailed: string; admin: string; user: string; makeUser: string; makeAdmin: string; newAccount: string; password: string; create: string; createFailed: string; roleFailed: string; changePassword: string; current: string; next: string; savePassword: string; passwordFailed: string };
}
