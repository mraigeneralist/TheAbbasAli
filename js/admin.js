// ── Admin Panel ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Check if logged in via Supabase Auth
  const loggedIn = await isAdmin();
  if (!loggedIn) { window.location.href = 'login.html'; return; }

  initAdmin();
});

let editingPostId = null;

function initAdmin() {
  const page = getParam('page') || 'posts';
  showPage(page);

  // Nav links
  document.querySelectorAll('.admin-nav a[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const p = link.dataset.page;
      history.pushState({}, '', `admin.html?page=${p}`);
      showPage(p);
    });
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await adminLogout();
    window.location.href = 'index.html';
  });
}

function showPage(page) {
  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-nav a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  const target = document.getElementById(`page-${page}`);
  if (target) target.style.display = 'block';

  if (page === 'posts') loadAdminPosts();
  if (page === 'new') initEditor();
  if (page === 'comments') loadAdminComments();
}

// ── Rich Text Editor ─────────────────────────────────────────────────
function initEditor(post = null) {
  editingPostId = post ? post.id : null;

  if (post) {
    document.getElementById('post-title-input').value = post.title;
    document.getElementById('post-excerpt-input').value = post.excerpt || '';
    document.getElementById('editor').innerHTML = post.content;
    document.getElementById('publish-toggle').checked = post.published;
    document.getElementById('page-new-title').textContent = 'Edit Article';
  } else {
    document.getElementById('post-title-input').value = '';
    document.getElementById('post-excerpt-input').value = '';
    document.getElementById('editor').innerHTML = '';
    document.getElementById('publish-toggle').checked = true;
    document.getElementById('page-new-title').textContent = 'New Article';
  }
}

// Toolbar commands
document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.val || null;
    document.execCommand(cmd, false, val);
    document.getElementById('editor').focus();
  });
});

document.getElementById('toolbar-h2')?.addEventListener('mousedown', e => {
  e.preventDefault();
  document.execCommand('formatBlock', false, 'h2');
  document.getElementById('editor').focus();
});

document.getElementById('toolbar-h3')?.addEventListener('mousedown', e => {
  e.preventDefault();
  document.execCommand('formatBlock', false, 'h3');
  document.getElementById('editor').focus();
});

document.getElementById('toolbar-p')?.addEventListener('mousedown', e => {
  e.preventDefault();
  document.execCommand('formatBlock', false, 'p');
  document.getElementById('editor').focus();
});

document.getElementById('toolbar-link')?.addEventListener('mousedown', e => {
  e.preventDefault();
  const url = prompt('Enter URL:');
  if (url) document.execCommand('createLink', false, url);
  document.getElementById('editor').focus();
});

document.getElementById('toolbar-quote')?.addEventListener('mousedown', e => {
  e.preventDefault();
  document.execCommand('formatBlock', false, 'blockquote');
  document.getElementById('editor').focus();
});

document.getElementById('toolbar-hr')?.addEventListener('mousedown', e => {
  e.preventDefault();
  document.execCommand('insertHorizontalRule', false, null);
  document.getElementById('editor').focus();
});

// ── Save / Publish ────────────────────────────────────────────────────
document.getElementById('save-btn')?.addEventListener('click', () => savePost());
document.getElementById('save-draft-btn')?.addEventListener('click', () => savePost(true));

