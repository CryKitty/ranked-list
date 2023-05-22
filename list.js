let draggedItem = null;
let lastDeletedItem = null;

const applyImageBackground = (card) => {
  const cardTitle = card.querySelector('.card-name');
  const cardSubtitle = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');
  const imageUrl = cardImageUrl.value.trim();

  if (imageUrl !== '') {
    card.style.backgroundImage = `url("${imageUrl}")`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
    cardTitle.style.color = 'white';
    cardSubtitle.style.color = 'white';
    if (!card.classList.contains('edit-mode')) {
      cardImageUrl.style.display = 'none';
    }
  } else {
    card.style.backgroundImage = 'none';
    if (!card.classList.contains('edit-mode')) { // Add this check here as well
      cardImageUrl.style.display = 'block';
    }
    cardTitle.style.color = 'white';
    cardSubtitle.style.color = 'white';
  }
}

const updateCardFields = (card) => {
  const cardName = card.querySelector('.card-name');
  const cardSeries = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');

  cardName.value = cardName.value.trim();
  cardSeries.value = cardSeries.value.trim();
  cardImageUrl.value = cardImageUrl.value.trim();
  
  // Apply image background
  applyImageBackground(card);

  // Hide the series field if it's empty and the card name is not empty
  if (cardName.value !== '' && cardSeries.value === '') {
    cardSeries.style.display = 'none';
  } else {
    cardSeries.style.display = 'block';
  }
}

// Add touchstart event for mobile devices
card.addEventListener('touchstart', function(e) {
  // Ignore touches on the delete button
  if (!e.target.classList.contains('delete-button')) {
    e.preventDefault(); // prevent the default behavior
    toggleEdit.call(this);
  }
});

// Update the position of the card while dragging on mobile
card.addEventListener('touchmove', function(e) {
  const touch = e.touches[0];
  this.style.left = touch.pageX + 'px';
  this.style.top = touch.pageY + 'px';
});


