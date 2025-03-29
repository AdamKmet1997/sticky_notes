// Array to hold all notes
let notes = [];

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
}

// Save notes to localStorage
function saveNotes() {
  localStorage.setItem('notes', JSON.stringify(notes));
}

// Render the notes list, filtered by the search query
function renderNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = ''; // Clear previous notes

  // Filter notes based on the search query
  const filteredNotes = notes.filter(note => {
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  });

  filteredNotes.forEach(note => {
    const noteDiv = document.createElement('div');
    noteDiv.classList.add('note');
    noteDiv.setAttribute('data-id', note.id);

    // Delete button for each note
    const deleteButton = document.createElement('div');
    deleteButton.classList.add('delete-button');
    deleteButton.textContent = 'X';
    deleteButton.addEventListener('click', () => {
      deleteNote(note.id);
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
    createdDiv.textContent = 'Created: ' + new Date(note.created).toLocaleString();
    noteDiv.appendChild(createdDiv);

    // Textarea for editing the note content
    const textarea = document.createElement('textarea');
    textarea.value = note.content;
    textarea.addEventListener('input', (event) => {
      updateNoteContent(note.id, event.target.value);
    });
    noteDiv.appendChild(textarea);

    container.appendChild(noteDiv);
  });
}

// Create a new note
function createNote() {
  console.log('Creating a new note...');
  const timestamp = Date.now();
  const newNote = {
    id: timestamp,
    title: 'New Note',      // Default title
    content: '',
    created: timestamp      // Save creation time
  };
  notes.push(newNote);
  saveNotes();
  renderNotes();
}

// Update a note's title and auto-save
function updateNoteTitle(id, title) {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.title = title;
    debouncedSaveNotes(); // Use the debounced version of saveNotes
  }
}

// Update a note's content and auto-save
function updateNoteContent(id, content) {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = content;
    debouncedSaveNotes(); // Use the debounced version of saveNotes
  }
}

// Delete a note from the notes array and update the display
function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  renderNotes();
}

// Handle search input
function handleSearch(event) {
  searchQuery = event.target.value; // Update the search query
  renderNotes(); // Re-render notes based on the search query
}

// Wait for the DOM to fully load before attaching event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded. Setting up event listeners.');

  // Attach event listener to the "New Note" button
  const newNoteButton = document.getElementById('new-note');
  if (newNoteButton) {
    newNoteButton.addEventListener('click', () => {
      console.log('"New Note" button clicked.');
      createNote();
    });
  } else {
    console.error('New Note button not found in the DOM.');
  }

  // Attach event listener to the search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  } else {
    console.error('Search input not found in the DOM.');
  }

  // Initial load of notes when the app starts
  loadNotes();
  renderNotes();
});