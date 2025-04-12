/* eslint-env browser */
/* global marked */

// Array to hold all notes
let notes = [];

// Global reminder variable (stored in milliseconds, null if unset)
let globalReminder = null;

// Variable for keeping track of the current search query
let searchQuery = '';

// Debounce utility function, prevents rapid execution of functions (e.g., during typing)
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Create a debounced version of saveNotes to limit how often notes are saved
const debouncedSaveNotes = debounce(saveNotes, 300);

/**
 * Loads notes and global reminder from localStorage.
 */
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
  // Load global reminder if set
  const savedGlobalReminder = localStorage.getItem('globalReminder');
  if (savedGlobalReminder) {
    globalReminder = parseInt(savedGlobalReminder, 10);
  }
}

/**
 * Saves notes and global reminder to localStorage.
 */
function saveNotes() {
  localStorage.setItem('notes', JSON.stringify(notes));
  if (globalReminder) {
    localStorage.setItem('globalReminder', globalReminder);
  } else {
    localStorage.removeItem('globalReminder');
  }
}

/**
 * Renders all notes to the DOM. It filters notes based on the search query,
 * creates DOM elements for each note, and assigns classes for styling.
 */
function renderNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = ''; // Clear any previous content

  // Filter notes based on the search query
  const filteredNotes = notes.filter((note) => {
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  });

  // Create DOM elements for each filtered note
  filteredNotes.forEach((note) => {
    // Create the main note container
    const noteDiv = document.createElement('div');
    noteDiv.classList.add('note');
    noteDiv.setAttribute('data-id', note.id);

    // Add the pinned-note class if the note is pinned (to show a red border)
    if (note.pinned) {
      noteDiv.classList.add('pinned-note');
    } else {
      noteDiv.classList.remove('pinned-note');
    }

    // Apply saved dimensions if available (applied inline as they are dynamic)
    if (note.width && note.height) {
      noteDiv.style.width = `${note.width}px`;
      noteDiv.style.height = `${note.height}px`;
    }

    // Save dimensions on resize: update note dimensions when mouse leaves the note
    noteDiv.addEventListener('mouseleave', () => {
      const rect = noteDiv.getBoundingClientRect();
      note.width = Math.round(rect.width);
      note.height = Math.round(rect.height);
      saveNotes();
    });

    // Create delete button with an image icon
    const deleteButton = document.createElement('div');
    deleteButton.classList.add('delete-button');
    const deleteImg = document.createElement('img');
    deleteImg.src = 'assets/x.png';
    deleteImg.alt = 'Delete';
    deleteButton.appendChild(deleteImg);
    deleteButton.addEventListener('click', () => {
      // Prevent deleting a pinned note
      if (note.pinned) {
        window.alert('This note is pinned and cannot be deleted.');
      } else {
        if (window.confirm('Are you sure you want to delete this note?')) {
          deleteNote(note.id);
        }
      }
    });
    noteDiv.appendChild(deleteButton);

    // Create title input for the note's title
    const titleInput = document.createElement('input');
    titleInput.classList.add('note-title');
    titleInput.value = note.title;
    titleInput.addEventListener('input', (event) => {
      updateNoteTitle(note.id, event.target.value);
    });
    noteDiv.appendChild(titleInput);

    // Display creation date of the note
    const createdDiv = document.createElement('div');
    createdDiv.classList.add('created');
    createdDiv.textContent =
      'Created: ' + new Date(note.created).toLocaleString();
    noteDiv.appendChild(createdDiv);

    // Create content container (holds editing area and preview)
    const contentContainer = document.createElement('div');
    contentContainer.classList.add('content-container');

    // Create textarea element for note editing (Markdown)
    const textarea = document.createElement('textarea');
    textarea.value = note.content;
    textarea.classList.add('note-textarea');

    // Create preview div for rendered Markdown (hidden initially)
    const previewDiv = document.createElement('div');
    previewDiv.classList.add('preview');

    // Use a utility class 'hidden' to manage display based on note.preview state
    if (note.preview) {
      textarea.classList.add('hidden');
      previewDiv.classList.remove('hidden');
      previewDiv.innerHTML = marked.parse(note.content);
    } else {
      textarea.classList.remove('hidden');
      previewDiv.classList.add('hidden');
    }

    // *** Set blur styles based on note.blurred property ***
    if (note.blurred) {
      textarea.style.filter = 'blur(5px)';
      previewDiv.style.filter = 'blur(5px)';
    } else {
      textarea.style.filter = 'none';
      previewDiv.style.filter = 'none';
    }

    // Update note content as user types
    textarea.addEventListener('input', (event) => {
      updateNoteContent(note.id, event.target.value);
    });

    contentContainer.appendChild(textarea);
    contentContainer.appendChild(previewDiv);

    // Create button container for note actions (toggle, secret, pin)
    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container');

    // Create toggle button for switching between edit and preview mode
    const toggleButton = document.createElement('button');
    toggleButton.classList.add('toggle-button');
    toggleButton.textContent = note.preview ? 'Edit' : 'Preview';
    toggleButton.addEventListener('click', () => {
      if (note.preview) {
        // Switch to edit mode
        textarea.classList.remove('hidden');
        previewDiv.classList.add('hidden');
        toggleButton.textContent = 'Preview';
        note.preview = false;
        textarea.focus();
      } else {
        // Switch to preview mode; update rendered Markdown
        previewDiv.innerHTML = marked.parse(textarea.value);
        textarea.classList.add('hidden');
        previewDiv.classList.remove('hidden');
        toggleButton.textContent = 'Edit';
        note.preview = true;
      }
      saveNotes();
    });
    buttonContainer.appendChild(toggleButton);

    // Create secret button (for toggling blur)
    const secretButton = document.createElement('button');
    secretButton.classList.add('toggle-button');
    secretButton.textContent = note.blurred ? 'Unblur' : 'Secret';
    secretButton.addEventListener('click', () => {
      note.blurred = !note.blurred;
      saveNotes();
      // Update blur styles directly without re-rendering the whole note
      if (note.blurred) {
        textarea.style.filter = 'blur(5px)';
        previewDiv.style.filter = 'blur(5px)';
        secretButton.textContent = 'Unblur';
      } else {
        textarea.style.filter = 'none';
        previewDiv.style.filter = 'none';
        secretButton.textContent = 'Secret';
      }
    });
    buttonContainer.appendChild(secretButton);

    // Create pin button for toggling pinned state
    const pinButton = document.createElement('button');
    pinButton.classList.add('toggle-button');
    const pinImg = document.createElement('img');
    // Use different images based on pinned state
    pinImg.src = note.pinned ? 'assets/pin.png' : 'assets/pinned.png';
    pinImg.alt = note.pinned ? 'Unpin Note' : 'Pin Note';
    pinButton.title = note.pinned ? 'Unpin Note' : 'Pin Note';
    pinButton.appendChild(pinImg);
    pinButton.addEventListener('click', () => {
      // Toggle the pinned state on the note
      note.pinned = !note.pinned;
      // Save the updated note
      saveNotes();
      // Update the DOM directly without a full re-render:
      if (note.pinned) {
        // Add the pinned-note class to get the red border and update pin icon
        noteDiv.classList.add('pinned-note');
        pinImg.src = 'assets/pin.png';
        pinImg.alt = 'Unpin Note';
        pinButton.title = 'Unpin Note';
      } else {
        // Remove the pinned-note class and update the pin icon
        noteDiv.classList.remove('pinned-note');
        pinImg.src = 'assets/pinned.png';
        pinImg.alt = 'Pin Note';
        pinButton.title = 'Pin Note';
      }
    });
    buttonContainer.appendChild(pinButton);

    contentContainer.appendChild(buttonContainer);
    noteDiv.appendChild(contentContainer);
    container.appendChild(noteDiv);
  });
}

