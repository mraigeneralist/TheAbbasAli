// ── Supabase Configuration ──────────────────────────────────────────
// These are SAFE to be public — Supabase designed them this way.
// Security is handled by Row Level Security (RLS) policies in Supabase.

const SUPABASE_URL = 'https://ygeipufauotbxodawyoc.supabase.co';       // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZWlwdWZhdW90YnhvZGF3eW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODk5ODYsImV4cCI6MjA4NzY2NTk4Nn0.H2DC5TEQYE4rTI5YojDaH_MW21IwmlY5baqw34n8fSQ'; // The long "anon public" key

// ── Initialize Supabase Client ──────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth Helpers ────────────────────────────────────────────────────
async function isAdmin() {
  const { data: { session } } = await db.auth.getSession();
  return session !== null;
}

async function adminLogin(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return false;
  return true;
}

async function adminLogout() {
  await db.auth.signOut();
}

// ── Toast Notifications ─────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Date Formatter ──────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Slug Generator ──────────────────────────────────────────────────
function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ── Get URL Param ────────────────────────────────────────────────────
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ── Excerpt from HTML ────────────────────────────────────────────────
function htmlToExcerpt(html, length = 160) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  return text.length > length ? text.slice(0, length).trim() + '…' : text;
}