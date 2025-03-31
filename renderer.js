/* eslint-env browser */
/* global marked */

// Array to hold all notes
let notes = [];

// Global reminder variable
let globalReminder = null; // Timestamp (in ms) or null

// Current search query
let searchQuery = '';

// Debounce utility function
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Debounced saveNotes function
const debouncedSaveNotes = debounce(saveNotes, 300);

// Load notes from localStorage on startup
function loadNotes() {
  const savedNotes = localStorage.getItem('notes');
  if (savedNotes) {
    try {
      notes = JSON.parse(savedNotes);
    } catch (e) {
      console.error('Error parsing notes from localStorage:', e);
      notes = [];
    }
  } else {
    notes = [];
  }
  // Load global reminder from localStorage (if set)
  const savedGlobalReminder = localStorage.getItem('globalReminder');
  if (savedGlobalReminder) {
    globalReminder = parseInt(savedGlobalReminder, 10);
  }
}

// Save notes and global reminder to localStorage
function saveNotes() {
  localStorage.setItem('notes', JSON.stringify(notes));
  if (globalReminder) {
    localStorage.setItem('globalReminder', globalReminder);
  } else {
    localStorage.removeItem('globalReminder');
  }
}

// Render the notes list, filtered by the search query
function renderNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = ''; // Clear previous notes

  // Filter notes based on the search query
  const filteredNotes = notes.filter((note) => {
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  });

  filteredNotes.forEach((note) => {
    const noteDiv = document.createElement('div');
    noteDiv.classList.add('note');
    noteDiv.setAttribute('data-id', note.id);

    // Delete button using the x.png icon
    const deleteButton = document.createElement('div');
    deleteButton.classList.add('delete-button');
    const deleteImg = document.createElement('img');
    deleteImg.src = 'assets/x.png';
    deleteImg.alt = 'Delete';
    deleteButton.appendChild(deleteImg);
    deleteButton.addEventListener('click', () => {
      if (note.pinned) {
        window.alert("This note is pinned and cannot be deleted.");
      } else {
        if (window.confirm("Are you sure you want to delete this note?")) {
          deleteNote(note.id);
        }
      }
    });
    noteDiv.appendChild(deleteButton);

    // Title input for the note (first line)
    const titleInput = document.createElement('input');
    titleInput.classList.add('note-title');
    titleInput.value = note.title;
    titleInput.addEventListener('input', (event) => {
      updateNoteTitle(note.id, event.target.value);
    });
    noteDiv.appendChild(titleInput);

    // Display creation date
    const createdDiv = document.createElement('div');
    createdDiv.classList.add('created');
    createdDiv.textContent =
      'Created: ' + new Date(note.created).toLocaleString();
    noteDiv.appendChild(createdDiv);

    // Create a container for content editing and preview toggle
    const contentContainer = document.createElement('div');
    contentContainer.style.flexGrow = '1';
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';

    // Textarea for editing the note content (Markdown), initially visible
    const textarea = document.createElement('textarea');
    textarea.value = note.content;
    textarea.style.display = 'block'; // Default is edit mode
    textarea.addEventListener('input', (event) => {
      updateNoteContent(note.id, event.target.value);
    });
    contentContainer.appendChild(textarea);

    // Div for rendered Markdown preview (default hidden)
    const previewDiv = document.createElement('div');
    previewDiv.classList.add('preview');
    previewDiv.style.display = 'none'; // Hide preview mode by default
    previewDiv.style.flexGrow = '1';
    previewDiv.style.overflowY = 'auto';
    previewDiv.style.padding = '5px';
    previewDiv.style.backgroundColor = 'transparent';
    previewDiv.innerHTML = marked.parse(note.content);
    contentContainer.appendChild(previewDiv);

    // Container for buttons (Edit/Preview, Secret, and Pin)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '5px';

    // Toggle button for switching between edit and preview modes
    const toggleButton = document.createElement('button');
    toggleButton.classList.add('toggle-button');
    // Default state is edit mode; button text shows "Preview" to switch to preview mode
    toggleButton.textContent = 'Preview';
    toggleButton.style.fontWeight = 'bold';
    toggleButton.addEventListener('click', () => {
      if (textarea.style.display === 'none') {
        // Switch to edit mode: show textarea, hide preview
        textarea.style.display = 'block';
        previewDiv.style.display = 'none';
        toggleButton.textContent = 'Preview';
        textarea.focus();
      } else {
        // Switch to preview (read-only) mode: update preview and hide textarea
        previewDiv.innerHTML = marked.parse(textarea.value);
        textarea.style.display = 'none';
        previewDiv.style.display = 'block';
        toggleButton.textContent = 'Edit';
      }
    });
    buttonContainer.appendChild(toggleButton);

    // Secret button to toggle blur
    const secretButton = document.createElement('button');
    secretButton.classList.add('toggle-button');
    secretButton.textContent = 'Secret';
    secretButton.style.fontWeight = 'bold';
    secretButton.addEventListener('click', () => {
      if (textarea.style.filter === 'blur(5px)') {
        textarea.style.filter = 'none';
        secretButton.textContent = 'Secret';
        previewDiv.style.filter = 'none';
      } else {
        textarea.style.filter = 'blur(5px)';
        secretButton.textContent = 'Unblur';
        previewDiv.style.filter = 'blur(5px)';
      }
    });
    buttonContainer.appendChild(secretButton);

    // Pin button to toggle pinned state (cannot be deleted if pinned)
    const pinButton = document.createElement('button');
    pinButton.classList.add('toggle-button');
    const pinImg = document.createElement('img');
    // Set the icon based on the note's pinned state:
    pinImg.src = note.pinned ? 'assets/pin.png' : 'assets/pinned.png';
    // Set tooltip and alt text based on pinned state:
    pinImg.alt = note.pinned ? 'Unpin Note' : 'Pin Note';
    pinButton.title = note.pinned ? 'Unpin Note' : 'Pin Note';
    // if pinned add red border around the note
    if (note.pinned) {
      noteDiv.style.border = '2px solid red';
    } else {
      noteDiv.style.border = 'none';
    }
    pinButton.appendChild(pinImg);
    pinButton.addEventListener('click', () => {
      note.pinned = !note.pinned;
      saveNotes();
      renderNotes();
    });
    buttonContainer.appendChild(pinButton);


    contentContainer.appendChild(buttonContainer);
    noteDiv.appendChild(contentContainer);
    container.appendChild(noteDiv);
  });
}


