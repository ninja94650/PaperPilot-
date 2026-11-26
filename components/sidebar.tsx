"use client";

import React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Files,
  Clock,
  Star,
  FileStack,
  FileText,
  Presentation,
  Image as ImageIcon,
  Minimize2,
  Users,
  PanelLeftClose,
  PanelLeft,
  HardDrive,
  Sparkles,
  ChevronRight,
  LogOut,
  User,
  ShieldCheck,
  Settings
} from "lucide-react";
import { StudioView } from "@/lib/types";

interface SidebarProps {
  currentView: StudioView;
  onViewChange: (view: StudioView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  documentCount: number;
  starredCount: number;
  userEmail?: string | null;
  storageUsedBytes: number;
  storageMaxBytes?: number;
  onSignOut?: () => void;
}

export default function Sidebar({
  currentView,
  onViewChange,
  collapsed,
  onToggleCollapse,
  documentCount,
  starredCount,
  userEmail,
  storageUsedBytes,
  storageMaxBytes = 100 * 1024 * 1024, // 100 MB free tier
  onSignOut,
}: SidebarProps) {
  const navItems: Array<{
    id: StudioView;
    label: string;
    icon: React.ElementType;
    badge?: number | string;
    section?: string;
  }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "all-documents", label: "All Documents", icon: Files, badge: documentCount },
    { id: "recent", label: "Recent", icon: Clock },
    { id: "starred", label: "Starred", icon: Star, badge: starredCount > 0 ? starredCount : undefined },
    { id: "pdf-tools", label: "PDF Tools", icon: FileStack, badge: "8 tools" },
    { id: "word-studio", label: "Word Studio", icon: FileText },
    { id: "presentation-studio", label: "Presentation Studio", icon: Presentation },
    { id: "image-studio", label: "Image Studio", icon: ImageIcon },
    { id: "compressor", label: "Universal Compressor", icon: Minimize2, badge: "Save 70%" },
    { id: "shared", label: "Shared Documents", icon: Users },
  ];

  const storageUsedMB = (storageUsedBytes / (1024 * 1024)).toFixed(1);
  const storageMaxMB = (storageMaxBytes / (1024 * 1024)).toFixed(0);
  const usagePercent = Math.min(100, Math.round((storageUsedBytes / storageMaxBytes) * 100));

  return (
    <aside
      className={`sidebar-root ${collapsed ? "sidebar-collapsed" : ""}`}
      aria-label="Sidebar navigation"
    >
      {/* Brand Header */}
      <div className="sidebar-header">
        <Link href="/" className="sidebar-brand">
          <div className="brand-logo-icon">
            <FileStack size={19} className="brand-icon-svg" />
            <div className="brand-dot-pulse" />
          </div>
          {!collapsed && (
            <span className="brand-name">
              paper<span className="brand-highlight">pilot</span>
              <span className="brand-tag">PRO</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="sidebar-collapse-btn"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-title">
          {!collapsed && <span>WORKSPACE</span>}
        </div>
        <ul className="sidebar-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-icon-wrap">
                    <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} />
                  </span>
                  {!collapsed && (
                    <>
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={`nav-item-badge ${typeof item.badge === "string" ? "badge-text" : ""}`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Storage and Plan Card */}
      {!collapsed && (
        <div className="sidebar-storage-card">
          <div className="storage-card-header">
            <div className="storage-icon-title">
              <HardDrive size={15} className="storage-icon" />
              <span className="storage-title">Cloud Storage</span>
            </div>
            <span className="storage-fraction">
              {storageUsedMB} / {storageMaxMB} MB
            </span>
          </div>
          <div className="storage-progress-bg">
            <div
              className="storage-progress-bar"
              style={{ width: `${Math.max(4, usagePercent)}%` }}
            />
          </div>
          <div className="storage-card-footer">
            <span className="storage-tier-badge">Free Tier</span>
            <button
              type="button"
              className="storage-upgrade-link"
              onClick={() => alert("PaperPilot Pro upgrades are opening soon!")}
            >
              Upgrade <Sparkles size={12} />
            </button>
          </div>
        </div>
      )}

      {/* User Account Footer */}
      <div className="sidebar-user-footer">
        <Link href="/account" className="user-profile-card" title="View Account">
          <div className="user-avatar">
            {userEmail ? userEmail.charAt(0).toUpperCase() : <User size={16} />}
          </div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-name">
                {userEmail ? userEmail.split("@")[0] : "Document Studio"}
              </span>
              <span className="user-plan">
                {userEmail ? "Account Synced" : "Local Workspace"}
              </span>
            </div>
          )}
          {!collapsed && <ChevronRight size={14} className="user-card-arrow" />}
        </Link>
      </div>
    </aside>
  );
}
