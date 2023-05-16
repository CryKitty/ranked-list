let draggedItem = null;
let lastDeletedItem = null;

// When a card is over the delete button
function deleteOver(e) {
  e.preventDefault();
  this.style.backgroundColor = 'red'; // Change the color of the delete button to indicate it's active
}

// When a card enters the delete button area
function deleteEnter(e) {
  e.preventDefault();
}

// When a card leaves the delete button area
function deleteLeave(e) {
  this.style.backgroundColor = ''; // Reset the color of the delete button
}

// When a card is dropped on the delete button
function deleteDrop(e) {
  e.preventDefault();
  if (draggedItem != null) {
    draggedItem.remove();
    draggedItem = null;
  }
  this.style.backgroundColor = ''; // Reset the color of the delete button
}

// Function to create a new card
function addCard() {
  const text = prompt('Please enter the card text');
  if (text) {
    const card = document.createElement('div');
    card.textContent = text;
    card.draggable = true;
    this.previousElementSibling.appendChild(card);

    // Add the required event listeners
    card.addEventListener('dragstart', dragStart);
    card.addEventListener('dragend', dragEnd);
  }
}

// Event listener for drag start
function dragStart() {
  setTimeout(() => {
    this.style.display = 'none';
    draggedItem = this;
  }, 0);
}

// Event listener for drag end
function dragEnd() {
  this.style.display = '';
  draggedItem = null;
}

// Create New List
function createListElement() {
  const list = document.createElement('div');
  list.classList.add('list');

  const title = document.createElement('input');
  title.classList.add('list-title');
  title.placeholder = 'New list';
  list.appendChild(title);

  const cards = document.createElement('div');
  cards.classList.add('cards');
  list.appendChild(cards);

  const addCardButton = document.createElement('button');
  addCardButton.classList.add('add-card-button');
  addCardButton.textContent = 'Add a card';
  addCardButton.addEventListener('click', addCard);
  list.appendChild(addCardButton);

  const deleteButton = document.createElement('button');
  deleteButton.classList.add('delete-button');
  deleteButton.draggable = true;
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('dragover', deleteOver);
  deleteButton.addEventListener('dragenter', deleteEnter);
  deleteButton.addEventListener('dragleave', deleteLeave);
  deleteButton.addEventListener('drop', deleteDrop);
  list.appendChild(deleteButton);

  return list;
}

// Add event listener to Add a list button
document.querySelector('#add-list-button').addEventListener('click', function() {
  const board = document.querySelector('#board');
  const newList = createListElement();
  board.appendChild(newList);
  newList.querySelector('.list-title').focus();

  // Add event listeners to the new list
  const newAddCardButton = newList.querySelector('.add-card-button');
  newAddCardButton.addEventListener('click', addCard);

  const newDeleteButton = newList.querySelector('.delete-button');
  newDeleteButton.addEventListener('dragover', deleteOver);
  newDeleteButton.addEventListener('dragenter', deleteEnter);
  newDeleteButton.addEventListener('dragleave', deleteLeave);
  newDeleteButton.addEventListener('drop', deleteDrop);
});

// Add event listeners to existing Add a card buttons and delete buttons
window.addEventListener('DOMContentLoaded', (event) => {
  document.querySelectorAll('.add-card-button').forEach(button => {
    button.addEventListener('click', addCard);
  });

    const deleteButtons = document.querySelectorAll('.delete-button');
  deleteButtons.forEach(deleteButton => {
    deleteButton.addEventListener('dragover', deleteOver);
    deleteButton.addEventListener('dragenter', deleteEnter);
    deleteButton.addEventListener('dragleave', deleteLeave);
    deleteButton.addEventListener('drop', deleteDrop);
  });
});
