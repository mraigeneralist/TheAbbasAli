// ── Single Post: Read, Like, Comment ────────────────────────────────

let currentPost = null;

document.addEventListener('DOMContentLoaded', async () => {
  const slug = getParam('slug');
  if (!slug) { window.location.href = 'index.html'; return; }
  await loadPost(slug);
});

async function loadPost(slug) {
  const { data: post, error } = await db
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !post) {
    document.getElementById('post-container').innerHTML =
      `<div class="container" style="padding:80px 0"><p class="loading">Post not found.</p></div>`;
    return;
  }

  currentPost = post;
  document.title = `${post.title} — TheAIGeneralist`;

  // Set meta
  document.getElementById('post-title').textContent = post.title;
  document.getElementById('post-date').textContent = formatDate(post.created_at);
  document.getElementById('post-content').innerHTML = post.content;

  if (post.excerpt) {
    document.getElementById('post-excerpt').textContent = post.excerpt;
    document.getElementById('post-excerpt').style.display = '';
  }

  // Load likes
  await loadLikes(post.id);

  // Load comments
  await loadComments(post.id);

  // Show everything
  document.getElementById('post-container').style.opacity = '1';
  document.getElementById('post-container').style.animation = 'fadeUp 0.5s ease forwards';
}

// ── Likes ────────────────────────────────────────────────────────────
async function loadLikes(postId) {
  const { count } = await db
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);

  updateLikeUI(count || 0);

  // Check if this browser already liked
  const likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');
  if (likedPosts.includes(postId)) {
    document.getElementById('like-btn').classList.add('liked');
    document.getElementById('like-btn').disabled = true;
  }
}

function updateLikeUI(count) {
  document.getElementById('like-count').textContent =
    `${count} ${count === 1 ? 'like' : 'likes'}`;
}

document.getElementById('like-btn')?.addEventListener('click', async () => {
  if (!currentPost) return;

  const likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');
  if (likedPosts.includes(currentPost.id)) return;

  const btn = document.getElementById('like-btn');
  btn.disabled = true;

  const { error } = await db.from('likes').insert({ post_id: currentPost.id });

  if (!error) {
    likedPosts.push(currentPost.id);
    localStorage.setItem('liked_posts', JSON.stringify(likedPosts));
    btn.classList.add('liked');
    await loadLikes(currentPost.id);
    showToast('Thanks for the love ♥');
  } else {
    btn.disabled = false;
  }
});

// ── Comments ─────────────────────────────────────────────────────────
async function loadComments(postId) {
  const { data: comments, error } = await db
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  const list = document.getElementById('comments-list');
  const countEl = document.getElementById('comment-count');

  if (error || !comments || comments.length === 0) {
    list.innerHTML = `<p class="no-comments">No comments yet. Be the first.</p>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = `(${comments.length})`;

  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(c.name)}</span>
        <span class="comment-date">${formatDate(c.created_at)}</span>
      </div>
      <p class="comment-text">${escapeHtml(c.body)}</p>
    </div>
  `).join('');
}

// Comment form submission
document.getElementById('comment-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPost) return;

  const name = document.getElementById('comment-name').value.trim();
  const body = document.getElementById('comment-body').value.trim();

  if (!name || !body) return;

  const submitBtn = document.getElementById('comment-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';

  const { error } = await db.from('comments').insert({
    post_id: currentPost.id,
    name,
    body
  });

  if (!error) {
    document.getElementById('comment-name').value = '';
    document.getElementById('comment-body').value = '';
    await loadComments(currentPost.id);
    showToast('Comment posted!');
  } else {
    showToast('Failed to post comment.', 'error');
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Post Comment';
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}