const updateCardStyles = () => {
  document.querySelectorAll('.card').forEach((card) => {
    const cardName = card.querySelector('.card-name').value.trim();
    const cardSeries = card.querySelector('.card-series').value.trim();
    const cardImageUrl = card.querySelector('.card-image-url').value.trim();

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
      card.querySelector('.card-number').innerText = `${cardIdx + 1}`; // Modified line
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

function addSortable(list) {
  new Sortable(list, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    onStart: function(evt) {
      evt.item.classList.add('dragging');
    },
    onEnd: function(evt) {
      evt.item.classList.remove('dragging');
      updateCardNumbers();
      document.querySelectorAll('.card').forEach(card => applyImageBackground(card));
    },
  });
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
  
  // Make the card in edit-mode by default
  const cardName = card.querySelector('.card-name');
  const cardSeries = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');
  
  card.classList.add('edit-mode');
  cardName.readOnly = false;
  cardSeries.readOnly = false;
  cardImageUrl.readOnly = false;
  cardImageUrl.style.display = 'block';
  cardName.focus(); // focus the card name field

  // Add event listeners to the new card
  card.addEventListener('click', function(e) {
    // Ignore clicks on the delete button
    if (!e.target.classList.contains('delete-button')) {
      toggleEdit.call(this);
    }
  });

  // Add touchstart event for mobile devices
  card.addEventListener('touchstart', function(e) {
    // Ignore touches on the delete button
    if (!e.target.classList.contains('delete-button')) {
      toggleEdit.call(this);
    }
  });
}

const addList = function() {
  const board = document.querySelector('#board');
  const list = createListElement();
  const addButton = document.querySelector('#add-list-button');
  board.insertBefore(list, addButton);
  updateCardNumbers();
  
  // Add sortable to the new list
  const cardContainer = list.querySelector('.card-container');
  addSortable(cardContainer);
}

const toggleEdit = function() {
  const card = this.closest('.card');
  const cardName = card.querySelector('.card-name');
  const cardSeries = card.querySelector('.card-series');
  const cardImageUrl = card.querySelector('.card-image-url');

  card.classList.toggle('edit-mode');
  
  const isEditMode = card.classList.contains('edit-mode');
  
  cardName.readOnly = !isEditMode;
  cardSeries.readOnly = !isEditMode;
  cardImageUrl.readOnly = !isEditMode;
  const deleteButton = card.querySelector('.delete-button');

  if (isEditMode) {
    deleteButton.classList.remove('hide'); // show the button in edit mode
    cardName.focus(); // focus the card name field
  } else {
    deleteButton.classList.add('hide'); // hide the button in non-edit mode
    updateCardFields(card);
  }

  // Toggle the overlay visibility
  card.classList.toggle('overlay-visible', !isEditMode);
}

const updateTitle = function() {
  this.value = this.value.trim();
  if (this.value === '') {
    this.value = 'Untitled';
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

  const cardInner = document.createElement('div');
    cardInner.classList.add('card-inner');

  // Here we create new div to contain name and series
  const cardInfoBottom = document.createElement('div');
    cardInfoBottom.classList.add('card-info-bottom');
    cardInfoBottom.style.display = 'flex';
    cardInfoBottom.style.flexDirection = 'column';

  const cardName = document.createElement('input');
    cardName.classList.add('card-name');
    cardName.setAttribute('placeholder', 'Name');
    cardName.readOnly = true;
    cardInfoBottom.appendChild(cardName);

  const cardSeries = document.createElement('input');
    cardSeries.classList.add('card-series');
    cardSeries.setAttribute('placeholder', 'Series');
    cardSeries.readOnly = true;
    cardInfoBottom.appendChild(cardSeries);
    cardInner.appendChild(cardInfoBottom);

  const cardImageUrl = document.createElement('input');
    cardImageUrl.classList.add('card-image-url');
    cardImageUrl.setAttribute('placeholder', 'Image URL');
    cardImageUrl.readOnly = true;
    cardImageUrl.addEventListener('input', () => {
      applyImageBackground(card);
    });
    cardInner.appendChild(cardImageUrl);  // cardImageUrl is now appended directly to cardInner
  
  const cardNumber = document.createElement('div');
    cardNumber.classList.add('card-number');
    cardNumber.innerText = "0";
    cardInner.appendChild(cardNumber);
    card.appendChild(cardInner);

  cardName.addEventListener('change', updateCardStyles);
  cardSeries.addEventListener('change', updateCardStyles);
  cardImageUrl.addEventListener('change', () => {
    applyImageBackground(card);
    updateCardStyles();
  });

  // Delete Button
  const deleteButton = document.createElement('button');
  const deleteIcon = document.createElement('i');
  deleteIcon.classList.add('fas', 'fa-trash');
  deleteIcon.style.color = 'white'; // White color
  deleteButton.style.backgroundColor = 'transparent'; // No background
  deleteButton.style.border = 'none'; // No border
  deleteButton.style.boxShadow = 'none'; // No shadow
  deleteButton.appendChild(deleteIcon);
  deleteButton.classList.add('delete-button', 'hide'); // hide the button by default
  deleteButton.addEventListener('click', function() {
    lastDeletedItem = card;
    card.remove();
    updateCardNumbers();
  });

  cardInner.insertBefore(deleteButton, cardNumber);
  
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
  addCardButton.innerText = '+';
  addCardButton.addEventListener('click', addCard);
  listHeader.appendChild(addCardButton);

  const cardContainer = document.createElement('div');
  cardContainer.classList.add('card-container');
  list.appendChild(cardContainer);

  return list;
}

document.querySelector('#dark-mode-toggle').addEventListener('click', toggleDarkMode);
document.querySelectorAll('.add-card-button').forEach(button => button.addEventListener('click', addCard));
document.querySelector('#add-list-button').addEventListener('click', addList);
document.querySelectorAll('.card-title').forEach(title => title.addEventListener('blur', updateTitle));

// Toggle Edit Mode
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', function(e) {
    // Ignore clicks on the delete button
    if (!e.target.classList.contains('delete-button')) {
      toggleEdit.call(this);
    }
  });

  // Add touchend event for mobile devices
  card.addEventListener('touchend', function(e) {
    // Ignore touches on the delete button
    if (!e.target.classList.contains('delete-button')) {
      toggleEdit.call(this);
    }
  });
});

document.addEventListener('click', (e) => {
  const targetCard = e.target.closest('.card');
  document.querySelectorAll('.card.edit-mode').forEach((card) => {
    if (card !== targetCard) {
      toggleEdit.call(card);
    }
  });
});

document.addEventListener('touchend', (e) => {
  const targetCard = e.target.closest('.card');
  document.querySelectorAll('.card.edit-mode').forEach((card) => {
    if (card !== targetCard) {
      toggleEdit.call(card);
    }
  });
});

document.querySelectorAll('.card').forEach(card => updateCardFields(card));
document.querySelectorAll('.card-container').forEach(cardContainer => addSortable(cardContainer));
updateCardNumbers();
updateCardStyles();
document.body.classList.add('dark-mode');
