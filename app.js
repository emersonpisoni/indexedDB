import { NotesDB } from './db.js';

const form = document.getElementById('note-form');
const idField = document.getElementById('note-id');
const titleField = document.getElementById('note-title');
const contentField = document.getElementById('note-content');
const tagField = document.getElementById('note-tag');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const filterTag = document.getElementById('filter-tag');
const clearAllBtn = document.getElementById('clear-all-btn');
const list = document.getElementById('note-list');
const emptyState = document.getElementById('empty-state');
const logBox = document.getElementById('log');

function log(message, level = 'log') {
  const line = document.createElement('div');
  line.className = `log-line ${level}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function resetForm() {
  form.reset();
  idField.value = '';
  cancelBtn.hidden = true;
  saveBtn.textContent = 'Salvar';
}

async function refresh() {
  const tag = filterTag.value.trim();
  const notes = tag
    ? await NotesDB.listByTag(tag)
    : await NotesDB.listSortedByDateDesc();

  list.innerHTML = '';
  emptyState.hidden = notes.length > 0;

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = 'note-item';

    const header = document.createElement('header');
    const h3 = document.createElement('h3');
    h3.textContent = note.title;
    header.appendChild(h3);

    if (note.tag) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = note.tag;
      header.appendChild(span);
    }

    const p = document.createElement('p');
    p.textContent = note.content;

    const time = document.createElement('time');
    time.textContent = `criada em ${new Date(note.createdAt).toLocaleString()}`;
    if (note.updatedAt) {
      time.textContent += ` • editada em ${new Date(note.updatedAt).toLocaleString()}`;
    }

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar';
    editBtn.className = 'ghost';
    editBtn.addEventListener('click', () => startEdit(note));

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Excluir';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => removeNote(note.id));

    actions.append(editBtn, delBtn);
    li.append(header, p, time, actions);
    list.appendChild(li);
  }

  log(`Listagem atualizada (${notes.length} nota${notes.length === 1 ? '' : 's'}).`);
}

function startEdit(note) {
  idField.value = note.id;
  titleField.value = note.title;
  contentField.value = note.content;
  tagField.value = note.tag || '';
  cancelBtn.hidden = false;
  saveBtn.textContent = 'Atualizar';
  titleField.focus();
}

async function removeNote(id) {
  if (!confirm('Excluir esta nota?')) return;
  await NotesDB.remove(id);
  log(`Nota ${id} removida.`, 'success');
  await refresh();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const note = {
    title: titleField.value.trim(),
    content: contentField.value.trim(),
    tag: tagField.value.trim(),
  };

  try {
    if (idField.value) {
      const id = Number(idField.value);
      await NotesDB.update(id, note);
      log(`Nota ${id} atualizada.`, 'success');
    } else {
      const id = await NotesDB.add(note);
      log(`Nota ${id} criada.`, 'success');
    }
    resetForm();
    await refresh();
  } catch (err) {
    log(`Erro ao salvar: ${err.message}`, 'error');
  }
});

cancelBtn.addEventListener('click', resetForm);

filterTag.addEventListener('input', () => {
  refresh();
});

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Apagar TODAS as notas?')) return;
  await NotesDB.clear();
  log('Object store limpo.', 'success');
  await refresh();
});

(async () => {
  try {
    await NotesDB.init(log);
    await refresh();
  } catch (err) {
    log(`Falha na inicialização: ${err.message}`, 'error');
  }
})();
