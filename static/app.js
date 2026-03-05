const API = '';
let records = {};
let activeFilter = 'all';
let lastScanned = null;
let lastScannedTime = 0;
const COOLDOWN_MS = 4000;
let toastTimer = null;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const manualInput = document.getElementById('manualInput');
const manualBtn = document.getElementById('manualBtn');
const feedback = document.getElementById('feedback');
const tableBody = document.getElementById('tableBody');
const emptyMsg = document.getElementById('emptyMsg');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const connDot = document.getElementById('connDot');
const connLabel = document.getElementById('connLabel');

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setFeedback(msg, type) {
  feedback.textContent = msg;
  feedback.className = type === 'ok' ? 'feedback-ok' : type === 'warn' ? 'feedback-warn' : 'feedback-err';
}

function showToast(msg, type) {
  const prev = document.getElementById('scanToast');
  if (prev) prev.remove();
  clearTimeout(toastTimer);

  const el = document.createElement('div');
  el.id = 'scanToast';
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);

  toastTimer = setTimeout(() => {
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

function setConn(ok) {
  connDot.className = 'conn-dot ' + (ok ? 'ok' : 'err');
  connLabel.textContent = ok ? 'Connected to server' : 'Cannot reach server';
}

async function loadRecords() {
  try {
    const res = await fetch(API + '/records');
    if (!res.ok) throw new Error();
    const data = await res.json();
    records = data.records;
    setConn(true);
    renderTable();
  } catch {
    setConn(false);
  }
}

async function checkin(id) {
  id = id.trim();
  if (!id) return;

  const now = Date.now();
  if (id === lastScanned && now - lastScannedTime < COOLDOWN_MS) return;
  lastScanned = id;
  lastScannedTime = now;

  try {
    const res = await fetch(API + '/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: id })
    });
    const data = await res.json();
    records[data.student_id] = data.scans;

    const type = data.status === 'already_complete' ? 'warn' : 'ok';
    showToast(data.message, type);
    setConn(true);
    renderTable();
  } catch {
    setConn(false);
    showToast('Server error — check-in could not be saved.', 'err');
  }
}

function renderTable() {
  const ids = Object.keys(records);
  const completed = ids.filter(id => records[id].length >= 3);
  exportBtn.disabled = completed.length === 0;

  const filtered = ids.filter(id => {
    const n = records[id].length;
    if (activeFilter === 'done') return n >= 3;
    if (activeFilter === 'partial') return n < 3;
    return true;
  });

  emptyMsg.style.display = filtered.length === 0 ? 'block' : 'none';
  tableBody.innerHTML = '';

  filtered.sort().forEach(id => {
    const scans = records[id];
    const done = scans.length >= 3;
    const tr = document.createElement('tr');

    const checkCells = [0, 1, 2].map(i => {
      if (scans[i]) {
        return `<div class="check-item">
          <span class="tick">✓</span>
          <span class="time-label">${formatTime(scans[i].timestamp)}</span>
          <button class="btn-del-scan" data-checkin-id="${scans[i].id}" data-student-id="${id}" title="Remove this check-in">✕</button>
        </div>`;
      }
      return `<div class="check-item" style="color:#ccc">—</div>`;
    }).join('');

    tr.innerHTML = `
      <td>
        <strong>${id}</strong>
        <button class="btn-edit-id" data-id="${id}" title="Edit student ID">Edit</button>
      </td>
      <td><div class="check-cell">${checkCells}</div></td>
      <td>${done
        ? '<span class="badge badge-done">Complete</span>'
        : `<span class="badge badge-partial">${scans.length}/3</span>`
      }</td>
      <td><button class="btn-del-row" data-id="${id}">Delete</button></td>
    `;
    tableBody.appendChild(tr);
  });
}

function startEditId(td, oldId) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldId;
  input.className = 'edit-id-input';
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newId = input.value.trim();
    if (newId && newId !== oldId) {
      await renameStudent(oldId, newId);
    } else {
      renderTable();
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') { saved = true; renderTable(); }
  });
  input.addEventListener('blur', save);
}

async function deleteCheckin(checkinId, studentId) {
  try {
    await fetch(`${API}/checkins/${checkinId}`, { method: 'DELETE' });
    records[studentId] = records[studentId].filter(s => s.id !== checkinId);
    if (records[studentId].length === 0) delete records[studentId];
    setConn(true);
    renderTable();
  } catch {
    setConn(false);
    showToast('Could not delete check-in.', 'err');
  }
}

async function deleteStudent(id) {
  try {
    await fetch(`${API}/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
    delete records[id];
    setConn(true);
    renderTable();
  } catch {
    setConn(false);
    showToast('Could not delete student.', 'err');
  }
}

async function renameStudent(oldId, newId) {
  try {
    await fetch(`${API}/records/${encodeURIComponent(oldId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_student_id: newId })
    });
    records[newId] = records[oldId];
    delete records[oldId];
    setConn(true);
    renderTable();
  } catch {
    setConn(false);
    showToast('Could not rename student.', 'err');
  }
}

tableBody.addEventListener('click', e => {
  const delScan = e.target.closest('.btn-del-scan');
  const delRow = e.target.closest('.btn-del-row');
  const editId = e.target.closest('.btn-edit-id');
  if (delScan) {
    deleteCheckin(parseInt(delScan.dataset.checkinId), delScan.dataset.studentId);
  } else if (delRow) {
    if (!confirm(`Delete all check-ins for ${delRow.dataset.id}?`)) return;
    deleteStudent(delRow.dataset.id);
  } else if (editId) {
    startEditId(editId.closest('td'), editId.dataset.id);
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTable();
  });
});

manualBtn.addEventListener('click', () => {
  checkin(manualInput.value);
  manualInput.value = '';
});

manualInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    checkin(manualInput.value);
    manualInput.value = '';
  }
});

exportBtn.addEventListener('click', () => {
  const completed = Object.entries(records).filter(([, scans]) => scans.length >= 3);
  const rows = [['Student ID', 'Check-in 1', 'Check-in 2', 'Check-in 3']];
  completed.forEach(([id, scans]) => {
    rows.push([id, formatTime(scans[0].timestamp), formatTime(scans[1].timestamp), formatTime(scans[2].timestamp)]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;base64,' + btoa(csv);
  a.download = 'completed-checkins.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all check-in records? This cannot be undone.')) return;
  try {
    await fetch(API + '/records', { method: 'DELETE' });
    records = {};
    setFeedback('All records cleared.', 'warn');
    renderTable();
  } catch {
    setFeedback('Server error — could not clear records.', 'err');
  }
});

// Quagga scanner — onDetected registered once here, not inside the click handler
Quagga.onDetected(result => {
  const code = result.codeResult.code;
  if (code) checkin(code);
});

startBtn.addEventListener('click', () => {
  Quagga.init({
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target: document.getElementById('viewport'),
      constraints: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    decoder: {
      readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'upc_reader', 'codabar_reader']
    },
    locate: true
  }, err => {
    if (err) {
      showToast('Camera error: ' + err.message, 'err');
      return;
    }
    Quagga.start();
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
  });
});

stopBtn.addEventListener('click', () => {
  Quagga.stop();
  startBtn.style.display = 'inline-block';
  stopBtn.style.display = 'none';
});

// Poll for updates every 10s so multiple instances stay in sync
loadRecords();
setInterval(loadRecords, 10000);