async function savePost(forceDraft = false) {
  const title = document.getElementById('post-title-input').value.trim();
  const excerpt = document.getElementById('post-excerpt-input').value.trim();
  const content = document.getElementById('editor').innerHTML.trim();
  const published = forceDraft ? false : document.getElementById('publish-toggle').checked;

  if (!title) { showToast('Please add a title.', 'error'); return; }
  if (!content || content === '<br>') { showToast('Content cannot be empty.', 'error'); return; }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const payload = {
    title,
    excerpt: excerpt || htmlToExcerpt(content, 200),
    content,
    published,
    slug: slugify(title) + '-' + Date.now().toString(36),
    updated_at: new Date().toISOString()
  };

  let error;
  if (editingPostId) {
    const result = await db.from('posts').update(payload).eq('id', editingPostId);
    error = result.error;
  } else {
    const result = await db.from('posts').insert({ ...payload, created_at: new Date().toISOString() });
    error = result.error;
  }

  if (!error) {
    showToast(published ? 'Article published!' : 'Saved as draft.');
    setTimeout(() => {
      history.pushState({}, '', 'admin.html?page=posts');
      showPage('posts');
    }, 1200);
  } else {
    showToast('Error saving post.', 'error');
    console.error(error);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Publish';
}

// ── Posts List ────────────────────────────────────────────────────────
async function loadAdminPosts() {
  const container = document.getElementById('admin-posts-table');
  if (!container) return;
  container.innerHTML = `<p class="loading">Loading…</p>`;

  const { data: posts, error } = await db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !posts) {
    container.innerHTML = `<p class="loading">Failed to load posts.</p>`;
    return;
  }

  if (posts.length === 0) {
    container.innerHTML = `<p class="loading">No posts yet. Create your first article.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="posts-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${posts.map(post => `
          <tr>
            <td>${escapeHtml(post.title)}</td>
            <td>
              <span class="status-badge ${post.published ? 'published' : 'draft'}">
                ${post.published ? 'Published' : 'Draft'}
              </span>
            </td>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--white-dim)">
              ${formatDate(post.created_at)}
            </td>
            <td>
              <div class="table-actions">
                <button onclick="editPost('${post.id}')">Edit</button>
                <button onclick="viewPost('${post.slug}')">View</button>
                <button class="del" onclick="deletePost('${post.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function editPost(id) {
  const { data: post } = await db.from('posts').select('*').eq('id', id).single();
  if (!post) return;
  initEditor(post);
  history.pushState({}, '', 'admin.html?page=new');
  showPage('new');
}

function viewPost(slug) {
  window.open(`post.html?slug=${slug}`, '_blank');
}

async function deletePost(id) {
  if (!confirm('Delete this article permanently?')) return;
  const { error } = await db.from('posts').delete().eq('id', id);
  if (!error) {
    showToast('Article deleted.');
    loadAdminPosts();
  } else {
    showToast('Failed to delete.', 'error');
  }
}

// ── Comments Management ───────────────────────────────────────────────
async function loadAdminComments() {
  const container = document.getElementById('admin-comments-list');
  if (!container) return;
  container.innerHTML = `<p class="loading">Loading…</p>`;

  const { data: comments, error } = await db
    .from('comments')
    .select('*, posts(title)')
    .order('created_at', { ascending: false });

  if (error || !comments || comments.length === 0) {
    container.innerHTML = `<p class="loading">${error ? 'Failed to load.' : 'No comments yet.'}</p>`;
    return;
  }

  container.innerHTML = `
    <table class="posts-table">
      <thead>
        <tr>
          <th>Author</th>
          <th>Comment</th>
          <th>Post</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${comments.map(c => `
          <tr>
            <td style="font-family:'Playfair Display',serif">${escapeHtml(c.name)}</td>
            <td style="max-width:300px;font-size:0.85rem;color:var(--white-dim)">${escapeHtml(c.body.slice(0, 80))}${c.body.length > 80 ? '…' : ''}</td>
            <td style="font-size:0.8rem;color:var(--white-dim)">${escapeHtml(c.posts?.title || '—')}</td>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:0.68rem;color:var(--border-hover)">${formatDate(c.created_at)}</td>
            <td>
              <div class="table-actions">
                <button class="del" onclick="deleteComment('${c.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  const { error } = await db.from('comments').delete().eq('id', id);
  if (!error) {
    showToast('Comment deleted.');
    loadAdminComments();
  } else {
    showToast('Failed to delete.', 'error');
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}