import { LucideIcon } from "lucide-react";

export type StudioView =
  | "dashboard"
  | "all-documents"
  | "recent"
  | "starred"
  | "pdf-tools"
  | "word-studio"
  | "presentation-studio"
  | "image-studio"
  | "compressor"
  | "shared";

export type ToolId =
  | "merge"
  | "split"
  | "rotate"
  | "extract"
  | "delete-pages"
  | "reorder"
  | "annotate"
  | "sign"
  | "watermark"
  | "page-numbers"
  | "compress"
  | "convert-images"
  | "word-to-pdf"
  | "ppt-to-pdf"
  | "ocr"
  | "ai-summary"
  | "protect";

export interface WorkspaceTool {
  id: ToolId;
  title: string;
  description: string;
  category: "pdf" | "office" | "image" | "ai" | "security";
  icon: LucideIcon;
  tint: "indigo" | "violet" | "blue" | "emerald" | "amber" | "rose" | "cyan";
  ready: boolean;
  badge?: string;
  action?: string;
}

export interface WorkspaceDocument {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  file?: File;
  blobUrl?: string;
  pageCount?: number;
  createdAt: number;
  updatedAt: number;
  isStarred?: boolean;
  tags?: string[];
  status: "ready" | "processing" | "saving" | "error";
  storagePath?: string;
  previewThumbnail?: string;
}

export interface DraftSession {
  version: number;
  timestamp: number;
  documents: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    pageCount?: number;
    isStarred?: boolean;
    tags?: string[];
    createdAt: number;
    updatedAt: number;
    // Data URI or base64 if small (< 5MB), or stored in IndexedDB blob table
    hasBlob: boolean;
  }>;
  activeDocId?: string;
  activeView: StudioView;
  recentTools: ToolId[];
}

export interface MergeFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  pageRange: string; // "all" or "1, 3-5"
  rotation: number; // 0, 90, 180, 270
}

export type ThemeMode = "light" | "dark" | "system";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: "success" | "info" | "warning";
  actionUrl?: string;
}
