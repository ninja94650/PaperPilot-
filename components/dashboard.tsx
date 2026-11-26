"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./sidebar";
import TopNav from "./top-nav";
import DashboardBento from "./dashboard-bento";
import DocumentEditor from "./document-editor";
import MergeStudio from "./merge-studio";
import CompressorStudio from "./compressor-studio";
import OfficeStudios from "./office-studios";
import CommandPalette from "./command-palette";
import { ThemeProvider } from "./theme-provider";
import {
  WorkspaceDocument,
  StudioView,
  ToolId,
  NotificationItem,
} from "@/lib/types";
import {
  saveAutosaveSession,
  loadAutosaveSession,
  clearAutosaveSession,
  formatRelativeTime
} from "@/lib/autosave";
import { getPdfInfo } from "@/lib/pdf-tools";
import { createClient } from "@/lib/supabase/client";

export default function Dashboard() {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [currentView, setCurrentView] = useState<StudioView>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editorInitialTool, setEditorInitialTool] = useState<ToolId | undefined>(undefined);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [autosaveTimestamp, setAutosaveTimestamp] = useState<number>(Date.now());
  const [autosaveStatus, setAutosaveStatus] = useState<string>("Ready");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "initial-welcome",
      title: "Welcome to PaperPilot",
      message: "Your private, browser-first document workspace is ready.",
      timestamp: Date.now(),
      read: false,
      type: "info",
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check Supabase session on mount
  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setUserEmail(user.email);
        }
      }).catch(() => {});
    } catch {}
  }, []);

  // Restore autosaved draft session
  useEffect(() => {
    loadAutosaveSession().then((session) => {
      if (session && session.documents.length > 0) {
        setDocuments(session.documents);
        setAutosaveTimestamp(session.timestamp);
        setAutosaveStatus(`Restored draft (${formatRelativeTime(session.timestamp)})`);
        setNotifications((prev) => [
          {
            id: crypto.randomUUID(),
            title: "Draft Restored",
            message: `Loaded ${session.documents.length} document(s) from your previous session.`,
            timestamp: Date.now(),
            read: false,
            type: "success",
          },
          ...prev,
        ]);
      }
    });
  }, []);

  // Periodic autosave trigger
  const triggerAutosave = useCallback(
    (docsToSave: WorkspaceDocument[]) => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      setAutosaveStatus("Autosaving...");
      autosaveTimeoutRef.current = setTimeout(async () => {
        const now = Date.now();
        await saveAutosaveSession(
          docsToSave,
          editingDocId || docsToSave[0]?.id || "",
          currentView,
          ["merge", "split", "compress"]
        );
        setAutosaveTimestamp(now);
        setAutosaveStatus(`Autosaved ${formatRelativeTime(now)}`);
      }, 1200);
    },
    [editingDocId, currentView]
  );

  // Update relative autosave label every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (autosaveTimestamp) {
        setAutosaveStatus(`Autosaved ${formatRelativeTime(autosaveTimestamp)}`);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [autosaveTimestamp]);

  // Handle file imports
  async function handleImportFiles(incoming: FileList | File[]) {
    const filesArray = Array.from(incoming);
    const newDocs: WorkspaceDocument[] = [];

    for (const file of filesArray) {
      const id = crypto.randomUUID();
      const blobUrl = URL.createObjectURL(file);
      let pageCount = 1;

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const info = await getPdfInfo(file);
          pageCount = info.pageCount;
        } catch {}
      }

      newDocs.push({
        id,
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        file,
        blobUrl,
        pageCount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "ready",
        isStarred: false,
      });
    }

    setDocuments((prev) => {
      const merged = [...newDocs, ...prev];
      triggerAutosave(merged);
      return merged;
    });

    setNotifications((prev) => [
      {
        id: crypto.randomUUID(),
        title: "Files Added",
        message: `${newDocs.length} file(s) imported to local workspace.`,
        timestamp: Date.now(),
        read: false,
        type: "success",
      },
      ...prev,
    ]);
  }

  function handleDeleteDocument(docId: string) {
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId);
      triggerAutosave(filtered);
      return filtered;
    });
    if (editingDocId === docId) {
      setEditingDocId(null);
    }
  }

  function handleToggleStar(docId: string) {
    setDocuments((prev) => {
      const updated = prev.map((d) =>
        d.id === docId ? { ...d, isStarred: !d.isStarred } : d
      );
      triggerAutosave(updated);
      return updated;
    });
  }

  function handleUpdateDocument(docId: string, nextFile: File, nextBlobUrl: string) {
    setDocuments((prev) => {
      const updated = prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              file: nextFile,
              blobUrl: nextBlobUrl,
              size: nextFile.size,
              updatedAt: Date.now(),
            }
          : d
      );
      triggerAutosave(updated);
      return updated;
    });
  }

  function handleOpenEditor(docId?: string, initialTool?: ToolId) {
    const targetId = docId || documents[0]?.id;
    if (!targetId) {
      fileInputRef.current?.click();
      return;
    }
    setEditingDocId(targetId);
    setEditorInitialTool(initialTool);
  }

  function handleSelectTool(toolId: ToolId) {
    if (toolId === "merge") {
      setCurrentView("pdf-tools");
    } else if (toolId === "compress") {
      setCurrentView("compressor");
    } else if (toolId === "convert-images") {
      setCurrentView("image-studio");
    } else if (toolId === "word-to-pdf") {
      setCurrentView("word-studio");
    } else if (toolId === "ppt-to-pdf") {
      setCurrentView("presentation-studio");
    } else {
      handleOpenEditor(undefined, toolId);
    }
  }

  // Cloud Save through Supabase
  async function handleSaveToCloud(targetFile?: File) {
    const filesToUpload = targetFile
      ? [targetFile]
      : documents.map((d) => d.file).filter(Boolean) as File[];

    if (!filesToUpload.length) {
      alert("No files to upload.");
      return;
    }

    setIsSavingCloud(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = "/login";
        return;
      }

      let count = 0;
      for (const file of filesToUpload) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
        const path = `${user.id}/${crypto.randomUUID()}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error: rowError } = await supabase.from("documents").insert({
          owner_id: user.id,
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: path,
          status: "ready",
        });

        if (rowError) throw rowError;
        count++;
      }

      setNotifications((prev) => [
        {
          id: crypto.randomUUID(),
          title: "Cloud Sync Complete",
          message: `${count} document(s) uploaded privately to your Supabase vault.`,
          timestamp: Date.now(),
          read: false,
          type: "success",
        },
        ...prev,
      ]);
      alert(`${count} file(s) saved to your private cloud storage.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cloud upload failed. Please sign in.");
    } finally {
      setIsSavingCloud(false);
    }
  }

  const storageUsedBytes = documents.reduce((sum, d) => sum + d.size, 0);
  const starredCount = documents.filter((d) => d.isStarred).length;
  const activeEditorDoc = documents.find((d) => d.id === editingDocId);

  return (
    <ThemeProvider>
      <div className="saas-app-wrapper">
        <input
          type="file"
          ref={fileInputRef}
          className="sr-only"
          multiple
          accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp"
          onChange={(e) => e.target.files && handleImportFiles(e.target.files)}
        />

        {/* Left Collapsible Sidebar */}
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          documentCount={documents.length}
          starredCount={starredCount}
          userEmail={userEmail}
          storageUsedBytes={storageUsedBytes}
          onSignOut={async () => {
            try {
              const supabase = createClient();
              await supabase.auth.signOut();
              setUserEmail(null);
            } catch {}
          }}
        />

        {/* Main Workspace Frame */}
        <div className="saas-main-viewport">
          {/* Top Navigation Bar */}
          <TopNav
            currentView={currentView}
            onOpenSearch={() => setIsCommandOpen(true)}
            onTriggerUpload={() => fileInputRef.current?.click()}
            autosaveStatus={autosaveStatus}
            notifications={notifications}
            onClearNotifications={() => setNotifications([])}
            userEmail={userEmail}
            onSignOut={async () => {
              try {
                const supabase = createClient();
                await supabase.auth.signOut();
                setUserEmail(null);
              } catch {}
            }}
          />

          {/* Dynamic Content Views */}
          <div className="saas-content-area">
            {currentView === "dashboard" && (
              <DashboardBento
                documents={documents}
                onImportFiles={handleImportFiles}
                onOpenEditor={handleOpenEditor}
                onDeleteDocument={handleDeleteDocument}
                onToggleStar={handleToggleStar}
                onSelectTool={handleSelectTool}
                storageUsedBytes={storageUsedBytes}
                isSavingCloud={isSavingCloud}
                onSaveToCloud={() => handleSaveToCloud()}
                userEmail={userEmail}
              />
            )}

            {currentView === "pdf-tools" && (
              <MergeStudio
                onMergeComplete={(merged) => {
                  handleImportFiles([merged]);
                  setNotifications((prev) => [
                    {
                      id: crypto.randomUUID(),
                      title: "Merge Succeeded",
                      message: `${merged.name} created and added to workspace.`,
                      timestamp: Date.now(),
                      read: false,
                      type: "success",
                    },
                    ...prev,
                  ]);
                }}
                onSaveToCloud={handleSaveToCloud}
              />
            )}

            {currentView === "compressor" && (
              <CompressorStudio
                onOptimized={(file) => {
                  handleImportFiles([file]);
                  setNotifications((prev) => [
                    {
                      id: crypto.randomUUID(),
                      title: "PDF Compressed",
                      message: `Optimized copy of ${file.name} saved to workspace.`,
                      timestamp: Date.now(),
                      read: false,
                      type: "success",
                    },
                    ...prev,
                  ]);
                }}
                onSaveToCloud={handleSaveToCloud}
              />
            )}

            {(currentView === "all-documents" ||
              currentView === "recent" ||
              currentView === "starred" ||
              currentView === "word-studio" ||
              currentView === "presentation-studio" ||
              currentView === "image-studio" ||
              currentView === "shared") && (
              <OfficeStudios
                view={currentView}
                documents={documents}
                onOpenEditor={handleOpenEditor}
                onImportFiles={handleImportFiles}
                onDeleteDoc={handleDeleteDocument}
                onToggleStar={handleToggleStar}
              />
            )}
          </div>
        </div>

        {/* Global Command Palette (⌘K) */}
        <CommandPalette
          isOpen={isCommandOpen}
          onClose={() => setIsCommandOpen(false)}
          onSelectTool={handleSelectTool}
          onSelectView={setCurrentView}
          onTriggerUpload={() => fileInputRef.current?.click()}
        />

        {/* Full Interactive Document Editor Modal */}
        {activeEditorDoc && (
          <DocumentEditor
            document={activeEditorDoc}
            onClose={() => setEditingDocId(null)}
            onUpdateDocument={handleUpdateDocument}
            autosaveStatus={autosaveStatus}
            onSaveToCloud={handleSaveToCloud}
            initialTool={editorInitialTool}
          />
        )}
      </div>
    </ThemeProvider>
  );
}
