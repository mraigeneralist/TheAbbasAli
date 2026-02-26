// ── Admin Panel ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const loggedIn = await isAdmin();
  if (!loggedIn) { window.location.href = 'login.html'; return; }
  initAdmin();
});

let editingPostId = null;

function initAdmin() {
  const page = getParam('page') || 'posts';
  showPage(page);

  document.querySelectorAll('.admin-nav a[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const p = link.dataset.page;
      history.pushState({}, '', `admin.html?page=${p}`);
      showPage(p);
    });
  });

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

// ════════════════════════════════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════════════════════════════════

function initEditor(post = null) {
  editingPostId = post ? post.id : null;
  const editor = document.getElementById('editor');

  if (post) {
    document.getElementById('post-title-input').value = post.title;
    document.getElementById('post-excerpt-input').value = post.excerpt || '';
    editor.innerHTML = post.content;
    document.getElementById('publish-toggle').checked = post.published;
    document.getElementById('page-new-title').textContent = 'Edit Article';
  } else {
    document.getElementById('post-title-input').value = '';
    document.getElementById('post-excerpt-input').value = '';
    editor.innerHTML = '';
    document.getElementById('publish-toggle').checked = true;
    document.getElementById('page-new-title').textContent = 'New Article';
  }

  initSlashMenu();
  initAutoEmbed();
}

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

// ════════════════════════════════════════════════════════════════════
// SLASH COMMAND MENU
// ════════════════════════════════════════════════════════════════════

let slashMenuOpen = false;
let slashStartNode = null;
let slashStartOffset = 0;
let selectedSlashIndex = 0;

const slashCommands = [
  { action: 'text',    name: 'Text' },
  { action: 'h2',      name: 'Heading 1' },
  { action: 'h3',      name: 'Heading 2' },
  { action: 'h4',      name: 'Heading 3' },
  { action: 'quote',   name: 'Quote' },
  { action: 'code',    name: 'Code Block' },
  { action: 'divider', name: 'Divider' },
  { action: 'ul',      name: 'Bullet List' },
  { action: 'ol',      name: 'Numbered List' },
  { action: 'image',   name: 'Image' },
  { action: 'embed',   name: 'Embed' },
];

function initSlashMenu() {
  const editor = document.getElementById('editor');
  const menu = document.getElementById('slash-menu');

  // Remove old listeners by cloning
  const newEditor = editor.cloneNode(true);
  editor.parentNode.replaceChild(newEditor, editor);
  const ed = document.getElementById('editor');

  ed.addEventListener('keydown', handleEditorKeydown);
  ed.addEventListener('input', handleEditorInput);
  ed.addEventListener('paste', handleEditorPaste);

  // Slash menu item clicks
  menu.querySelectorAll('.slash-item').forEach((item, i) => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      executeSlashCommand(item.dataset.action);
    });
  });

  // Close menu on outside click
  document.addEventListener('mousedown', e => {
    if (!menu.contains(e.target)) closeSlashMenu();
  });
}

function handleEditorInput(e) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const text = range.startContainer.textContent || '';
  const offset = range.startOffset;
  const textBeforeCursor = text.slice(0, offset);

  // Detect '/' at start of line or after whitespace
  const slashMatch = textBeforeCursor.match(/(^|\s)\/([^/]*)$/);

  if (slashMatch) {
    slashStartNode = range.startContainer;
    slashStartOffset = offset - slashMatch[0].length + (slashMatch[1] ? 1 : 0);
    const query = slashMatch[2].toLowerCase();
    openSlashMenu(query, range);
  } else {
    closeSlashMenu();
  }
}

function handleEditorKeydown(e) {
  const menu = document.getElementById('slash-menu');

  if (slashMenuOpen) {
    const items = [...menu.querySelectorAll('.slash-item')].filter(i => i.style.display !== 'none');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSlashIndex = (selectedSlashIndex + 1) % items.length;
      updateSlashSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSlashIndex = (selectedSlashIndex - 1 + items.length) % items.length;
      updateSlashSelection(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = items[selectedSlashIndex];
      if (selected) executeSlashCommand(selected.dataset.action);
    } else if (e.key === 'Escape') {
      closeSlashMenu();
    }
    return;
  }

  // Enter key on empty line — keep clean paragraphs
  if (e.key === 'Enter' && !e.shiftKey) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
  }
}

