"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  FileStack,
  Combine,
  Scissors,
  FileArchive,
  PenLine,
  Signature,
  RotateCw,
  FilePlus2,
  FileImage,
  Stamp,
  Binary,
  Sun,
  Moon,
  Upload,
  Sparkles,
  X,
  ArrowRight,
  Files
} from "lucide-react";
import { StudioView, ToolId } from "@/lib/types";
import { useTheme } from "./theme-provider";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (toolId: ToolId) => void;
  onSelectView: (view: StudioView) => void;
  onTriggerUpload: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: "Tools" | "Navigation" | "Actions";
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectTool,
  onSelectView,
  onTriggerUpload,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();

  const commands: CommandItem[] = [
    // Tools
    {
      id: "tool-merge",
      title: "Merge PDF Documents",
      category: "Tools",
      icon: Combine,
      action: () => onSelectTool("merge"),
    },
    {
      id: "tool-split",
      title: "Split PDF into Pages",
      category: "Tools",
      icon: Scissors,
      action: () => onSelectTool("split"),
    },
    {
      id: "tool-compress",
      title: "Universal Compressor / Optimize",
      category: "Tools",
      icon: FileArchive,
      action: () => onSelectTool("compress"),
    },
    {
      id: "tool-sign",
      title: "Sign PDF (Draw or Type)",
      category: "Tools",
      icon: Signature,
      action: () => onSelectTool("sign"),
    },
    {
      id: "tool-annotate",
      title: "Annotate & Edit Text",
      category: "Tools",
      icon: PenLine,
      action: () => onSelectTool("annotate"),
    },
    {
      id: "tool-rotate",
      title: "Rotate PDF Pages",
      category: "Tools",
      icon: RotateCw,
      action: () => onSelectTool("rotate"),
    },
    {
      id: "tool-watermark",
      title: "Add Watermark to Document",
      category: "Tools",
      icon: Stamp,
      action: () => onSelectTool("watermark"),
    },
    {
      id: "tool-page-numbers",
      title: "Add Page Numbers",
      category: "Tools",
      icon: Binary,
      action: () => onSelectTool("page-numbers"),
    },
    {
      id: "tool-extract",
      title: "Extract Specific Pages",
      category: "Tools",
      icon: FilePlus2,
      action: () => onSelectTool("extract"),
    },
    {
      id: "tool-convert-images",
      title: "Images to PDF Conversion",
      category: "Tools",
      icon: FileImage,
      action: () => onSelectTool("convert-images"),
    },
    // Navigation
    {
      id: "nav-dashboard",
      title: "Go to Dashboard",
      category: "Navigation",
      icon: FileStack,
      action: () => onSelectView("dashboard"),
    },
    {
      id: "nav-all-documents",
      title: "View All Documents",
      category: "Navigation",
      icon: Files,
      action: () => onSelectView("all-documents"),
    },
    {
      id: "nav-starred",
      title: "View Starred Documents",
      category: "Navigation",
      icon: Sparkles,
      action: () => onSelectView("starred"),
    },
    {
      id: "nav-word-studio",
      title: "Open Word Studio",
      category: "Navigation",
      icon: FileStack,
      action: () => onSelectView("word-studio"),
    },
    {
      id: "nav-compressor",
      title: "Open Universal Compressor",
      category: "Navigation",
      icon: FileArchive,
      action: () => onSelectView("compressor"),
    },
    // Actions
    {
      id: "action-upload",
      title: "Upload / Import New Document",
      category: "Actions",
      icon: Upload,
      shortcut: "⌘U",
      action: () => onTriggerUpload(),
    },
    {
      id: "action-toggle-theme",
      title: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
      category: "Actions",
      icon: theme === "dark" ? Sun : Moon,
      action: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else onTriggerUpload(); // or trigger open
      }
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose, onTriggerUpload]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command search"
      >
        <div className="palette-input-row">
          <Search size={18} className="palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a tool name, command or navigation..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <button type="button" onClick={onClose} className="palette-close-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">No results found for &ldquo;{query}&rdquo;</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`palette-item ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="palette-item-icon">
                    <Icon size={16} />
                  </span>
                  <div className="palette-item-info">
                    <span className="palette-item-title">{cmd.title}</span>
                    <span className="palette-item-category">{cmd.category}</span>
                  </div>
                  {cmd.shortcut && <kbd className="palette-shortcut">{cmd.shortcut}</kbd>}
                  <ArrowRight size={14} className="palette-item-arrow" />
                </div>
              );
            })
          )}
        </div>

        <div className="palette-footer">
          <span>Navigate with <kbd>↑</kbd> <kbd>↓</kbd></span>
          <span>Select with <kbd>Enter</kbd></span>
          <span>Close with <kbd>Esc</kbd></span>
        </div>
      </div>
    </div>
  );
}
