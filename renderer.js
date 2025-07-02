/* eslint-env browser */
/* global marked */

// Array to hold all notes
let notes = [];

// Global reminder variable (stored in milliseconds, null if unset)
let globalReminder = null;

// Track the highest z-index for note stacking
let highestZIndex = 1;

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
      // Migrate existing notes to add color and zIndex properties
      let needsSave = false;
      let currentZIndex = 1;
      notes = notes.map(note => {
        if (!note.color) {
          note.color = generateRandomColor();
          needsSave = true;
        }
        if (!note.zIndex) {
          note.zIndex = currentZIndex++;
          needsSave = true;
        }
        return note;
      });
      
      // Update highestZIndex to be higher than any existing note
      if (notes.length > 0) {
        highestZIndex = Math.max(...notes.map(note => note.zIndex || 0));
      }
      
      // Save the updated notes if any were migrated
      if (needsSave) {
        saveNotes();
      }
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
    
    // Search in title, content, and tags
    const titleMatch = note.title.toLowerCase().includes(query);
    const contentMatch = note.content.toLowerCase().includes(query);
    const tagMatch = note.tags && note.tags.some(tag => tag.toLowerCase().includes(query));
    
    return titleMatch || contentMatch || tagMatch;
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
    
    // Apply saved position if available
    if (note.x !== undefined && note.y !== undefined) {
      noteDiv.style.left = `${note.x}px`;
      noteDiv.style.top = `${note.y}px`;
    }
    
    // Apply saved z-index if available
    if (note.zIndex !== undefined) {
      noteDiv.style.zIndex = note.zIndex;
    }
    
    // Apply random color styling if color exists
    if (note.color) {
      noteDiv.style.backgroundColor = getFadedColor(note.color);
      noteDiv.style.border = `2px solid ${getDarkerColor(note.color)}`;
    }
    
    // Make note draggable
    makeDraggable(noteDiv, note);

    // Save dimensions on resize: update note dimensions when mouse leaves the note
    noteDiv.addEventListener('mouseleave', () => {
      const rect = noteDiv.getBoundingClientRect();
      note.width = Math.round(rect.width);
      note.height = Math.round(rect.height);
      saveNotes();
    });

    // Create delete button with text X
    const deleteButton = document.createElement('div');
    deleteButton.classList.add('delete-button');
    deleteButton.textContent = 'X';
    deleteButton.title = 'Delete';
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

    // Create tags input for the note's tags
    const tagsInput = document.createElement('input');
    tagsInput.classList.add('note-tags');
    tagsInput.placeholder = 'Tags: work personal important...';
    tagsInput.value = note.tags ? note.tags.join(' ') : '';
    tagsInput.addEventListener('input', (event) => {
      updateNoteTags(note.id, event.target.value);
    });
    noteDiv.appendChild(tagsInput);

    // Create tags display div
    const tagsDisplay = document.createElement('div');
    tagsDisplay.classList.add('tags-display');
    if (note.tags && note.tags.length > 0) {
      note.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.classList.add('tag');
        tagSpan.style.backgroundColor = getTagColor(tag);
        tagSpan.textContent = tag;
        tagsDisplay.appendChild(tagSpan);
      });
    }
    noteDiv.appendChild(tagsDisplay);

    // Create reminder input for the note
    const reminderContainer = document.createElement('div');
    reminderContainer.classList.add('reminder-container');
    
    const reminderInput = document.createElement('input');
    reminderInput.classList.add('note-reminder');
    reminderInput.type = 'datetime-local';
    reminderInput.title = 'Set reminder for this note';
    if (note.reminder) {
      const dt = new Date(note.reminder);
      reminderInput.value = dt.toISOString().slice(0, 16);
    }
    reminderInput.addEventListener('change', (event) => {
      updateNoteReminder(note.id, event.target.value);
    });
    
    const reminderLabel = document.createElement('span');
    reminderLabel.classList.add('reminder-label');
    reminderLabel.textContent = '⏰';
    reminderLabel.title = 'Reminder';
    
    reminderContainer.appendChild(reminderLabel);
    reminderContainer.appendChild(reminderInput);
    
    // Hide reminder container by default
    reminderContainer.style.display = 'none';
    
    noteDiv.appendChild(reminderContainer);

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

    // Create reminder button for quick access
    const reminderButton = document.createElement('button');
    reminderButton.classList.add('toggle-button');
    const reminderImg = document.createElement('img');
    //unfilled bell (reminder hidden)
    reminderImg.src = 'assets/bell-outline.png';
    reminderImg.alt = 'Toggle Reminder';
    reminderButton.title = 'Toggle Reminder';
    reminderButton.appendChild(reminderImg);
    reminderButton.addEventListener('click', () => {
      // Toggle the reminder container visibility
      const reminderContainer = noteDiv.querySelector('.reminder-container');
      if (reminderContainer) {
        if (reminderContainer.style.display === 'none') {
          // Show reminder container
          reminderContainer.style.display = 'flex';
          reminderImg.src = 'assets/bell.png';
          const reminderInput = reminderContainer.querySelector('.note-reminder');
          if (reminderInput) {
            reminderInput.focus();
          }
        } else {
          reminderContainer.style.display = 'none';
          reminderImg.src = 'assets/bell-outline.png';
        }
      }
    });
    buttonContainer.appendChild(reminderButton);

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
    tags: [],
    reminder: null,
    x: Math.random() * 200,
    y: Math.random() * 200,
    color: generateRandomColor(),
    zIndex: getNextZIndex(),
  };
  notes.push(newNote);
  saveNotes();
  renderNotes();
}

