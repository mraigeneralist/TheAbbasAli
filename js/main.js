// ── Homepage: Load & Display Published Posts ────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadPosts();
});

async function loadPosts() {
  const list = document.getElementById('posts-list');
  const countEl = document.getElementById('post-count');
  const emptyEl = document.getElementById('empty-state');

  if (!list) return;

  list.innerHTML = `<p class="loading">Loading articles…</p>`;

  const { data: posts, error } = await db
    .from('posts')
    .select('id, title, excerpt, content, slug, created_at, published')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="loading">Failed to load posts.</p>`;
    console.error(error);
    return;
  }

  if (!posts || posts.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (countEl) countEl.textContent = '0 articles';
    return;
  }

  if (countEl) countEl.textContent = `${posts.length} article${posts.length !== 1 ? 's' : ''}`;

  // Fetch like counts for all posts
  const postIds = posts.map(p => p.id);
  const { data: likes } = await db
    .from('likes')
    .select('post_id')
    .in('post_id', postIds);

  const likeCounts = {};
  (likes || []).forEach(l => {
    likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
  });

  // Fetch comment counts
  const { data: comments } = await db
    .from('comments')
    .select('post_id')
    .in('post_id', postIds);

  const commentCounts = {};
  (comments || []).forEach(c => {
    commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;
  });

  list.innerHTML = posts.map((post, i) => {
    const excerpt = post.excerpt || htmlToExcerpt(post.content, 150);
    const num = String(posts.length - i).padStart(2, '0');
    const lc = likeCounts[post.id] || 0;
    const cc = commentCounts[post.id] || 0;

    return `
      <article class="post-card fade-up fade-up-${Math.min(i + 1, 4)}"
               onclick="window.location.href='post.html?slug=${post.slug}'">
        <div class="post-card__num">${num}</div>
        <div class="post-card__body">
          <div class="post-card__meta">${formatDate(post.created_at)}</div>
          <h2 class="post-card__title">${escapeHtml(post.title)}</h2>
          <p class="post-card__excerpt">${escapeHtml(excerpt)}</p>
          <div class="post-card__stats">
            <span>♥ ${lc}</span>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${cc}</span>
          </div>
        </div>
        <div class="post-card__arrow">→</div>
      </article>
    `;
  }).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}
