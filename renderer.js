/* eslint-env browser */
/* global marked */

const PAPER_COLORS = [
  '#FFE566',
  '#FFD6A5',
  '#FFADAD',
  '#CAFFBF',
  '#9BF6FF',
  '#BDB2FF',
  '#FFC6FF',
  '#FFFFFF',
];

const TEMPLATES = {
  blank: { title: 'New Note', content: '' },
  todo: {
    title: 'To-do',
    content: '- [ ] First task\n- [ ] Second task\n- [ ] Third task\n',
  },
  meeting: {
    title: 'Meeting',
    content:
      '## Agenda\n- \n\n## Notes\n- \n\n## Actions\n- [ ] \n',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const UNDO_MS = 8000;

let notes = [];
let globalReminder = null;
let settings = {
  keepOpen: false,
  theme: 'system',
  view: 'board',
};
let searchQuery = '';
let activeTag = '';
let activeGroup = '';
let highestZIndex = 1;
let undoTimer = null;
let undoNote = null;
const unlockedIds = new Set();
const resizeObservers = [];
let dragState = null;
let persistTimer = null;
let focusedNoteId = null;
const titleEditingIds = new Set();

function debouncePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 300);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toLocalInput(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function highlightText(text, query) {
  const safe = escapeHtml(text || '');
  if (!query) return safe;
  const re = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}

function highlightHtml(html, query) {
  if (!query) return html;
  const re = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return html.replace(re, (match, _group, offset, source) => {
    const before = source.slice(0, offset);
    const open = (before.match(/</g) || []).length;
    const close = (before.match(/>/g) || []).length;
    if (open !== close) return match;
    return `<mark>${match}</mark>`;
  });
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const banned = new Set([
    'SCRIPT',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'LINK',
    'META',
    'STYLE',
    'FORM',
  ]);
  const walk = (node) => {
    [...node.children].forEach((el) => {
      if (banned.has(el.tagName)) {
        el.remove();
        return;
      }
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || val.startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
      walk(el);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function renderMarkdown(content) {
  const raw = window.marked ? marked.parse(content || '') : escapeHtml(content || '');
  return sanitizeHtml(raw);
}

function bytesToB64(bytes) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  arr.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptContent(content, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(content || '')
  );
  return {
    lockSalt: bytesToB64(salt),
    lockIv: bytesToB64(iv),
    ciphertext: bytesToB64(cipher),
  };
}

async function decryptContent(note, password) {
  const key = await deriveKey(password, b64ToBytes(note.lockSalt));
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(note.lockIv) },
    key,
    b64ToBytes(note.ciphertext)
  );
  return new TextDecoder().decode(bytes);
}

function generateRandomColor() {
  return PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)];
}

function getTagColor(tagName) {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#DDA0DD',
    '#F8C471',
    '#82E0AA',
    '#85C1E9',
  ];
  let hash = 0;
  for (let i = 0; i < tagName.length; i += 1) {
    hash = Math.imul(31, hash) + tagName.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getNextZIndex() {
  highestZIndex += 1;
  return highestZIndex;
}

function normalizeNote(raw) {
  return {
    id: raw.id || Date.now(),
    title: typeof raw.title === 'string' ? raw.title : 'Untitled',
    content: typeof raw.content === 'string' ? raw.content : '',
    created: raw.created || Date.now(),
    pinned: Boolean(raw.pinned),
    blurred: Boolean(raw.blurred),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    reminder: raw.reminder || null,
    reminderRepeat: raw.reminderRepeat || 'none',
    group: raw.group || '',
    x: raw.x ?? Math.random() * 200,
    y: raw.y ?? Math.random() * 80,
    width: raw.width,
    height: raw.height,
    color: PAPER_COLORS.includes(raw.color) ? raw.color : raw.color || generateRandomColor(),
    zIndex: raw.zIndex || 1,
    locked: Boolean(raw.locked),
    lockSalt: raw.lockSalt || null,
    lockIv: raw.lockIv || null,
    ciphertext: raw.ciphertext || null,
  };
}

function noteMatchesQuery(note, query) {
  if (!query) return false;
  const q = query.toLowerCase();
  return (
    (note.title || '').toLowerCase().includes(q) ||
    (!(note.locked && !unlockedIds.has(note.id)) &&
      (note.content || '').toLowerCase().includes(q)) ||
    (note.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
    (note.group || '').toLowerCase().includes(q)
  );
}

function filteredNotes() {
  const query = searchQuery.trim().toLowerCase();
  return notes.filter((note) => {
    if (activeTag && !(note.tags || []).some((tag) => tag === activeTag)) return false;
    if (activeGroup && note.group !== activeGroup) return false;
    if (!query) return true;
    return noteMatchesQuery(note, query);
  });
}

function applyTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const themeButton = document.getElementById('theme-button');
  if (themeButton) {
    themeButton.textContent =
      settings.theme === 'system' ? 'System' : settings.theme === 'dark' ? 'Dark' : 'Light';
  }
}

function applyKeepOpenUi() {
  const button = document.getElementById('keep-open-button');
  if (!button) return;
  button.classList.toggle('active', settings.keepOpen);
  button.textContent = settings.keepOpen ? 'Pinned' : 'Keep open';
}

function applyViewUi() {
  const container = document.getElementById('notes-container');
  container.classList.toggle('board-view', settings.view !== 'list');
  container.classList.toggle('list-view', settings.view === 'list');
  document.getElementById('view-board').classList.toggle('active', settings.view !== 'list');
  document.getElementById('view-list').classList.toggle('active', settings.view === 'list');
}

function storePayload() {
  return {
    notes,
    globalReminder,
    settings,
  };
}

async function persist() {
  if (window.api && window.api.saveStore) {
    await window.api.saveStore(storePayload());
    return;
  }
  localStorage.setItem('stickyNotesStore', JSON.stringify(storePayload()));
}

function applyStore(store) {
  notes = (store.notes || []).map(normalizeNote);
  globalReminder = store.globalReminder || null;
  settings = { ...settings, ...(store.settings || {}) };
  if (notes.length) {
    highestZIndex = Math.max(...notes.map((note) => note.zIndex || 1), 1);
  }
}

async function loadAll() {
  if (window.api && window.api.loadStore) {
    const store = await window.api.loadStore();
    applyStore(store);
    const legacy = localStorage.getItem('notes');
    if ((!store.notes || store.notes.length === 0) && legacy) {
      try {
        notes = JSON.parse(legacy).map(normalizeNote);
        const savedGlobal = localStorage.getItem('globalReminder');
        if (savedGlobal) globalReminder = parseInt(savedGlobal, 10);
        await persist();
      } catch (err) {
        console.error(err);
      }
    }
    return;
  }

  const raw = localStorage.getItem('stickyNotesStore');
  if (raw) {
    try {
      applyStore(JSON.parse(raw));
      return;
    } catch (err) {
      console.error(err);
    }
  }
  const legacy = localStorage.getItem('notes');
  if (legacy) {
    try {
      notes = JSON.parse(legacy).map(normalizeNote);
      const savedGlobal = localStorage.getItem('globalReminder');
      if (savedGlobal) globalReminder = parseInt(savedGlobal, 10);
    } catch (err) {
      console.error(err);
    }
  }
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // Audio is optional.
  }
}

function notify(title, body, noteTitle) {
  playChime();
  if (window.api && window.api.showNotification) {
    window.api.showNotification({ title, body, noteTitle });
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function showToast(message, actionLabel, onAction) {
  const toast = document.getElementById('toast');
  toast.classList.remove('hidden');
  toast.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = actionLabel;
    button.addEventListener('click', () => {
      onAction();
      hideToast();
    });
    toast.appendChild(button);
  }
}

function hideToast() {
  const toast = document.getElementById('toast');
  toast.classList.add('hidden');
  toast.innerHTML = '';
}

function uniqueTags() {
  return [...new Set(notes.flatMap((note) => note.tags || []))].sort();
}

function uniqueGroups() {
  return [...new Set(notes.map((note) => note.group).filter(Boolean))].sort();
}

function renderFilters() {
  const tagRow = document.getElementById('tag-filters');
  const groupRow = document.getElementById('group-filters');
  tagRow.innerHTML = '';
  groupRow.innerHTML = '';

  uniqueGroups().forEach((group) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${activeGroup === group ? ' active' : ''}`;
    chip.textContent = group;
    chip.addEventListener('click', () => {
      activeGroup = activeGroup === group ? '' : group;
      render();
    });
    groupRow.appendChild(chip);
  });

  uniqueTags().forEach((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${activeTag === tag ? ' active' : ''}`;
    chip.textContent = tag;
    chip.style.borderColor = getTagColor(tag);
    chip.addEventListener('click', () => {
      activeTag = activeTag === tag ? '' : tag;
      render();
    });
    tagRow.appendChild(chip);
  });
}

function upcomingReminders() {
  const items = notes
    .filter((note) => note.reminder)
    .map((note) => ({
      id: note.id,
      title: note.title,
      at: note.reminder,
      repeat: note.reminderRepeat,
    }))
    .sort((a, b) => a.at - b.at);
  if (globalReminder) {
    items.unshift({
      id: 'global',
      title: 'App reminder',
      at: globalReminder,
      repeat: 'none',
    });
  }
  return items;
}

function renderReminderInbox() {
  const list = document.getElementById('reminder-list');
  const count = document.getElementById('reminder-count');
  const items = upcomingReminders();
  count.textContent = String(items.length);
  count.classList.toggle('hidden', items.length === 0);

  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No upcoming reminders.';
    list.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `reminder-item${item.at <= Date.now() ? ' due' : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = item.title;
    const meta = document.createElement('p');
    meta.textContent = `${new Date(item.at).toLocaleString()}${
      item.repeat && item.repeat !== 'none' ? ` · ${item.repeat}` : ''
    }`;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'toolbar-btn';
    open.textContent = 'Show';
    open.addEventListener('click', () => {
      if (item.id !== 'global') {
        searchQuery = item.title;
        document.getElementById('search-input').value = item.title;
      }
      closePanels();
      render();
    });
    card.append(heading, meta, open);
    list.appendChild(card);
  });
}

function closePanels() {
  document.getElementById('reminder-panel').classList.remove('open');
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('template-menu').classList.add('hidden');
}

function findNote(id) {
  return notes.find((note) => String(note.id) === String(id));
}

function updateNote(id, patch) {
  const note = findNote(id);
  if (!note) return;
  Object.assign(note, patch);
  debouncePersist();
}

function startDrag(event, note, noteEl) {
  if (settings.view === 'list') return;
  const target = event.target;
  if (
    target.closest('input, textarea, button, select, a, .note-toolbar, .color-picker')
  ) {
    return;
  }
  const rect = noteEl.getBoundingClientRect();
  if (event.clientX > rect.right - 18 && event.clientY > rect.bottom - 18) return;

  dragState = {
    note,
    el: noteEl,
    startX: event.clientX,
    startY: event.clientY,
    originX: noteEl.offsetLeft,
    originY: noteEl.offsetTop,
  };
  note.zIndex = getNextZIndex();
  noteEl.style.zIndex = note.zIndex;
  noteEl.classList.add('dragging');
  event.preventDefault();
}

function bindDrag() {
  document.addEventListener('mousemove', (event) => {
    if (!dragState) return;
    const x = Math.max(0, dragState.originX + event.clientX - dragState.startX);
    const y = Math.max(0, dragState.originY + event.clientY - dragState.startY);
    dragState.el.style.left = `${x}px`;
    dragState.el.style.top = `${y}px`;
  });
  document.addEventListener('mouseup', () => {
    if (!dragState) return;
    dragState.note.x = dragState.el.offsetLeft;
    dragState.note.y = dragState.el.offsetTop;
    dragState.el.classList.remove('dragging');
    dragState = null;
    persist();
  });
}

function observeSize(note, noteEl) {
  const observer = new ResizeObserver(() => {
    note.width = Math.round(noteEl.offsetWidth);
    note.height = Math.round(noteEl.offsetHeight);
    debouncePersist();
  });
  observer.observe(noteEl);
  resizeObservers.push(observer);
}

function renderTags(note, host) {
  host.innerHTML = '';
  (note.tags || []).forEach((tag) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.style.backgroundColor = getTagColor(tag);
    span.innerHTML = highlightText(tag, searchQuery);
    span.title = 'Filter by tag';
    span.addEventListener('click', () => {
      activeTag = tag;
      render();
    });
    host.appendChild(span);
  });
}

function focusNoteElement(noteId) {
  focusedNoteId = noteId;
  render();
  const el = document.querySelector(`[data-id="${noteId}"]`);
  if (el) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.add('focused-note');
  }
}

function focusAdjacentNote(direction) {
  const visible = filteredNotes();
  if (!visible.length) return;
  let index = visible.findIndex((note) => note.id === focusedNoteId);
  if (index === -1) index = 0;
  else index = Math.max(0, Math.min(visible.length - 1, index + direction));
  focusNoteElement(visible[index].id);
}

function togglePinFocused() {
  const note = findNote(focusedNoteId);
  if (!note) {
    showToast('Select a note first.');
    setTimeout(hideToast, 1800);
    return;
  }
  note.pinned = !note.pinned;
  persist();
  render();
}

function buildNoteCard(note) {
  const noteEl = document.createElement('article');
  noteEl.className = `note${note.pinned ? ' pinned-note' : ''}${
    focusedNoteId === note.id ? ' focused-note' : ''
  }${searchQuery.trim() && noteMatchesQuery(note, searchQuery.trim()) ? ' search-match' : ''}`;
  noteEl.dataset.id = String(note.id);
  noteEl.style.backgroundColor = note.color || generateRandomColor();
  if (note.width) noteEl.style.width = `${note.width}px`;
  if (note.height) noteEl.style.height = `${note.height}px`;
  if (settings.view !== 'list') {
    noteEl.style.left = `${note.x || 0}px`;
    noteEl.style.top = `${note.y || 0}px`;
  }
  noteEl.style.zIndex = note.zIndex || 1;
  noteEl.addEventListener('mousedown', () => {
    focusedNoteId = note.id;
  });
  noteEl.addEventListener('mousedown', (event) => startDrag(event, note, noteEl));
  observeSize(note, noteEl);

  const details = document.createElement('div');
  details.className = 'note-details hidden';

  const toolbar = document.createElement('div');
  toolbar.className = 'note-toolbar';

  const addTool = (label, title, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-tool';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick(button);
    });
    toolbar.appendChild(button);
    return button;
  };

  addTool(note.pinned ? 'Unpin' : 'Pin', 'Pin to prevent delete', () => {
    note.pinned = !note.pinned;
    persist();
    render();
  });
  addTool(note.blurred ? 'Show' : 'Hide', 'Blur for screen sharing', () => {
    note.blurred = !note.blurred;
    persist();
    render();
  });
  addTool('Due', 'Reminder, tags, color, and group', () => {
    details.classList.toggle('hidden');
    noteEl.classList.add('show-tools');
  });
  addTool(note.locked ? 'Unlock' : 'Lock', 'Lock note content', async () => {
    await toggleLock(note);
    render();
  });
  addTool('Del', 'Delete note', () => deleteNote(note.id));

  const titleWrap = document.createElement('div');
  titleWrap.className = 'note-title-wrap';
  const showTitlePreview = searchQuery.trim() && !titleEditingIds.has(note.id);

  if (showTitlePreview) {
    const titlePreview = document.createElement('button');
    titlePreview.type = 'button';
    titlePreview.className = 'note-title note-title-preview';
    titlePreview.innerHTML = highlightText(note.title, searchQuery.trim());
    titlePreview.title = 'Click to edit title';
    titlePreview.addEventListener('click', (event) => {
      event.stopPropagation();
      titleEditingIds.add(note.id);
      render();
    });
    titleWrap.appendChild(titlePreview);
  } else {
    const titleInput = document.createElement('input');
    titleInput.className = 'note-title';
    titleInput.value = note.title;
    titleInput.addEventListener('input', (event) => {
      updateNote(note.id, { title: event.target.value });
    });
    titleInput.addEventListener('blur', () => {
      titleEditingIds.delete(note.id);
    });
    titleWrap.appendChild(titleInput);
    if (titleEditingIds.has(note.id)) {
      queueMicrotask(() => titleInput.focus());
    }
  }

  const tagsDisplay = document.createElement('div');
  tagsDisplay.className = 'tags-display';
  renderTags(note, tagsDisplay);

  const tagsInput = document.createElement('input');
  tagsInput.className = 'note-tags';
  tagsInput.placeholder = 'Tags: work personal';
  tagsInput.value = (note.tags || []).join(' ');
  tagsInput.addEventListener('input', (event) => {
    const tags = event.target.value.split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
    note.tags = tags;
    renderTags(note, tagsDisplay);
    debouncePersist();
    renderFilters();
  });

  const groupRow = document.createElement('div');
  groupRow.className = 'group-row';
  const groupInput = document.createElement('input');
  groupInput.className = 'note-group';
  groupInput.placeholder = 'Group / folder';
  groupInput.value = note.group || '';
  groupInput.addEventListener('change', (event) => {
    updateNote(note.id, { group: event.target.value.trim() });
    renderFilters();
    render();
  });
  groupRow.appendChild(groupInput);

  const reminderRow = document.createElement('div');
  reminderRow.className = 'reminder-container';
  const reminderInput = document.createElement('input');
  reminderInput.className = 'note-reminder';
  reminderInput.type = 'datetime-local';
  if (note.reminder) {
    reminderInput.value = toLocalInput(note.reminder);
  }
  reminderInput.addEventListener('change', (event) => {
    updateNote(note.id, {
      reminder: event.target.value ? new Date(event.target.value).getTime() : null,
    });
    renderReminderInbox();
  });
  const repeat = document.createElement('select');
  repeat.className = 'note-repeat';
  ['none', 'daily', 'weekly'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'none' ? 'Once' : value;
    if (note.reminderRepeat === value) option.selected = true;
    repeat.appendChild(option);
  });
  repeat.addEventListener('change', (event) => {
    updateNote(note.id, { reminderRepeat: event.target.value });
    renderReminderInbox();
  });
  reminderRow.append(reminderInput, repeat);

  const colorPicker = document.createElement('div');
  colorPicker.className = 'color-picker';
  PAPER_COLORS.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `color-swatch${note.color === color ? ' selected' : ''}`;
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      updateNote(note.id, { color });
      noteEl.style.backgroundColor = color;
      colorPicker.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    colorPicker.appendChild(swatch);
  });

  const created = document.createElement('div');
  created.className = 'meta-row';
  created.textContent = `Created ${new Date(note.created).toLocaleString()}`;

  details.append(tagsInput, groupRow, reminderRow, colorPicker, created);

  const due = document.createElement('div');
  due.className = 'due-chip';
  if (note.reminder) {
    due.textContent = `Due ${new Date(note.reminder).toLocaleString()}`;
  } else {
    due.classList.add('hidden');
  }

  const content = document.createElement('div');
  content.className = 'content-container';

  const locked = note.locked && !unlockedIds.has(note.id);
  if (locked) {
    const overlay = document.createElement('div');
    overlay.className = 'lock-overlay';
    overlay.innerHTML = '<strong>Locked</strong><span>Enter password to reveal this note.</span>';
    const password = document.createElement('input');
    password.type = 'password';
    password.placeholder = 'Password';
    const unlockBtn = document.createElement('button');
    unlockBtn.type = 'button';
    unlockBtn.className = 'toolbar-btn';
    unlockBtn.textContent = 'Unlock';
    const tryUnlock = async () => {
      try {
        note.content = await decryptContent(note, password.value);
        unlockedIds.add(note.id);
        persist();
        render();
      } catch {
        showToast('Could not unlock note.');
        setTimeout(hideToast, 2400);
      }
    };
    unlockBtn.addEventListener('click', tryUnlock);
    password.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') tryUnlock();
    });
    overlay.append(password, unlockBtn);
    content.appendChild(overlay);
  } else {
    const textarea = document.createElement('textarea');
    textarea.className = 'note-textarea';
    textarea.value = note.content;
    textarea.placeholder = 'Write Markdown…';

    const preview = document.createElement('div');
    preview.className = 'preview preview-live';

    const updatePreview = () => {
      preview.innerHTML = highlightHtml(renderMarkdown(note.content), searchQuery.trim());
    };
    textarea.addEventListener('input', (event) => {
      note.content = event.target.value;
      updatePreview();
      debouncePersist();
    });
    updatePreview();

    if (note.blurred) {
      textarea.style.filter = 'blur(6px)';
      preview.style.filter = 'blur(6px)';
    }

    content.append(textarea, preview);
  }

  noteEl.append(toolbar, titleWrap, due, tagsDisplay, details, content);
  return noteEl;
}

async function toggleLock(note) {
  if (note.locked && unlockedIds.has(note.id)) {
    const password = window.prompt('Password to lock this note again:');
    if (!password) return;
    const payload = await encryptContent(note.content, password);
    Object.assign(note, payload, { locked: true, content: '' });
    unlockedIds.delete(note.id);
    await persist();
    return;
  }
  if (note.locked) {
    const password = window.prompt('Password to unlock:');
    if (!password) return;
    try {
      note.content = await decryptContent(note, password);
      unlockedIds.add(note.id);
      await persist();
    } catch {
      showToast('Could not unlock note.');
      setTimeout(hideToast, 2400);
    }
    return;
  }
  const password = window.prompt('Choose a password to lock this note:');
  if (!password) return;
  const confirmPassword = window.prompt('Confirm password:');
  if (password !== confirmPassword) {
    showToast('Passwords did not match.');
    setTimeout(hideToast, 2400);
    return;
  }
  const payload = await encryptContent(note.content, password);
  Object.assign(note, payload, { locked: true, content: '' });
  unlockedIds.delete(note.id);
  await persist();
}

function deleteNote(id) {
  const note = findNote(id);
  if (!note) return;
  if (note.pinned) {
    showToast('Pinned notes cannot be deleted. Unpin first.');
    setTimeout(hideToast, 2400);
    return;
  }
  notes = notes.filter((item) => item.id !== note.id);
  persist();
  render();
  undoNote = note;
  clearTimeout(undoTimer);
  showToast(`Deleted “${note.title}”`, 'Undo', () => {
    notes.push(undoNote);
    undoNote = null;
    persist();
    render();
  });
  undoTimer = setTimeout(() => {
    undoNote = null;
    hideToast();
  }, UNDO_MS);
}

function createNote(templateKey = 'blank') {
  const template = TEMPLATES[templateKey] || TEMPLATES.blank;
  const timestamp = Date.now();
  notes.push(
    normalizeNote({
      id: timestamp,
      title: template.title,
      content: template.content,
      created: timestamp,
      color: generateRandomColor(),
      zIndex: getNextZIndex(),
      x: 24 + (notes.length % 6) * 28,
      y: 24 + (notes.length % 6) * 28,
    })
  );
  persist();
  render();
}

function renderEmpty(container, hasNotes) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  if (!hasNotes) {
    empty.innerHTML =
      '<h2>A clear desk</h2><p>Create a note to start a board. Press <kbd>⌘N</kbd> or <kbd>Ctrl+N</kbd>. Right side templates cover to-dos and meetings.</p>';
  } else {
    empty.innerHTML = '<h2>No matches</h2><p>Try another search, tag, or group filter.</p>';
  }
  container.appendChild(empty);
}

function render() {
  const container = document.getElementById('notes-container');
  resizeObservers.splice(0).forEach((observer) => observer.disconnect());
  container.innerHTML = '';
  applyViewUi();
  applyTheme();
  applyKeepOpenUi();
  renderFilters();
  renderReminderInbox();

  const visible = filteredNotes();
  if (!visible.length) {
    renderEmpty(container, notes.length > 0);
    return;
  }
  visible.forEach((note) => container.appendChild(buildNoteCard(note)));
}

function advanceRepeat(note, now) {
  if (note.reminderRepeat === 'daily') {
    do {
      note.reminder += DAY_MS;
    } while (note.reminder <= now);
    return;
  }
  if (note.reminderRepeat === 'weekly') {
    do {
      note.reminder += WEEK_MS;
    } while (note.reminder <= now);
    return;
  }
  note.reminder = null;
}

function checkReminders() {
  const now = Date.now();
  if (globalReminder && now >= globalReminder) {
    notify('Sticky Notes', 'App reminder', null);
    globalReminder = null;
    document.getElementById('global-reminder').value = '';
    persist();
    if (window.api && window.api.showWindow) window.api.showWindow();
  }

  notes.forEach((note) => {
    if (!note.reminder || now < note.reminder) return;
    notify('Sticky Notes', note.title || 'Note reminder', note.title);
    if (window.api && window.api.showWindow) window.api.showWindow();
    searchQuery = note.title;
    document.getElementById('search-input').value = note.title;
    advanceRepeat(note, now);
    persist();
    render();
  });
}

function exportNotesAsJSON() {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'notes_export.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importNotes(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (!Array.isArray(imported)) {
        showToast('Import must be a JSON array of notes.');
        setTimeout(hideToast, 2400);
        return;
      }
      const valid = imported
        .filter(
          (note) =>
            note &&
            typeof note === 'object' &&
            typeof note.title === 'string' &&
            typeof note.content === 'string'
        )
        .map(normalizeNote);
      if (!valid.length) {
        showToast('No valid notes found.');
        setTimeout(hideToast, 2400);
        return;
      }
      const existing = new Set(notes.map((note) => String(note.id)));
      valid.forEach((note, index) => {
        if (existing.has(String(note.id))) {
          note.id = Date.now() + index;
        }
        existing.add(String(note.id));
        notes.push(note);
      });
      persist();
      render();
      showToast(`Imported ${valid.length} notes.`);
      setTimeout(hideToast, 2400);
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
      setTimeout(hideToast, 2400);
    }
  };
  reader.readAsText(file);
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(settings.theme) + 1) % order.length];
  settings.theme = next;
  persist();
  applyTheme();
}

function setView(view) {
  settings.view = view;
  persist();
  render();
}

function setKeepOpen(value) {
  settings.keepOpen = value;
  if (window.api && window.api.setKeepOpen) window.api.setKeepOpen(value);
  persist();
  applyKeepOpenUi();
}

document.addEventListener('DOMContentLoaded', async () => {
  bindDrag();
  await loadAll();
  applyTheme();
  applyKeepOpenUi();

  const searchInput = document.getElementById('search-input');
  searchInput.value = searchQuery;
  searchInput.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    render();
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchInput.focus();
    render();
  });

  document.getElementById('new-note').addEventListener('click', () => createNote('blank'));
  document.getElementById('new-note').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    document.getElementById('template-menu').classList.remove('hidden');
  });
  document.getElementById('template-toggle').addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById('template-menu').classList.toggle('hidden');
  });
  document.getElementById('template-menu').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-template]');
    if (!button) return;
    createNote(button.dataset.template);
    closePanels();
  });

  document.getElementById('view-board').addEventListener('click', () => setView('board'));
  document.getElementById('view-list').addEventListener('click', () => setView('list'));
  document.getElementById('theme-button').addEventListener('click', cycleTheme);
  document.getElementById('keep-open-button').addEventListener('click', () => {
    setKeepOpen(!settings.keepOpen);
  });

  document.getElementById('reminder-inbox-button').addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = document.getElementById('reminder-panel');
    const willOpen = !panel.classList.contains('open');
    closePanels();
    if (willOpen) panel.classList.add('open');
  });
  document.getElementById('reminder-panel-close').addEventListener('click', closePanels);
  document.getElementById('menu-button').addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = document.getElementById('side-menu');
    const willOpen = !panel.classList.contains('open');
    closePanels();
    if (willOpen) panel.classList.add('open');
  });
  document.getElementById('side-menu-close').addEventListener('click', closePanels);
  document.getElementById('side-menu').addEventListener('click', (event) => event.stopPropagation());
  document.getElementById('reminder-panel').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', closePanels);

  document.getElementById('export-notes').addEventListener('click', exportNotesAsJSON);
  const fileInput = document.getElementById('file-input');
  document.getElementById('import-notes').addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) importNotes(file);
    fileInput.value = '';
  });

  const globalInput = document.getElementById('global-reminder');
  if (globalReminder) {
    globalInput.value = toLocalInput(globalReminder);
  }
  globalInput.addEventListener('change', (event) => {
    globalReminder = event.target.value ? new Date(event.target.value).getTime() : null;
    persist();
    renderReminderInbox();
  });
  document.getElementById('global-reminder-clear').addEventListener('click', () => {
    globalReminder = null;
    globalInput.value = '';
    persist();
    renderReminderInbox();
  });

  document.addEventListener('keydown', (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const inField = Boolean(event.target.closest && event.target.closest('input, textarea, select'));
    if (meta && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      createNote('blank');
    } else if (meta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (event.key === 'Escape') {
      closePanels();
      if (searchQuery) {
        searchQuery = '';
        searchInput.value = '';
        render();
      }
    } else if (meta && event.key.toLowerCase() === '1' && !inField) {
      setView('board');
    } else if (meta && event.key.toLowerCase() === '2' && !inField) {
      setView('list');
    } else if (meta && event.key.toLowerCase() === 'p' && !inField) {
      event.preventDefault();
      togglePinFocused();
    } else if (event.key === 'ArrowDown' && !inField) {
      event.preventDefault();
      focusAdjacentNote(1);
    } else if (event.key === 'ArrowUp' && !inField) {
      event.preventDefault();
      focusAdjacentNote(-1);
    } else if (event.key === 'ArrowRight' && !inField && settings.view !== 'list') {
      event.preventDefault();
      focusAdjacentNote(1);
    } else if (event.key === 'ArrowLeft' && !inField && settings.view !== 'list') {
      event.preventDefault();
      focusAdjacentNote(-1);
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  if (window.api && window.api.onCreateNote) window.api.onCreateNote(() => createNote('blank'));
  if (window.api && window.api.onKeepOpenChanged) {
    window.api.onKeepOpenChanged((value) => {
      settings.keepOpen = Boolean(value);
      applyKeepOpenUi();
    });
  }
  if (window.api && window.api.onFocusNoteSearch) {
    window.api.onFocusNoteSearch((title) => {
      searchQuery = title || '';
      searchInput.value = searchQuery;
      render();
    });
  }
  if (!window.api && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  render();
  setInterval(checkReminders, 5000);
});