/**
 * Makes a note element draggable.
 */
function makeDraggable(noteElement, note) {
  let isDragging = false;
  let startX, startY, initialX, initialY;
  
  // Add mousedown event to the note element
  noteElement.addEventListener('mousedown', (e) => {
    // Don't start dragging if clicking on input elements or buttons
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
        e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    
    // Don't start dragging if clicking on resize handle area (bottom-right corner)
    const rect = noteElement.getBoundingClientRect();
    const resizeHandleSize = 20; // Size of the resize handle area
    const isInResizeHandle = (
      e.clientX > rect.right - resizeHandleSize &&
      e.clientY > rect.bottom - resizeHandleSize
    );
    
    if (isInResizeHandle) {
      return;
    }
    
    isDragging = true;
    noteElement.classList.add('dragging');
    
    // Bring this note to the front
    const newZIndex = bringNoteToFront(note.id);
    if (newZIndex) {
      noteElement.style.zIndex = newZIndex;
    }
    
    startX = e.clientX;
    startY = e.clientY;
    initialX = noteElement.offsetLeft;
    initialY = noteElement.offsetTop;
    
    // Prevent text selection while dragging
    e.preventDefault();
  });
  
  // Add mousemove event to document
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newX = Math.max(0, initialX + deltaX);
    const newY = Math.max(0, initialY + deltaY);
    
    noteElement.style.left = `${newX}px`;
    noteElement.style.top = `${newY}px`;
  });
  
  // Add mouseup event to document
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    
    isDragging = false;
    noteElement.classList.remove('dragging');
    
    // Save the new position
    note.x = noteElement.offsetLeft;
    note.y = noteElement.offsetTop;
    saveNotes();
  });
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
 * Updates a note's tags given its id and tag string.
 */
function updateNoteTags(id, tagsString) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    // Parse tags from space-separated string, trim whitespace
    const tags = tagsString.split(/\s+/).map(tag => tag.trim()).filter(tag => tag.length > 0);
    note.tags = tags;
    debouncedSaveNotes();
    
    // Update tags display without full re-render
    updateTagsDisplay(id, note.tags);
  }
}

/**
 * Updates a note's reminder given its id and datetime string.
 */
function updateNoteReminder(id, datetimeString) {
  const note = notes.find((n) => n.id === id);
  if (note) {
    if (datetimeString) {
      note.reminder = new Date(datetimeString).getTime();
      console.log(`Reminder set for note "${note.title}" at ${new Date(note.reminder).toLocaleString()}`);
      console.log(`Current time: ${new Date().toLocaleString()}`);
      console.log(`Time until reminder: ${(note.reminder - Date.now()) / 1000} seconds`);
    } else {
      note.reminder = null;
      console.log(`Reminder cleared for note "${note.title}"`);
    }
    debouncedSaveNotes();
  }
}