function openSlashMenu(query, range) {
  const menu = document.getElementById('slash-menu');
  const items = menu.querySelectorAll('.slash-item');

  // Filter items
  let visibleCount = 0;
  items.forEach(item => {
    const name = item.querySelector('.slash-item-name').textContent.toLowerCase();
    const show = !query || name.includes(query);
    item.style.display = show ? 'flex' : 'none';
    if (show) visibleCount++;
  });

  if (visibleCount === 0) { closeSlashMenu(); return; }

  // Show menu first so we can measure it
  menu.classList.add('visible');
  slashMenuOpen = true;

  // Position menu near cursor
  const rect = range.getBoundingClientRect();
  const menuH = menu.offsetHeight;
  const menuW = menu.offsetWidth;
  const viewH = window.innerHeight;
  const viewW = window.innerWidth;

  // Prefer below cursor, but flip above if not enough space
  let top = rect.bottom + 6;
  if (top + menuH > viewH - 10) top = rect.top - menuH - 6;
  if (top < 10) top = 10;

  let left = rect.left;
  if (left + menuW > viewW - 10) left = viewW - menuW - 10;
  if (left < 10) left = 10;

  menu.style.top = top + 'px';
  menu.style.left = left + 'px';

  selectedSlashIndex = 0;
  updateSlashSelection(menu.querySelectorAll('.slash-item:not([style*="display: none"])'));
}

function closeSlashMenu() {
  const menu = document.getElementById('slash-menu');
  menu.classList.remove('visible');
  slashMenuOpen = false;
  selectedSlashIndex = 0;
}

function updateSlashSelection(items) {
  document.querySelectorAll('.slash-item').forEach(i => i.classList.remove('selected'));
  if (items[selectedSlashIndex]) items[selectedSlashIndex].classList.add('selected');
}

function deleteSlashTrigger() {
  // Delete the '/' and any query text typed after it
  if (!slashStartNode) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = document.createRange();
  range.setStart(slashStartNode, slashStartOffset);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  range.deleteContents();
}

function executeSlashCommand(action) {
  closeSlashMenu();
  deleteSlashTrigger();
  const editor = document.getElementById('editor');
  editor.focus();

  switch (action) {
    case 'text':
      document.execCommand('formatBlock', false, 'p');
      break;
    case 'h2':
      document.execCommand('formatBlock', false, 'h2');
      break;
    case 'h3':
      document.execCommand('formatBlock', false, 'h3');
      break;
    case 'h4':
      document.execCommand('formatBlock', false, 'h4');
      break;
    case 'quote':
      document.execCommand('formatBlock', false, 'blockquote');
      break;
    case 'divider':
      document.execCommand('insertHorizontalRule', false, null);
      // Move cursor after HR
      const hrSel = window.getSelection();
      if (hrSel.rangeCount) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        hrSel.getRangeAt(0).insertNode(p);
        const r = document.createRange();
        r.setStart(p, 0);
        hrSel.removeAllRanges();
        hrSel.addRange(r);
      }
      break;
    case 'ul':
      document.execCommand('insertUnorderedList', false, null);
      break;
    case 'ol':
      document.execCommand('insertOrderedList', false, null);
      break;
    case 'code':
      insertCodeBlock();
      break;
    case 'image':
      triggerImageUpload();
      break;
    case 'embed':
      triggerEmbedPrompt();
      break;
  }
}

// ── Code Block ────────────────────────────────────────────────────────
function insertCodeBlock() {
  const editor = document.getElementById('editor');
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const block = document.createElement('pre');
  block.className = 'code-block';
  block.contentEditable = 'true';
  block.setAttribute('data-block', 'code');

  const after = document.createElement('p');
  after.innerHTML = '<br>';

  sel.getRangeAt(0).insertNode(after);
  after.parentNode.insertBefore(block, after);

  // Focus the code block
  const r = document.createRange();
  r.setStart(block, 0);
  sel.removeAllRanges();
  sel.addRange(r);
  block.focus();
}

// ── Image Upload ──────────────────────────────────────────────────────
function triggerImageUpload() {
  const input = document.getElementById('image-upload-input');
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      insertImageBlock(ev.target.result, file.name);
    };
    reader.readAsDataURL(file);
    input.value = '';
  };
  input.click();
}

