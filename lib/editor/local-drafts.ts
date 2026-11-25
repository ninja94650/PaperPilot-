export type OfficeEditorKind = "word" | "presentation";

type OfficeDraftSession = {
  id: string;
  kind: OfficeEditorKind;
  sourceName: string;
  sourceType: string;
  sourceBlob: Blob;
  latestRevisionId: string | null;
  latestVersion: number;
  cloudDocumentId: string | null;
  parentRevisionId: string | null;
  updatedAt: number;
};

type OfficeDraftRevision = {
  id: string;
  sessionId: string;
  version: number;
  name: string;
  type: string;
  blob: Blob;
  createdAt: number;
};

export type RecoveredOfficeDraft = {
  sessionId: string;
  kind: OfficeEditorKind;
  sourceFile: File;
  latestFile: File;
  latestVersion: number;
  cloudDocumentId: string | null;
  parentRevisionId: string | null;
  updatedAt: number;
};

const DB_NAME = "paperpilot-office-drafts";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local draft storage is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("revisions")) {
        const revisions = db.createObjectStore("revisions", { keyPath: "id" });
        revisions.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local draft storage."));
    request.onblocked = () => reject(new Error("Local draft storage is blocked by another open PaperPilot tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local draft storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local draft transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local draft transaction failed."));
  });
}

export async function createOfficeSessionId(file: File, kind: OfficeEditorKind): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return kind + ":" + hex;
}

export async function ensureOfficeDraftSession(sessionId: string, file: File, kind: OfficeEditorKind) {
  const db = await openDatabase();
  try {
    const tx = db.transaction("sessions", "readwrite");
    const store = tx.objectStore("sessions");
    const existing = await requestResult(store.get(sessionId)) as OfficeDraftSession | undefined;
    if (!existing) {
      store.put({
        id: sessionId,
        kind,
        sourceName: file.name,
        sourceType: file.type || "application/octet-stream",
        sourceBlob: file,
        latestRevisionId: null,
        latestVersion: 0,
        cloudDocumentId: null,
        parentRevisionId: null,
        updatedAt: Date.now()
      } satisfies OfficeDraftSession);
    }
    await transactionDone(tx);
    return existing ?? null;
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

export async function saveOfficeDraftRevision(input: {
  sessionId: string;
  sourceFile: File;
  kind: OfficeEditorKind;
  revisionFile: File;
}) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(["sessions", "revisions"], "readwrite");
    const sessions = tx.objectStore("sessions");
    const revisions = tx.objectStore("revisions");
    const existing = await requestResult(sessions.get(input.sessionId)) as OfficeDraftSession | undefined;
    const version = (existing?.latestVersion ?? 0) + 1;
    const revisionId = input.sessionId + ":" + version;
    const revision: OfficeDraftRevision = {
      id: revisionId,
      sessionId: input.sessionId,
      version,
      name: input.revisionFile.name,
      type: input.revisionFile.type || "application/octet-stream",
      blob: input.revisionFile,
      createdAt: Date.now()
    };
    revisions.put(revision);
    const session: OfficeDraftSession = {
      id: input.sessionId,
      kind: input.kind,
      sourceName: existing?.sourceName ?? input.sourceFile.name,
      sourceType: existing?.sourceType ?? input.sourceFile.type ?? "application/octet-stream",
      sourceBlob: existing?.sourceBlob ?? input.sourceFile,
      latestRevisionId: revisionId,
      latestVersion: version,
      cloudDocumentId: existing?.cloudDocumentId ?? null,
      parentRevisionId: existing?.parentRevisionId ?? null,
      updatedAt: Date.now()
    };
    sessions.put(session);
    await transactionDone(tx);
    return { version, session };
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

export async function setOfficeCloudLink(sessionId: string, documentId: string, parentRevisionId: string | null) {
  const db = await openDatabase();
  try {
    const tx = db.transaction("sessions", "readwrite");
    const store = tx.objectStore("sessions");
    const session = await requestResult(store.get(sessionId)) as OfficeDraftSession | undefined;
    if (!session) throw new Error("Local Office draft session is missing.");
    session.cloudDocumentId = documentId;
    session.parentRevisionId = parentRevisionId;
    session.updatedAt = Date.now();
    store.put(session);
    await transactionDone(tx);
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

export async function updateOfficeCloudParent(sessionId: string, parentRevisionId: string) {
  const db = await openDatabase();
  try {
    const tx = db.transaction("sessions", "readwrite");
    const store = tx.objectStore("sessions");
    const session = await requestResult(store.get(sessionId)) as OfficeDraftSession | undefined;
    if (!session) throw new Error("Local Office draft session is missing.");
    session.parentRevisionId = parentRevisionId;
    session.updatedAt = Date.now();
    store.put(session);
    await transactionDone(tx);
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

export async function listRecoveredOfficeDrafts(): Promise<RecoveredOfficeDraft[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(["sessions", "revisions"], "readonly");
    const sessions = await requestResult(tx.objectStore("sessions").getAll()) as OfficeDraftSession[];
    const revisionStore = tx.objectStore("revisions");
    const recovered: RecoveredOfficeDraft[] = [];
    for (const session of sessions) {
      if (!session.latestRevisionId) continue;
      const revision = await requestResult(revisionStore.get(session.latestRevisionId)) as OfficeDraftRevision | undefined;
      if (!revision) continue;
      recovered.push({
        sessionId: session.id,
        kind: session.kind,
        sourceFile: new File([session.sourceBlob], session.sourceName, { type: session.sourceType }),
        latestFile: new File([revision.blob], revision.name, { type: revision.type, lastModified: revision.createdAt }),
        latestVersion: session.latestVersion,
        cloudDocumentId: session.cloudDocumentId,
        parentRevisionId: session.parentRevisionId,
        updatedAt: session.updatedAt
      });
    }
    await transactionDone(tx);
    return recovered.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

function normalizeStorageError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return new Error("Your browser's local storage is full. Download this revision or enable cloud history before continuing.");
  }
  return error instanceof Error ? error : new Error("Local Office draft storage failed.");
}