/**
 * Generates a consistent color for a tag based on its name.
 */
function getTagColor(tagName) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
  ];
  
  // Generate a hash from the tag name to ensure consistent colors
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    const char = tagName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use absolute value and modulo to get a valid index
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}

/**
 * Generates a random color for notes with good contrast and readability.
 */
function generateRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2',
    '#FAD7A0', '#A9DFBF', '#F5B7B1', '#A3E4D7', '#D2B4DE',
    '#FADBD8', '#D5F4E6', '#FCF3CF', '#EBDEF0', '#EAF2F8'
  ];
  
  const randomIndex = Math.floor(Math.random() * colors.length);
  return colors[randomIndex];
}

/**
 * Converts hex color to RGB values
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Creates a faded version of a color for backgrounds
 */
function getFadedColor(hex, opacity = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * Creates a darker version of a color for borders
 */
function getDarkerColor(hex, factor = 0.7) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.floor(rgb.r * factor);
  const g = Math.floor(rgb.g * factor);
  const b = Math.floor(rgb.b * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Gets the next available z-index for note stacking
 */
function getNextZIndex() {
  return ++highestZIndex;
}

/**
 * Brings a note to the front by giving it the highest z-index
 */
function bringNoteToFront(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (note) {
    note.zIndex = getNextZIndex();
    saveNotes();
    return note.zIndex;
  }
  return null;
}

/**
 * Updates the tags display for a specific note without re-rendering everything.
 */
function updateTagsDisplay(noteId, tags) {
  const noteElement = document.querySelector(`[data-id="${noteId}"]`);
  if (noteElement) {
    const tagsDisplay = noteElement.querySelector('.tags-display');
    if (tagsDisplay) {
      tagsDisplay.innerHTML = '';
      if (tags && tags.length > 0) {
        tags.forEach(tag => {
          const tagSpan = document.createElement('span');
          tagSpan.classList.add('tag');
          tagSpan.style.backgroundColor = getTagColor(tag);
          tagSpan.textContent = tag;
          tagsDisplay.appendChild(tagSpan);
        });
      }
    }
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
 * Periodically checks if any reminders have been reached.
 */
function checkReminders() {
  const now = Date.now();
  
  // Check global reminder
  if (globalReminder && now >= globalReminder) {
    console.log('Global reminder time reached');
    globalReminder = null;
    localStorage.removeItem('globalReminder');
    if (window.api && window.api.showWindow) {
      window.api.showWindow();
    } else {
      console.warn('showWindow API not available');
    }
  }
  
  // Check per-note reminders
  const activeReminders = notes.filter(note => note.reminder);
  if (activeReminders.length > 0) {
    console.log(`Checking ${activeReminders.length} active note reminders...`);
  }
  
  notes.forEach(note => {
    if (note.reminder && now >= note.reminder) {
      console.log(`🔔 Note reminder triggered for: "${note.title}" at ${new Date(now).toLocaleString()}`);
      
      // Bring window to front first
      if (window.api && window.api.showWindow) {
        console.log('Calling showWindow API...');
        window.api.showWindow();
      } else {
        console.warn('showWindow API not available');
      }
      
      // Set search to show the triggered note instead of popup
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchQuery = note.title;
        searchInput.value = note.title;
        console.log(`Setting search to: "${note.title}"`);
      }
      
      console.log(`Clearing reminder for note: "${note.title}"`);
      note.reminder = null; // Clear the reminder after triggering
      saveNotes();
      renderNotes(); // Re-render to update UI and show filtered note
    }
  });
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

  // Search clear button
  const searchClearButton = document.getElementById('search-clear');
  if (searchClearButton) {
    searchClearButton.addEventListener('click', () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        renderNotes(); // Re-render to show all notes
        searchInput.focus(); // Keep focus on search input
      }
    });
  } else {
    console.error('Search clear button not found.');
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
  // Set up periodic check for all reminders
  setInterval(checkReminders, 10000); // every 10 seconds
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