// Create a new note
function createNote() {
  console.log('Creating a new note...');
  const timestamp = Date.now();
  const newNote = {
    id: timestamp,
    title: 'New Note',
    content: '',
    created: timestamp,
    pinned: false,
  };
  notes.push(newNote);
  saveNotes();
  renderNotes();
}


// Update a note's title and auto-save
function updateNoteTitle(id, title) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    note.title = title;
    debouncedSaveNotes();
  }
}

// Update a note's content and auto-save
function updateNoteContent(id, content) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    note.content = content;
    debouncedSaveNotes();
  }
}

// Delete a note and re-render
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  saveNotes();
  renderNotes();
}

// Handle search input
function handleSearch(event) {
  searchQuery = event.target.value;
  renderNotes();
}

// Handle changes to the global reminder input
function handleGlobalReminder(event) {
  const datetimeString = event.target.value;
  if (datetimeString) {
    globalReminder = new Date(datetimeString).getTime();
    console.log(
      'Global reminder set for',
      new Date(globalReminder).toLocaleString()
    );
  } else {
    globalReminder = null;
  }
  saveNotes();
}

// Periodically check for the global reminder
function checkGlobalReminder() {
  if (globalReminder) {
    const now = Date.now();
    if (now >= globalReminder) {
      console.log('Global reminder time reached');
      globalReminder = null;
      localStorage.removeItem('globalReminder');
      if (window.api && window.api.showWindow) {
        window.api.showWindow();
      } else {
        console.warn('showWindow API not available');
      }
    }
  }
}

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded. Setting up event listeners.');

  const newNoteButton = document.getElementById('new-note');
  if (newNoteButton) {
    newNoteButton.addEventListener('click', () => {
      console.log('"New Note" button clicked.');
      createNote();
    });
  } else {
    console.error('New Note button not found.');
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  } else {
    console.error('Search input not found.');
  }

  const globalReminderInput = document.getElementById('global-reminder');
  if (globalReminderInput) {
    globalReminderInput.addEventListener('change', handleGlobalReminder);
    if (globalReminder) {
      const dt = new Date(globalReminder);
      globalReminderInput.value = dt.toISOString().slice(0, 16);
    }
  } else {
    console.error('Global reminder input not found.');
  }

  loadNotes();
  renderNotes();

  setInterval(checkGlobalReminder, 10000); // every 10s maybe can increase it to 1 minute
});
