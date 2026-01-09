const folderInput = document.getElementById('folderInput');
const filesInput = document.getElementById('filesInput');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const preview = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadAll');
const dragDropZone = document.getElementById('dragDropZone');

const reduceRange = document.getElementById('reduceRange');
const reduceInput = document.getElementById('reduceInput');

const includeOriginals = document.getElementById('includeOriginals');
const zipOutput = document.getElementById('zipOutput');

let folderMap = {};
let outputFiles = [];
let processToken = 0;
let reduceTimer = null;

/* ---------- Buttons ---------- */
browseFolderBtn.onclick = () => folderInput.click();
browseFilesBtn.onclick = () => filesInput.click();
folderInput.onchange = e => handleFiles(e.target.files, true);
filesInput.onchange = e => handleFiles(e.target.files, false);

/* ---------- Drag & Drop ---------- */
dragDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dragDropZone.classList.add('dragover');
});

dragDropZone.addEventListener('dragleave', () => {
  dragDropZone.classList.remove('dragover');
});

dragDropZone.addEventListener('drop', e => {
  e.preventDefault();
  dragDropZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files, false);
});

/* ---------- Reduce Sync (Debounced) ---------- */
reduceRange.oninput = reduceInput.oninput = () => {
  reduceRange.value = reduceInput.value;

  clearTimeout(reduceTimer);
  reduceTimer = setTimeout(() => {
    processToken++;
    processAll(processToken);
  }, 300);
};

/* ---------- Handle Files (NEW SESSION) ---------- */
function handleFiles(files, isFolder) {
  processToken++;
  folderMap = {};
  outputFiles = [];
  preview.innerHTML = '';
  downloadBtn.disabled = true;

  [...files].forEach(file => {
    if (!file.type.startsWith('image/')) return;

    const folder = isFolder && file.webkitRelativePath
      ? file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('/'))
      : 'Selected Files';

    (folderMap[folder] ||= []).push(file);
  });

  processAll(processToken);
}

/* ---------- Image Compression ---------- */
async function processAll(token) {
  preview.innerHTML = '';
  outputFiles = [];
  downloadBtn.disabled = true;

  const reducePercent = reduceRange.value / 100;

  for (const [folder, files] of Object.entries(folderMap)) {
    if (token !== processToken) return;

    const group = document.createElement('div');
    group.className = 'folder-group';
    group.innerHTML = `
      <div class="folder-title">📁 ${folder}</div>
      <div class="folder-images"></div>
    `;
    preview.appendChild(group);

    const container = group.querySelector('.folder-images');

    for (const file of files) {
      if (token !== processToken) return;

      const card = document.createElement('div');
      card.className = 'card';
      card.textContent = 'Processing...';
      container.appendChild(card);

      await new Promise(r => requestAnimationFrame(r));

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);

      const targetSize = file.size * (1 - reducePercent);
      let quality = 0.92;
      let blob;

      do {
        blob = await new Promise(res =>
          canvas.toBlob(res, file.type, quality)
        );
        quality -= 0.07;
      } while (blob.size > targetSize && quality > 0.15);

      bitmap.close();
      canvas.width = canvas.height = 0;

      const url = URL.createObjectURL(blob);

      if (includeOriginals.checked) {
        outputFiles.push({ folder, name: file.name, blob: file });
      }
      outputFiles.push({ folder, name: file.name, blob });

      card.innerHTML = `
        <p>${file.name}</p>
        <img src="${url}">
        <p>${Math.round(file.size/1024)} KB → ${Math.round(blob.size/1024)} KB</p>
      `;

      card.querySelector('img').onload = () => URL.revokeObjectURL(url);
    }
  }

  downloadBtn.disabled = !outputFiles.length;
}

/* ---------- Download ---------- */
downloadBtn.onclick = async () => {
  if (!zipOutput.checked) {
    outputFiles.forEach(f => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f.blob);
      a.download = f.name;
      a.click();
    });
    return;
  }

  const zip = new JSZip();
  for (const f of outputFiles) {
    zip.folder(f.folder).file(f.name, f.blob);
    await new Promise(r => setTimeout(r));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'images.zip';
  a.click();
};
