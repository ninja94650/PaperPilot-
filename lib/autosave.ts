import { WorkspaceDocument, StudioView, ToolId } from "./types";

const DB_NAME = "PaperPilotWorkspaceDB";
const DB_VERSION = 1;
const METADATA_KEY = "paperpilot_draft_metadata";

// Initialize IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Store a file buffer in IndexedDB
async function storeBlob(id: string, file: File): Promise<void> {
  try {
    const db = await openDB();
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readwrite");
      const store = tx.objectStore("blobs");
      const req = store.put({ id, name: file.name, type: file.type, buffer, lastModified: file.lastModified });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not save blob to IndexedDB:", err);
  }
}

// Retrieve a file from IndexedDB
async function retrieveBlob(id: string): Promise<File | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const store = tx.objectStore("blobs");
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return resolve(null);
        const { name, type, buffer, lastModified } = req.result;
        const file = new File([buffer], name, { type, lastModified });
        resolve(file);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not retrieve blob from IndexedDB:", err);
    return null;
  }
}

// Delete blobs not in the active set
async function pruneBlobs(activeIds: Set<string>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("blobs", "readwrite");
    const store = tx.objectStore("blobs");
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (!activeIds.has(cursor.key as string)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {
    console.warn("Could not prune IndexedDB blobs:", err);
  }
}

export interface AutosaveSessionData {
  timestamp: number;
  activeDocId: string;
  activeView: StudioView;
  recentTools: ToolId[];
  documents: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    pageCount?: number;
    createdAt: number;
    updatedAt: number;
    isStarred?: boolean;
    tags?: string[];
    storagePath?: string;
  }>;
}

export async function saveAutosaveSession(
  docs: WorkspaceDocument[],
  activeDocId: string,
  activeView: StudioView,
  recentTools: ToolId[]
): Promise<void> {
  if (typeof window === "undefined") return;

  const activeIds = new Set<string>();

  for (const doc of docs) {
    activeIds.add(doc.id);
    if (doc.file) {
      await storeBlob(doc.id, doc.file);
    }
  }

  await pruneBlobs(activeIds);

  const sessionData: AutosaveSessionData = {
    timestamp: Date.now(),
    activeDocId,
    activeView,
    recentTools,
    documents: docs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      mimeType: doc.mimeType,
      pageCount: doc.pageCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      isStarred: doc.isStarred,
      tags: doc.tags,
      storagePath: doc.storagePath,
    })),
  };

  try {
    localStorage.setItem(METADATA_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn("Failed to write metadata to localStorage", err);
  }
}

export async function loadAutosaveSession(): Promise<{
  documents: WorkspaceDocument[];
  activeDocId: string;
  activeView: StudioView;
  recentTools: ToolId[];
  timestamp: number;
} | null> {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(METADATA_KEY);
    if (!raw) return null;
    const sessionData: AutosaveSessionData = JSON.parse(raw);

    const documents: WorkspaceDocument[] = [];
    for (const docMeta of sessionData.documents) {
      const file = await retrieveBlob(docMeta.id);
      let blobUrl: string | undefined;
      if (file) {
        blobUrl = URL.createObjectURL(file);
      }
      documents.push({
        ...docMeta,
        file: file ?? undefined,
        blobUrl,
        status: file ? "ready" : "error",
      });
    }

    return {
      documents,
      activeDocId: sessionData.activeDocId,
      activeView: sessionData.activeView || "dashboard",
      recentTools: sessionData.recentTools || ["merge", "split", "compress"],
      timestamp: sessionData.timestamp,
    };
  } catch (err) {
    console.error("Failed to restore autosaved session:", err);
    return null;
  }
}

export async function clearAutosaveSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(METADATA_KEY);
    const db = await openDB();
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").clear();
  } catch (err) {
    console.warn("Could not clear autosave session:", err);
  }
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
