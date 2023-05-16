let draggedItem = null;
let lastDeletedItem = null;

document.querySelectorAll('.card, .card *').forEach(element => {
  element.addEventListener('dragstart', function(e) {
    e.stopPropagation();
    dragStart.call(this.closest('.card'));
  });
  element.addEventListener('dragend', function(e) {
    e.stopPropagation();
    dragEnd.call(this.closest('.card'));
  });
  applyImageBackground(card);
});

document.querySelectorAll('.card-container').forEach(container => {
  container.addEventListener('dragover', dragOver);
  container.addEventListener('dragenter', dragEnter);
  container.addEventListener('dragleave', dragExit);
});

document.querySelectorAll('.list').forEach(list => {
  list.addEventListener('dragover', dragOver);
  //list.addEventListener('dragleave', dragLeave);
});

document.querySelectorAll('.add-card-button').forEach(button => {
  button.addEventListener('click', addCard);
});

document.querySelector('#board').addEventListener('click', function(e) {
  if(e.target && e.target.classList.contains('edit-button')) {
     toggleEdit.call(e.target);
  }
});

function dragStart() {
  draggedItem = this;
  this.classList.add('dragging');
}

function dragEnd() {
  this.classList.remove('dragging');
  updateCardNumbers();
  applyImageBackground(this);
  draggedItem = null;
}

function dragOver(e) {
  e.preventDefault();
  const afterElement = getDragAfterElement(this, e.clientY);
  const card = document.querySelector('.dragging');
  if (afterElement == null) {
    this.appendChild(card);
  } else {
    this.insertBefore(card, afterElement);
  }
}

function dragEnter(e) {
  e.preventDefault();
  this.style.border = '3px dashed #000';
}

function dragExit(e) {
  this.style.border = 'none';
}

function dragLeave(e) {
  if (this.contains(draggedItem) && !this.contains(e.relatedTarget)) {
    this.removeChild(draggedItem);
  }
}

function getDragAfterElement(list, y) {
  const cardElements = [...list.querySelectorAll('.card:not(.dragging)')];

  return cardElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateCardNumbers() {
  document.querySelectorAll('.list').forEach((list, listIdx) => {
    list.querySelectorAll('.card').forEach((card, cardIdx) => {
      card.querySelector('.card-number').textContent = `${cardIdx + 1}`;
    });
  });
  updateCardNumberColors();
}

function addCard() {
  const list = this.parentNode.parentNode;
  const cardContainer = list.querySelector('.card-container');
  const newCard = createCardElement();
  cardContainer.appendChild(newCard);
  newCard.querySelector('.card-name').focus();
  updateCardNumbers();
  updateCardNumberColors();
  updateCardNumberColors();
  updateCardStyles();
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

  const cardName = document.createElement('div');
  cardName.contentEditable = true;
  cardName.classList.add('card-name');
  cardName.setAttribute('placeholder', 'Name'); // Set placeholder attribute
  cardInfo.appendChild(cardName);

  const cardSeries = document.createElement('div');
  cardSeries.contentEditable = true;
  cardSeries.classList.add('card-series');
  cardSeries.setAttribute('placeholder', 'Series'); // Set placeholder attribute
  cardInfo.appendChild(cardSeries);

  const cardImageUrl = document.createElement('div');
  cardImageUrl.contentEditable = 'plaintext-only';
  cardImageUrl.classList.add('card-image-url');
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
  
  Array.from(card.children).forEach(child => {
    child.addEventListener('dragstart', function(e) {
      e.stopPropagation();
      dragStart.call(card);
    });
    child.addEventListener('dragend', function(e) {
      e.stopPropagation();
      dragEnd.call(card);
    });
  });
  
  cardName.addEventListener('input', updateCardStyles);
  cardSeries.addEventListener('input', updateCardStyles);
  cardImageUrl.addEventListener('input', () => {
  applyImageBackground(card);
  updateCardStyles();
  
});

  
  return card;
}

function updateCardStyles() {
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

function updateCardFields(card) {
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

function togglePlaceholder(element) {
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

function applyImageBackground(card) {
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

function deleteCard() {
  const card = this.parentNode;
  const list = card.parentNode;
  lastDeletedItem = { card, list };
  list.removeChild(card);
}

function undoDelete() {
  if (lastDeletedItem) {
    const { card, list } = lastDeletedItem;
    list.insertBefore(card, list.firstChild);
    lastDeletedItem = null;
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    undoDelete();
  }
});

document.querySelectorAll('.list-title').forEach(title => {
  title.addEventListener('blur', function() {
    // Replace with your own logic to save the new title
    console.log('New title:', this.textContent);
  });
});

// Change card numbers for top 10
function updateCardNumberColors() {
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

document.querySelectorAll('.card-number').forEach((element) => {
  const cardNumber = Number(element.innerText);
  if (cardNumber === 1) {
    element.classList.add('first-card');
  } else if (cardNumber <= 10) {
    element.classList.add('less-than-ten');
  }
});

// Add event listeners to the delete button
const deleteButton = document.querySelector("#delete-button");
deleteButton.addEventListener('dragover', deleteOver);
deleteButton.addEventListener('dragenter', deleteEnter);
deleteButton.addEventListener('dragleave', deleteLeave);
deleteButton.addEventListener('drop', deleteDrop);

// When a card is over the delete button
function deleteOver(e) {
  e.preventDefault();
  deleteButton.style.backgroundColor = 'red'; // Change the color of the delete button to indicate it's active
}

// When a card enters the delete button area
function deleteEnter(e) {
  e.preventDefault();
}

// When a card leaves the delete button area
function deleteLeave(e) {
  deleteButton.style.backgroundColor = ''; // Reset the color of the delete button
}

// When a card is dropped on the delete button
function deleteDrop(e) {
  e.preventDefault();
  if (draggedItem != null) {
    draggedItem.remove();
    draggedItem = null;
  }
  deleteButton.style.backgroundColor = ''; // Reset the color of the delete button
}

// Dark Mode
document.addEventListener('DOMContentLoaded', (event) => {
    document.body.classList.add("dark-mode");
});

const toggleButton = document.getElementById("dark-mode-toggle");

toggleButton.addEventListener("click", function() {
  if (document.body.classList.contains("dark-mode")) {
    document.body.classList.remove("dark-mode");
    toggleButton.classList.remove("fa-sun");  // Change to sun icon
    toggleButton.classList.add("fa-moon");  // Remove moon icon
  } else {
    document.body.classList.add("dark-mode");
    toggleButton.classList.remove("fa-moon");  // Remove moon icon
    toggleButton.classList.add("fa-sun");  // Change to sun icon
  }
});
