let draggedItem = null;
let lastDeletedItem = null;

const applyImageBackground = (card) => {
  const cardTitle = card.querySelector('.card-name');
  const cardSubtitle = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');
  const imageUrl = cardImageUrl.textContent.trim();

  if (imageUrl !== '') {
    card.style.backgroundImage = `url("${imageUrl}")`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
    cardImageUrl.style.display = 'none';
    cardTitle.style.color = 'white';
    cardSubtitle.style.color = 'white';
  } else {
    card.style.backgroundImage = 'none';
    cardImageUrl.style.display = 'block';
    cardTitle.style.color = 'black';
    cardSubtitle.style.color = 'black';
  }
}

const updateCardFields = (card) => {
  const cardTitle = card.querySelector('.card-name');
  const cardSubtitle = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');

  cardTitle.textContent = cardTitle.textContent.trim();
  cardSubtitle.textContent = cardSubtitle.textContent.trim();
  cardImageUrl.textContent = cardImageUrl.textContent.trim();
  
  // Apply image background
  applyImageBackground(card);

  // Handle placeholder text
  togglePlaceholder(cardTitle);
  togglePlaceholder(cardSubtitle);
  togglePlaceholder(cardImageUrl);
}

const togglePlaceholder = (element) => {
  const placeholder = element.getAttribute('data-placeholder');
  if (element.textContent.trim() === '') {
    element.textContent = placeholder;
    element.classList.add('placeholder');
  } else if (element.textContent === placeholder) {
    element.textContent = '';
    element.classList.remove('placeholder');
  }
  updateCardStyles();
}

const updateCardStyles = () => {
  document.querySelectorAll('.card').forEach((card) => {
    const cardName = card.querySelector('.card-name').textContent.trim();
    const cardSeries = card.querySelector('.card-series').textContent.trim();
    const cardImageUrl = card.querySelector('.card-image-url').textContent.trim();

    if (cardName === '' && cardSeries === '' && cardImageUrl === '') {
      card.classList.add('empty-card');
      card.classList.remove('filled-card');
    } else {
      card.classList.remove('empty-card');
      card.classList.add('filled-card');
    }
  });
}

const updateCardNumbers = () => {
  document.querySelectorAll('.list').forEach((list, listIdx) => {
    list.querySelectorAll('.card').forEach((card, cardIdx) => {
      card.querySelector('.card-number').textContent = `${cardIdx + 1}`;
    });
  });
  updateCardNumberColors();
}

const updateCardNumberColors = () => {
  document.querySelectorAll('.card-number').forEach((element) => {
    const cardNumber = Number(element.innerText);
    element.className = 'card-number';  // Reset the class name
    if (cardNumber === 1) {
      element.classList.add('first-card');
    } else if (cardNumber <= 10) {
      element.classList.add('less-than-ten');
    }
  });
}

const dragStart = () => {
  draggedItem = this;
  this.classList.add('dragging');
}

const dragEnd = () => {
  this.classList.remove('dragging');
  updateCardNumbers();
  applyImageBackground(this);
  draggedItem = null;
}

const dragOver = (e) => {
  e.preventDefault();
  const afterElement = getDragAfterElement(this, e.clientY);
  const card = document.querySelector('.dragging');
  if (afterElement == null) {
    this.appendChild(card);
  } else {
    this.insertBefore(card, afterElement);
    }
}

const dragEnter = () => {
this.classList.add('drag-enter');
}

const dragExit = () => {
this.classList.remove('drag-enter');
}

const deleteOver = (e) => {
e.preventDefault();
this.classList.add('delete-hover');
}

const deleteEnter = () => {
this.classList.add('delete-hover');
}

const deleteLeave = () => {
this.classList.remove('delete-hover');
}

const deleteDrop = () => {
this.classList.remove('delete-hover');
lastDeletedItem = draggedItem;
draggedItem.remove();
draggedItem = null;
updateCardNumbers();
}

const toggleDarkMode = () => {
const body = document.querySelector('body');
body.classList.toggle('dark-mode');
}

const addCard = () => {
const list = this.closest('.list');
const cardContainer = list.querySelector('.card-container');
const card = createCardElement();
cardContainer.appendChild(card);
updateCardNumbers();
applyImageBackground(card);
}

const addList = () => {
const board = document.querySelector('#board');
const list = createListElement();
board.appendChild(list);
updateCardNumbers();
}

const toggleEdit = () => {
const card = this.closest('.card');
const cardName = card.querySelector('.card-name');
const cardSeries = card.querySelector('.card-series');
const cardImageUrl = card.querySelector('.card-image-url');

card.classList.toggle('edit-mode');
if (card.classList.contains('edit-mode')) {
cardName.setAttribute('contenteditable', 'true');
cardSeries.setAttribute('contenteditable', 'true');
cardImageUrl.setAttribute('contenteditable', 'true');
cardName.focus();
} else {
cardName.setAttribute('contenteditable', 'false');
cardSeries.setAttribute('contenteditable', 'false');
cardImageUrl.setAttribute('contenteditable', 'false');
updateCardFields(card);
}
}

const updateTitle = () => {
this.textContent = this.textContent.trim();
if (this.textContent === '') {
this.textContent = 'Untitled';
}
}

const getDragAfterElement = (container, y) => {
const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
return draggableElements.reduce((closest, child) => {
const box = child.getBoundingClientRect();
const offset = y - box.top - box.height / 2;
if (offset < 0 && offset > closest.offset) {
return { offset: offset, element: child };
} else {
return closest;
}
}, { offset: Number.NEGATIVE_INFINITY }).element;
}

const createCardElement = () => {
// same code as before, but replace the drag event listener setup with:
initDragListeners(card, dragStart, dragEnd);
// ...
}

const createListElement = () => {
// same code as before, but replace the drag and delete event listener setup with:
initDragListeners(cardContainer, dragOver, dragExit);
initDeleteListeners(deleteButton, deleteOver, deleteEnter, deleteLeave, deleteDrop);
// ...
}

function initDragListeners(element, startFunc, endFunc) {
element.addEventListener('dragstart', startFunc);
element.addEventListener('dragend', endFunc);
}

function initDeleteListeners(element, overFunc, enterFunc, leaveFunc, dropFunc) {
element.addEventListener('dragover', overFunc);
element.addEventListener('dragenter', enterFunc);
element.addEventListener('dragleave', leaveFunc);
element.addEventListener('drop', dropFunc);
}

document.querySelectorAll('.card, .card *').forEach(element => {
initDragListeners(element.closest('.card'), dragStart, dragEnd);
});

document.querySelectorAll

('.delete-button').forEach(deleteButton => {
initDeleteListeners(deleteButton, deleteOver, deleteEnter, deleteLeave, deleteDrop);
});

document.querySelectorAll('.list, .list *').forEach(element => {
element.closest('.list').querySelector('.card-container').addEventListener('dragover', dragOver);
element.closest('.list').querySelector('.card-container').addEventListener('dragenter', dragEnter);
element.closest('.list').querySelector('.card-container').addEventListener('dragleave', dragExit);
});

document.querySelector('#dark-mode-toggle').addEventListener('click', toggleDarkMode);
document.querySelectorAll('.add-card-button').forEach(button => button.addEventListener('click', addCard));
document.querySelector('#add-list-button').addEventListener('click', addList);
document.querySelectorAll('.card-title').forEach(title => title.addEventListener('blur', updateTitle));
document.querySelectorAll('.edit-button').forEach(button => button.addEventListener('click', toggleEdit));
document.querySelectorAll('.card').forEach(card => updateCardFields(card));
updateCardNumbers();
updateCardStyles();