function insertImageBlock(src, alt) {
  const editor = document.getElementById('editor');
  const sel = window.getSelection();
  if (!sel.rangeCount) { editor.focus(); }

  const wrapper = document.createElement('div');
  wrapper.className = 'image-block';
  wrapper.contentEditable = 'false';

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';

  const caption = document.createElement('div');
  caption.className = 'image-caption';
  caption.contentEditable = 'true';

  wrapper.appendChild(img);
  wrapper.appendChild(caption);

  const after = document.createElement('p');
  after.innerHTML = '<br>';

  const range = sel.rangeCount ? sel.getRangeAt(0) : null;
  if (range) {
    range.insertNode(after);
    after.parentNode.insertBefore(wrapper, after);
  } else {
    editor.appendChild(wrapper);
    editor.appendChild(after);
  }

  // Move cursor to after block
  const r = document.createRange();
  r.setStart(after, 0);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ════════════════════════════════════════════════════════════════════
// AUTO-EMBED (YouTube + X/Twitter)
// ════════════════════════════════════════════════════════════════════

function initAutoEmbed() {
  const editor = document.getElementById('editor');
  editor.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const text = (node.textContent || '').trim();

      const ytId = getYouTubeId(text);
      const tweetId = getTwitterId(text);

      if (ytId) {
        e.preventDefault();
        replaceNodeWithEmbed(node, buildYouTubeEmbed(ytId));
      } else if (tweetId) {
        e.preventDefault();
        replaceNodeWithEmbed(node, buildTwitterEmbed(tweetId, text));
      }
    }
  });
}

function handleEditorPaste(e) {
  // Check if pasted content is a plain URL
  const text = (e.clipboardData || window.clipboardData).getData('text/plain').trim();
  const ytId = getYouTubeId(text);
  const tweetId = getTwitterId(text);

  if (ytId || tweetId) {
    e.preventDefault();
    // Insert as plain text first, then auto-convert on Enter
    document.execCommand('insertText', false, text);
  }
}

function getYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function getTwitterId(url) {
  const m = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return m ? m[1] : null;
}

function buildYouTubeEmbed(id) {
  const wrapper = document.createElement('div');
  wrapper.className = 'embed-wrapper';
  wrapper.contentEditable = 'false';

  const label = document.createElement('span');
  label.className = 'embed-label';
  label.textContent = 'YouTube';

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}`;
  iframe.height = '400';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;

  wrapper.appendChild(label);
  wrapper.appendChild(iframe);
  return wrapper;
}

function buildTwitterEmbed(id, url) {
  const wrapper = document.createElement('div');
  wrapper.className = 'embed-wrapper';
  wrapper.contentEditable = 'false';
  wrapper.style.padding = '16px';

  const label = document.createElement('span');
  label.className = 'embed-label';
  label.textContent = 'X / Twitter';

  // Use Twitter oEmbed widget
  const blockquote = document.createElement('blockquote');
  blockquote.className = 'twitter-tweet';
  blockquote.setAttribute('data-theme', 'dark');

  const a = document.createElement('a');
  a.href = url;
  blockquote.appendChild(a);

  wrapper.appendChild(label);
  wrapper.appendChild(blockquote);

  // Load Twitter widget script if not already loaded
  if (!document.getElementById('twitter-widget-script')) {
    const script = document.createElement('script');
    script.id = 'twitter-widget-script';
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    document.body.appendChild(script);
  } else if (window.twttr) {
    setTimeout(() => window.twttr.widgets.load(), 300);
  }

  return wrapper;
}

function replaceNodeWithEmbed(node, embedEl) {
  const editor = document.getElementById('editor');

  // Find the block-level parent
  let block = node;
  while (block.parentNode !== editor && block.parentNode) {
    block = block.parentNode;
  }

  const after = document.createElement('p');
  after.innerHTML = '<br>';

  block.parentNode.insertBefore(embedEl, block);
  block.parentNode.insertBefore(after, block);
  block.parentNode.removeChild(block);

  // Move cursor to paragraph after embed
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(after, 0);
  sel.removeAllRanges();
  sel.addRange(r);
}

function triggerEmbedPrompt() {
  const url = prompt('Paste a YouTube or X/Twitter URL:');
  if (!url) return;

  const ytId = getYouTubeId(url.trim());
  const tweetId = getTwitterId(url.trim());

  if (ytId) {
    insertEmbedAtCursor(buildYouTubeEmbed(ytId));
  } else if (tweetId) {
    insertEmbedAtCursor(buildTwitterEmbed(tweetId, url.trim()));
  } else {
    showToast('Not a valid YouTube or X/Twitter URL.', 'error');
  }
}

function insertEmbedAtCursor(embedEl) {
  const editor = document.getElementById('editor');
  const sel = window.getSelection();
  const after = document.createElement('p');
  after.innerHTML = '<br>';

  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.insertNode(after);
    after.parentNode.insertBefore(embedEl, after);
  } else {
    editor.appendChild(embedEl);
    editor.appendChild(after);
  }

  const r = document.createRange();
  r.setStart(after, 0);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ════════════════════════════════════════════════════════════════════
// POSTS LIST
// ════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════════════════════

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