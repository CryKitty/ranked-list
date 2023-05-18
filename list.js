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
    cardTitle.style.color = 'white';
    cardSubtitle.style.color = 'white';
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

const dragStart = function () {
  draggedItem = this;
  this.classList.add('dragging');
}

const dragEnd = function () {
  this.classList.remove('dragging');
  updateCardNumbers();
  applyImageBackground(this);
  draggedItem = null;
}

const dragOver = function(e) {
  e.preventDefault();
  const afterElement = getDragAfterElement(this, e.clientY);
  const card = document.querySelector('.dragging');
  if (afterElement == null) {
    this.appendChild(card);
  } else {
    this.insertBefore(card, afterElement);
  }
}

const dragEnter = function() {
  this.classList.add('drag-enter');
}

const dragExit = function() {
  this.classList.remove('drag-enter');
}

const deleteOver = function(e) {
  e.preventDefault();
  this.classList.add('delete-hover');
}

const deleteEnter = function() {
  this.classList.add('delete-hover');
}

const deleteLeave = function() {
  this.classList.remove('delete-hover');
}

const deleteDrop = function() {
  this.classList.remove('delete-hover');
  lastDeletedItem = draggedItem;
  draggedItem.remove();
  draggedItem = null;
  updateCardNumbers();
}

const toggleDarkMode = function() {
  const body = document.querySelector('body');
  body.classList.toggle('dark-mode');
}

const addCard = function() {
  const list = this.closest('.list');
  const cardContainer = list.querySelector('.card-container');
  const card = createCardElement();
  cardContainer.appendChild(card);
  updateCardNumbers();
  applyImageBackground(card);
}

const addList = function() {
  const board = document.querySelector('#board');
  const list = createListElement();
  const addButton = document.querySelector('#add-list-button');
  board.insertBefore(list, addButton);
  updateCardNumbers();
}

const toggleEdit = function() {
  const card = this.closest('.card');
  const cardName = card.querySelector('.card-name');
  const cardSeries = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');

  card.classList.toggle('edit-mode');
  
  const isEditMode = card.classList.contains('edit-mode');
  
  cardName.setAttribute('contenteditable', isEditMode);
  cardSeries.setAttribute('contenteditable', isEditMode);
  cardImageUrl.setAttribute('contenteditable', isEditMode);
  
  if (isEditMode) {
    cardName.focus();
  } else {
    updateCardFields(card);
  }

  // Toggle the overlay visibility
  card.classList.toggle('overlay-visible', !isEditMode);
}

const updateTitle = function() {
  this.textContent = this.textContent.trim();
  if (this.textContent === '') {
    this.textContent = 'Untitled';
  }
}

const getDragAfterElement = (container, y) => {
  const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function createCardElement() {
  const card = document.createElement('div');
  card.classList.add('card');
  card.setAttribute('draggable', 'true');

  // Add drag events to new cards
  card.addEventListener('dragstart', dragStart);
  card.addEventListener('dragend', dragEnd);

  const cardInner = document.createElement('div');
  cardInner.classList.add('card-inner');

  const cardInfo = document.createElement('div');
  cardInfo.classList.add('card-info');

  const cardName = document.createElement('input');
  cardName.classList.add('card-name');
  cardName.setAttribute('contenteditable', 'true');
  cardName.setAttribute('placeholder', 'Name');
  cardInfo.appendChild(cardName);

  const cardSeries = document.createElement('input');
  cardSeries.classList.add('card-series');
  cardSeries.setAttribute('contenteditable', 'true'); // Set contenteditable to true
  cardSeries.setAttribute('placeholder', 'Series'); // Set placeholder attribute
  cardInfo.appendChild(cardSeries);

  const cardImageUrl = document.createElement('input');
  cardImageUrl.classList.add('card-image-url');
  cardImageUrl.setAttribute('contenteditable', 'true'); // Set contenteditable to true
  cardImageUrl.setAttribute('placeholder', 'Image URL'); // Set placeholder attribute
  cardImageUrl.addEventListener('input', () => {
    applyImageBackground(card);
  });
  cardInfo.appendChild(cardImageUrl);
  
  const cardNumber = document.createElement('div');
  cardNumber.classList.add('card-number');
  cardNumber.textContent = "0";
  card.appendChild(cardNumber);

  cardInner.appendChild(cardInfo);
  card.appendChild(cardInner);
  
  initDragListeners(card, dragStart, dragEnd);
  
  cardName.addEventListener('input', updateCardStyles);
  cardSeries.addEventListener('input', updateCardStyles);
  cardImageUrl.addEventListener('input', () => {
    applyImageBackground(card);
    updateCardStyles();
  });
  
  // Edit Button

  const editButton = document.createElement('button');

  editButton.classList.add('edit-button');

  const editIcon = document.createElement('i');

  editIcon.classList.add('fas', 'fa-pencil-alt'); // 'fas' is the main Font Awesome class, 'fa-pencil-alt' is the specific icon class

  editButton.appendChild(editIcon);

  editButton.addEventListener('click', toggleEdit);

  card.appendChild(editButton);


  return card;
}

function createListElement() {
  const list = document.createElement('div');
  list.classList.add('list');

  const listHeader = document.createElement('div');
  listHeader.classList.add('list-header');
  list.appendChild(listHeader);

  const listTitle = document.createElement('h2');
  listTitle.contentEditable = true;
  listTitle.classList.add('list-title');
  listTitle.setAttribute('placeholder', 'Title');
  listTitle.addEventListener('blur', function() {
    console.log('New title:', this.textContent);
  });
  listHeader.appendChild(listTitle);

  const addCardButton = document.createElement('button');
  addCardButton.classList.add('add-card-button');
  addCardButton.textContent = '+';
  addCardButton.addEventListener('click', addCard);
  listHeader.appendChild(addCardButton);

  const deleteButton = document.createElement('button');
  deleteButton.classList.add('delete-button');
  deleteButton.draggable = true;
  deleteButton.textContent = 'Delete';
  initDeleteListeners(deleteButton, deleteOver, deleteEnter, deleteLeave, deleteDrop);
  list.appendChild(deleteButton);

  const cardContainer = document.createElement('div');
  cardContainer.classList.add('card-container');
  initDragListeners(cardContainer, dragOver, dragExit);
  list.appendChild(cardContainer);

  list.addEventListener('dragover', dragOver);

  return list;
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

document.addEventListener('click', (e) => {
  const targetCard = e.target.closest('.card');
  document.querySelectorAll('.card.edit-mode').forEach((card) => {
    if (card !== targetCard) {
      toggleEdit.call(card.querySelector('.edit-button'));
    }
  });
});

document.querySelector('#dark-mode-toggle').addEventListener('click', toggleDarkMode);
document.querySelectorAll('.add-card-button').forEach(button => button.addEventListener('click', addCard));
document.querySelector('#add-list-button').addEventListener('click', addList);
document.querySelectorAll('.card-title').forEach(title => title.addEventListener('blur', updateTitle));
document.querySelectorAll('.edit-button').forEach(button => button.addEventListener('click', toggleEdit));
document.querySelectorAll('.card').forEach(card => updateCardFields(card));
updateCardNumbers();
updateCardStyles();
document.body.classList.add('dark-mode');
