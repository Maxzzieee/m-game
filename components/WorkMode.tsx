"use client";

import { useEffect, useState } from "react";

// "Work Mode" — a skin toggle, like light/dark, except it repaints the whole
// game into a dull documents app so you can play at your desk without anyone
// clocking it. The real game runs untouched underneath; this only sets
// data-skin="work" on <html> (the palette + fonts follow, see globals.css) and
// lays a fake document toolbar over the top. The choice persists per browser.

type Skin = "game" | "work";
const KEY = "sls-skin";
const DOC_TITLE = "Q3_Notes.docx - Docs";

export default function WorkMode() {
  const [skin, setSkin] = useState<Skin>("game");
  const [ready, setReady] = useState(false);

  // restore the saved preference on load
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved === "work") setSkin("work");
    setReady(true);
  }, []);

  // apply the skin to the document + persist + swap the browser-tab title
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    if (skin === "work") {
      root.setAttribute("data-skin", "work");
      document.title = DOC_TITLE;
    } else {
      root.removeAttribute("data-skin");
      document.title = "Singapore Life Sim";
    }
    localStorage.setItem(KEY, skin);
  }, [skin, ready]);

  const work = skin === "work";
  const toggle = () => setSkin((s) => (s === "work" ? "game" : "work"));

  return (
    <>
      {work ? (
        // Fake document toolbar. The round "account" avatar on the right is the
        // discreet way back to the game — looks like a profile pic in Docs.
        <div className="wm-bar" role="presentation">
          <div className="wm-bar-left">
            <svg className="wm-bar-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4" />
              <rect x="7" y="7" width="10" height="1.5" fill="#fff" />
              <rect x="7" y="10.5" width="10" height="1.5" fill="#fff" />
              <rect x="7" y="14" width="7" height="1.5" fill="#fff" />
            </svg>
            <span className="wm-bar-name">Q3_Notes.docx</span>
            <span className="wm-bar-menu">
              <span>File</span><span>Edit</span><span>View</span>
              <span>Insert</span><span>Format</span><span>Tools</span>
            </span>
          </div>
          <div className="wm-bar-right">
            <button className="wm-bar-share" type="button" tabIndex={-1}>Share</button>
            <button
              className="wm-bar-avatar"
              onClick={toggle}
              type="button"
              title="Account"
              aria-label="Exit work mode"
            >
              A
            </button>
          </div>
        </div>
      ) : (
        // Game skin: a clear, low-key pill to switch into Work Mode.
        <button className="wm-toggle" onClick={toggle} type="button" aria-label="Switch to work mode">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M3 13h18" />
          </svg>
          Work mode
        </button>
      )}

      <style>{`
        .wm-toggle {
          position: fixed; right: 14px; bottom: 14px; z-index: 30;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 13px 7px 11px; border-radius: 999px;
          border: 1px solid rgb(var(--c-border)); background: rgb(var(--c-surface));
          color: rgb(var(--c-dim)); font-family: var(--skin-font-mono);
          font-size: 11px; letter-spacing: 0.03em; cursor: pointer;
          box-shadow: 0 1px 2px rgba(20,20,20,0.06), 0 8px 20px -14px rgba(20,20,20,0.4);
          opacity: 0.72; transition: opacity .18s, border-color .18s, color .18s;
        }
        .wm-toggle:hover { opacity: 1; color: rgb(var(--c-text)); border-color: rgb(var(--c-dim) / .5); }

        .wm-bar {
          position: fixed; top: 0; left: 0; right: 0; height: 46px; z-index: 30;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 14px; background: #ffffff; border-bottom: 1px solid #e8eaed;
          font-family: Arial, "Helvetica Neue", system-ui, sans-serif;
          user-select: none;
        }
        .wm-bar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .wm-bar-logo { flex: none; }
        .wm-bar-name { font-size: 15px; color: #202124; white-space: nowrap; }
        .wm-bar-menu { display: flex; gap: 13px; color: #5f6368; font-size: 13px; }
        .wm-bar-right { display: flex; align-items: center; gap: 12px; flex: none; }
        .wm-bar-share {
          display: inline-flex; align-items: center; gap: 6px;
          background: #c2e7ff; color: #001d35; border: none; border-radius: 18px;
          padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: default;
          font-family: inherit;
        }
        .wm-bar-avatar {
          width: 30px; height: 30px; border-radius: 50%; border: none;
          background: #188038; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        @media (max-width: 640px) {
          .wm-bar-menu { display: none; }
          .wm-bar-share { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wm-toggle { transition: none; }
        }
      `}</style>
    </>
  );
}
