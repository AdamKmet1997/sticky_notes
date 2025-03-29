// Array to hold all notes
let notes = [];

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

// Render the notes list
function renderNotes() {
  const container = document.getElementById('notes-container');
  container.innerHTML = ''; // Clear previous notes

  notes.forEach(note => {
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

    // Textarea for editing note content
    const textarea = document.createElement('textarea');
    textarea.value = note.content;
    // Auto-save changes on every input event
    textarea.addEventListener('input', (event) => {
      updateNote(note.id, event.target.value);
    });
    noteDiv.appendChild(textarea);

    container.appendChild(noteDiv);
  });
}

// Create a new note
function createNote() {
  console.log('Creating a new note...');
  const newNote = {
    id: Date.now(), // Unique ID based on current timestamp
    content: ''
  };
  notes.push(newNote);
  saveNotes();
  renderNotes();
}

// Update a note's content in the notes array and auto-save
function updateNote(id, content) {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = content;
    saveNotes();
  }
}

// Delete a note from the notes array and update the display
function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  renderNotes();
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

  // Initial load of notes when the app starts
  loadNotes();
  renderNotes();
});
