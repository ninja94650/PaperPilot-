"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Bell,
  Sun,
  Moon,
  Laptop,
  Plus,
  Check,
  Clock,
  Sparkles,
  User,
  LogOut,
  ExternalLink,
  ChevronDown,
  ShieldCheck,
  Cloud,
  FileCheck
} from "lucide-react";
import { StudioView, NotificationItem } from "@/lib/types";
import { useTheme } from "./theme-provider";

interface TopNavProps {
  currentView: StudioView;
  onOpenSearch: () => void;
  onTriggerUpload: () => void;
  autosaveStatus?: string;
  notifications: NotificationItem[];
  onClearNotifications: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export default function TopNav({
  currentView,
  onOpenSearch,
  onTriggerUpload,
  autosaveStatus,
  notifications,
  onClearNotifications,
  userEmail,
  onSignOut,
}: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const viewTitles: Record<StudioView, { title: string; subtitle: string }> = {
    dashboard: { title: "Dashboard", subtitle: "Overview and document workspace" },
    "all-documents": { title: "All Documents", subtitle: "Manage and search your document library" },
    recent: { title: "Recent Documents", subtitle: "Recently accessed and edited files" },
    starred: { title: "Starred Documents", subtitle: "Your pinned and favorite documents" },
    "pdf-tools": { title: "PDF Tools", subtitle: "Browser-side PDF manipulation & conversion" },
    "word-studio": { title: "Word Studio", subtitle: "DOCX inspection, formatting & conversion" },
    "presentation-studio": { title: "Presentation Studio", subtitle: "Deck management & PPTX exports" },
    "image-studio": { title: "Image Studio", subtitle: "Multi-image to PDF and format transformations" },
    compressor: { title: "Universal Compressor", subtitle: "Intelligent PDF and document optimization" },
    shared: { title: "Shared Documents", subtitle: "Team access and collaboration links" },
  };

  const currentMeta = viewTitles[currentView] || { title: "Workspace", subtitle: "PaperPilot Studio" };

  return (
    <header className="top-nav-root">
      {/* View Title & Breadcrumb */}
      <div className="top-nav-title-area">
        <h1 className="view-title">{currentMeta.title}</h1>
        {autosaveStatus && (
          <div className="autosave-pill" title="Local session status">
            <span className="autosave-dot" />
            <span className="autosave-text">{autosaveStatus}</span>
          </div>
        )}
      </div>

      {/* Center Global Search Trigger */}
      <div className="top-nav-search-area">
        <button
          type="button"
          onClick={onOpenSearch}
          className="global-search-btn"
          aria-label="Search tools and documents"
        >
          <Search size={16} className="search-icon" />
          <span className="search-placeholder">Search tools, documents, actions...</span>
          <kbd className="search-shortcut">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right Actions */}
      <div className="top-nav-actions">
        {/* New / Upload Button */}
        <button
          type="button"
          onClick={onTriggerUpload}
          className="nav-action-upload-btn"
          title="Import files to workspace"
        >
          <Plus size={16} />
          <span>New Document</span>
        </button>

        {/* Theme Selector Popover */}
        <div className="popover-wrapper" ref={themeRef}>
          <button
            type="button"
            onClick={() => setShowThemeMenu((v) => !v)}
            className="nav-icon-btn"
            title="Toggle Theme"
            aria-label="Theme selector"
          >
            {theme === "dark" ? <Moon size={18} /> : theme === "system" ? <Laptop size={18} /> : <Sun size={18} />}
          </button>

          {showThemeMenu && (
            <div className="popover-menu theme-menu-dropdown">
              <div className="popover-heading">Theme</div>
              <button
                type="button"
                className={`popover-item ${theme === "light" ? "active" : ""}`}
                onClick={() => {
                  setTheme("light");
                  setShowThemeMenu(false);
                }}
              >
                <Sun size={15} />
                <span>Light Mode</span>
                {theme === "light" && <Check size={14} className="check-mark" />}
              </button>
              <button
                type="button"
                className={`popover-item ${theme === "dark" ? "active" : ""}`}
                onClick={() => {
                  setTheme("dark");
                  setShowThemeMenu(false);
                }}
              >
                <Moon size={15} />
                <span>Dark Mode</span>
                {theme === "dark" && <Check size={14} className="check-mark" />}
              </button>
              <button
                type="button"
                className={`popover-item ${theme === "system" ? "active" : ""}`}
                onClick={() => {
                  setTheme("system");
                  setShowThemeMenu(false);
                }}
              >
                <Laptop size={15} />
                <span>System</span>
                {theme === "system" && <Check size={14} className="check-mark" />}
              </button>
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div className="popover-wrapper" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications((v) => !v)}
            className="nav-icon-btn"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="popover-menu notifications-dropdown">
              <div className="popover-header-row">
                <span className="popover-heading">Activity & Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearNotifications}
                    className="clear-notif-link"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <div className="empty-notifs">
                    <FileCheck size={28} className="empty-notif-icon" />
                    <p>No new activity</p>
                    <small>Processed and saved files will show here.</small>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="notification-row">
                      <div className={`notif-indicator notif-${n.type}`} />
                      <div className="notif-content">
                        <b>{n.title}</b>
                        <p>{n.message}</p>
                        <time>{new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Account / Profile Button */}
        <div className="popover-wrapper" ref={userRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            className="user-nav-btn"
            aria-label="User Account Menu"
          >
            <div className="user-nav-avatar">
              {userEmail ? userEmail.charAt(0).toUpperCase() : <User size={15} />}
            </div>
            <span className="user-nav-name">
              {userEmail ? userEmail.split("@")[0] : "Account"}
            </span>
            <ChevronDown size={14} className="user-nav-chevron" />
          </button>

          {showUserMenu && (
            <div className="popover-menu user-dropdown">
              <div className="user-dropdown-header">
                <b>{userEmail ? userEmail.split("@")[0] : "Local Guest"}</b>
                <small>{userEmail || "Guest session (saved locally)"}</small>
              </div>
              <div className="popover-divider" />
              <Link href="/account" className="popover-item" onClick={() => setShowUserMenu(false)}>
                <User size={15} />
                <span>Account & Cloud Storage</span>
              </Link>
              <Link href="/login" className="popover-item" onClick={() => setShowUserMenu(false)}>
                <Cloud size={15} />
                <span>{userEmail ? "Manage Cloud Sync" : "Sign In / Register"}</span>
              </Link>
              {onSignOut && userEmail && (
                <>
                  <div className="popover-divider" />
                  <button
                    type="button"
                    className="popover-item danger"
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut();
                    }}
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
