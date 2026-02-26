# TheAbbasAli — Personal Blog

A minimal, dark-themed personal blog with admin controls, likes, and comments.

---

## 🚀 Setup Guide

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **"New Project"**, give it a name like `theabbasali-blog`
3. Wait for it to set up (~1 minute)

### 2. Create the Database Tables

In Supabase, go to **SQL Editor** and run this:

```sql
-- Posts table
create table posts (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  slug text not null unique,
  content text not null,
  excerpt text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Likes table
create table likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  created_at timestamptz default now()
);

-- Comments table
create table comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz default now()
);

-- Allow public read/write (for likes and comments from anonymous users)
alter table posts enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;

create policy "Public can read published posts" on posts
  for select using (published = true);

create policy "Public can insert likes" on likes
  for insert with check (true);

create policy "Public can read likes" on likes
  for select using (true);

create policy "Public can insert comments" on comments
  for insert with check (true);

create policy "Public can read comments" on comments
  for select using (true);

create policy "Public can delete comments" on comments
  for delete using (true);

-- Admin can do everything on posts
create policy "Admin full access posts" on posts
  for all using (true);

create policy "Admin full access likes" on likes
  for all using (true);

create policy "Admin full access comments" on comments
  for all using (true);
```

### 3. Get Your API Keys

In Supabase: **Project Settings → API**

Copy:
- **Project URL** (looks like `https://xxxx.supabase.co`)
- **anon public** key (long string starting with `eyJ...`)

### 4. Configure the Blog

Open `js/supabase.js` and fill in:

```javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
const ADMIN_PASSWORD = 'your-strong-password-here';
```

### 5. Deploy to GitHub Pages

1. Push all files to your GitHub repo
2. Go to repo **Settings → Pages**
3. Set Source: **Deploy from a branch → main → / (root)**
4. Your blog will be live at `https://yourusername.github.io/repo-name`

---

## 📁 File Structure

```
├── index.html       ← Homepage
├── post.html        ← Single article
├── admin.html       ← Your admin dashboard
├── login.html       ← Admin login
├── css/
│   └── style.css    ← All styles
├── js/
│   ├── supabase.js  ← Config + helpers
│   ├── main.js      ← Homepage logic
│   ├── post.js      ← Post + likes + comments
│   └── admin.js     ← Admin panel logic
└── README.md
```

## 🔐 Admin Access

- Visit `/login.html` → enter your password → you're in
- Only you know the password
- Admin link appears in nav when logged in

---

Built with ❤️ — clean, fast, no frameworks.