/**
 * Creates a new note with default properties.
 */
function createNote() {
  console.log('Creating a new note...');
  const timestamp = Date.now();
  const newNote = {
    id: timestamp,
    title: 'New Note',
    content: '',
    created: timestamp,
    pinned: false,
    blurred: false,
    preview: false,
  };
  notes.push(newNote);
  saveNotes();
  renderNotes();
}

/**
 * Updates a note's title given an id and new title.
 */
function updateNoteTitle(id, title) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    note.title = title;
    debouncedSaveNotes();
  }
}

/**
 * Updates a note's content given its id.
 */
function updateNoteContent(id, content) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    note.content = content;
    debouncedSaveNotes();
  }
}

/**
 * Deletes a note by id and re-renders all notes.
 */
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  saveNotes();
  renderNotes();
}

/**
 * Handles updating the search query and re-renders notes.
 */
function handleSearch(event) {
  searchQuery = event.target.value;
  renderNotes();
}

/**
 * Handles changes to the global reminder input.
 */
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

/**
 * Periodically checks if the global reminder has been reached.
 */
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

// Set up event listeners when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded. Setting up event listeners.');

  // New Note button
  const newNoteButton = document.getElementById('new-note');
  if (newNoteButton) {
    newNoteButton.addEventListener('click', createNote);
  } else {
    console.error('New Note button not found.');
  }

  // Menu button and side menu for extra options
  const menuButton = document.getElementById('menu-button');
  const sideMenu = document.getElementById('side-menu');
  menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    // Toggle the open state using the 'open' class
    if (sideMenu.classList.contains('open')) {
      sideMenu.classList.remove('open');
    } else {
      sideMenu.classList.add('open');
    }
  });

  sideMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  document.addEventListener('click', () => {
    sideMenu.classList.remove('open');
  });

  // Export button within the side menu
  const exportButton = document.getElementById('export-notes');
  if (exportButton) {
    exportButton.addEventListener('click', exportNotesAsJSON);
    console.log('Export button found.');
  } else {
    console.error('Export button not found.');
  }

  // Setup Import functionality:
  const importButton = document.getElementById('import-notes');
  const fileInput = document.getElementById('file-input');
  if (importButton && fileInput) {
    // When import button is clicked, simulate a click on the hidden file input.
    importButton.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // When a file is selected, read its contents and parse as JSON.
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedNotes = JSON.parse(event.target.result);

          // Check that importedNotes is an array
          if (!Array.isArray(importedNotes)) {
            alert('Error: Imported data is not an array of notes.');
            return;
          }

          // Filter the array to only include notes that have the required structure.
          // Here we check for the existence of key properties: id, title, content, and created.
          const validNotes = importedNotes.filter(
            (note) =>
              note &&
              typeof note === 'object' &&
              Object.prototype.hasOwnProperty.call(note, 'id') &&
              typeof note.title === 'string' &&
              typeof note.content === 'string' &&
              Object.prototype.hasOwnProperty.call(note, 'created')
          );

          if (validNotes.length === 0) {
            alert('Error: No valid notes found in the imported file.');
            return;
          }

          // Merge the valid imported notes with the existing ones
          notes = notes.concat(validNotes);
          saveNotes();
          renderNotes();
          alert('Notes imported and merged successfully.');
        } catch (err) {
          alert('Error importing file: ' + err.message);
        }
      };

      reader.readAsText(file);
      // Clear input value so the same file can be re-imported if needed
      fileInput.value = '';
    });
  } else {
    console.error('Import functionality elements not found.');
  }

  // Search input field
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  } else {
    console.error('Search input not found.');
  }

  // Global reminder input field
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

  // Load saved notes and render them
  loadNotes();
  renderNotes();
  // Set up periodic check for global reminder
  setInterval(checkGlobalReminder, 10000); // every 10 seconds
});

/**
 * Exports notes as a JSON file.
 */
function exportNotesAsJSON() {
  const jsonContent = JSON.stringify(notes, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'notes_export.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
