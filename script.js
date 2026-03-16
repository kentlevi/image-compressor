const folderInput = document.getElementById("folderInput");
const filesInput = document.getElementById("filesInput");
const browseFolderBtn = document.getElementById("browseFolderBtn");
const browseFilesBtn = document.getElementById("browseFilesBtn");
const preview = document.getElementById("preview");
const downloadBtn = document.getElementById("downloadAll");
const dragDropZone = document.getElementById("dragDropZone");
const reduceRange = document.getElementById("reduceRange");
const reduceInput = document.getElementById("reduceInput");
const includeOriginals = document.getElementById("includeOriginals");
const zipOutput = document.getElementById("zipOutput");
const summaryTitle = document.getElementById("summaryTitle");
const summaryMeta = document.getElementById("summaryMeta");
const statusMessage = document.getElementById("statusMessage");

let sourceGroups = {};
let processedGroups = [];
let processToken = 0;
let reduceTimer = null;

function setStatus(message = "", type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message${type ? ` status-message--${type}` : ""}`;
}

function setSummary(title, meta) {
  summaryTitle.textContent = title;
  summaryMeta.textContent = meta;
}

function revokePreviewUrls() {
  processedGroups.forEach((group) => {
    group.items.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  });
}

function resetSessionUi() {
  revokePreviewUrls();
  processedGroups = [];
  preview.innerHTML = "";
  downloadBtn.disabled = true;
}

function getReductionValue() {
  const parsedValue = Number.parseInt(reduceInput.value, 10);
  if (Number.isNaN(parsedValue)) {
    return 60;
  }

  return Math.min(90, Math.max(10, parsedValue));
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateDownloadState() {
  const completedItems = processedGroups.flatMap((group) => group.items).filter((item) => item.compressedBlob);
  downloadBtn.disabled = completedItems.length === 0;
}

function updateSummaryFromSource() {
  const folders = Object.keys(sourceGroups);
  const totalFiles = folders.reduce((count, folder) => count + sourceGroups[folder].length, 0);

  if (!totalFiles) {
    setSummary("No images selected", "Choose a folder, files, or drag images into the workspace.");
    return;
  }

  setSummary(
    `${totalFiles} image${totalFiles === 1 ? "" : "s"} ready`,
    `${folders.length} group${folders.length === 1 ? "" : "s"} selected`
  );
}

function syncReductionControls() {
  const clampedValue = getReductionValue();
  reduceRange.value = clampedValue;
  reduceInput.value = clampedValue;
}

function scheduleReprocess() {
  if (!Object.keys(sourceGroups).length) {
    syncReductionControls();
    return;
  }

  clearTimeout(reduceTimer);
  reduceTimer = setTimeout(() => {
    processToken += 1;
    processAll(processToken);
  }, 250);
}

function handleFiles(fileList, isFolder) {
  processToken += 1;
  sourceGroups = {};
  resetSessionUi();

  [...fileList].forEach((file) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const folder = isFolder && file.webkitRelativePath
      ? file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf("/"))
      : "Selected Files";

    (sourceGroups[folder] ||= []).push(file);
  });

  updateSummaryFromSource();

  if (!Object.keys(sourceGroups).length) {
    setStatus("No supported image files were found in this selection.", "empty");
    return;
  }

  processAll(processToken);
}

async function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Canvas encoding returned no blob"));
    }, type, quality);
  });
}

async function compressFile(file, reductionPercent) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("2D canvas context is not available");
  }

  context.drawImage(bitmap, 0, 0);

  const targetSize = Math.max(1024, file.size * (1 - reductionPercent));
  let quality = 0.92;
  let blob = await blobFromCanvas(canvas, file.type, quality);

  while (blob.size > targetSize && quality > 0.15) {
    quality -= 0.07;
    blob = await blobFromCanvas(canvas, file.type, quality);
  }

  bitmap.close();
  canvas.width = 0;
  canvas.height = 0;

  return {
    compressedBlob: blob,
    reductionPercent: Math.max(0, Math.round((1 - blob.size / file.size) * 100)),
  };
}

function renderProcessedGroups() {
  preview.innerHTML = "";

  processedGroups.forEach((group) => {
    const groupEl = document.createElement("section");
    groupEl.className = "folder-group";
    groupEl.innerHTML = `
      <div class="folder-title">${group.folder}</div>
      <div class="folder-images"></div>
    `;
    preview.appendChild(groupEl);

    const container = groupEl.querySelector(".folder-images");

    group.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = `card${item.error ? " card--error" : ""}`;

      if (item.error) {
        card.innerHTML = `
          <p class="card__name">${item.name}</p>
          <p class="card__message">Compression failed</p>
          <p class="card__meta">${item.error}</p>
        `;
      } else if (!item.compressedBlob) {
        card.innerHTML = `
          <p class="card__name">${item.name}</p>
          <p class="card__message">Processing...</p>
          <p class="card__meta">Generating preview and compressed output.</p>
        `;
      } else {
        card.innerHTML = `
          <p class="card__name">${item.name}</p>
          <img src="${item.previewUrl}" alt="${item.name}">
          <p class="card__meta">${formatSize(item.originalFile.size)} to ${formatSize(item.compressedBlob.size)}</p>
          <p class="card__meta">Reduced by ${item.reductionPercent}%</p>
        `;
      }

      container.appendChild(card);
    });
  });
}

async function processAll(token) {
  resetSessionUi();
  setStatus("Compressing images...", "loading");
  syncReductionControls();

  const reductionPercent = getReductionValue() / 100;
  const groups = Object.entries(sourceGroups);
  let successCount = 0;
  let failureCount = 0;

  for (const [folder, files] of groups) {
    if (token !== processToken) {
      return;
    }

    const group = { folder, items: [] };
    processedGroups.push(group);
    renderProcessedGroups();

    for (const file of files) {
      if (token !== processToken) {
        return;
      }

      const pendingItem = {
        name: file.name,
        originalFile: file,
        compressedBlob: null,
        previewUrl: "",
        reductionPercent: 0,
        error: "",
      };

      group.items.push(pendingItem);
      renderProcessedGroups();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      try {
        const result = await compressFile(file, reductionPercent);
        pendingItem.compressedBlob = result.compressedBlob;
        pendingItem.previewUrl = URL.createObjectURL(result.compressedBlob);
        pendingItem.reductionPercent = result.reductionPercent;
        successCount += 1;
      } catch (error) {
        pendingItem.error = error instanceof Error ? error.message : "Unknown compression error";
        failureCount += 1;
      }

      renderProcessedGroups();
      updateDownloadState();
    }
  }

  if (successCount && !failureCount) {
    setStatus(`Compression complete. ${successCount} image${successCount === 1 ? "" : "s"} ready to download.`, "success");
  } else if (successCount && failureCount) {
    setStatus(`Completed with partial failures. ${successCount} succeeded, ${failureCount} failed.`, "warning");
  } else {
    setStatus("No images could be compressed from this selection.", "error");
  }
}

function getDownloadEntries() {
  const entries = [];

  processedGroups.forEach((group) => {
    group.items.forEach((item) => {
      if (!item.compressedBlob) {
        return;
      }

      if (includeOriginals.checked) {
        entries.push({
          kind: "original",
          folder: group.folder,
          name: item.originalFile.name,
          blob: item.originalFile,
        });
      }

      entries.push({
        kind: "compressed",
        folder: group.folder,
        name: item.originalFile.name,
        blob: item.compressedBlob,
      });
    });
  });

  return entries;
}

async function downloadEntries(entries) {
  if (!entries.length) {
    setStatus("Nothing is ready to download yet.", "empty");
    return false;
  }

  if (!zipOutput.checked) {
    entries.forEach((entry) => {
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(entry.blob);
      const extensionIndex = entry.name.lastIndexOf(".");
      const baseName = extensionIndex >= 0 ? entry.name.slice(0, extensionIndex) : entry.name;
      const extension = extensionIndex >= 0 ? entry.name.slice(extensionIndex) : "";
      link.href = objectUrl;
      link.download = entry.kind === "compressed" ? `${baseName}-compressed${extension}` : entry.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    });
    return true;
  }

  const zip = new JSZip();
  entries.forEach((entry) => {
    const extensionIndex = entry.name.lastIndexOf(".");
    const baseName = extensionIndex >= 0 ? entry.name.slice(0, extensionIndex) : entry.name;
    const extension = extensionIndex >= 0 ? entry.name.slice(extensionIndex) : "";
    const finalName = entry.kind === "compressed" ? `${baseName}-compressed${extension}` : entry.name;
    zip.folder(entry.folder).file(finalName, entry.blob);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = "compressed-images.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return true;
}

browseFolderBtn.addEventListener("click", () => folderInput.click());
browseFilesBtn.addEventListener("click", () => filesInput.click());
dragDropZone.addEventListener("click", () => filesInput.click());

folderInput.addEventListener("change", (event) => handleFiles(event.target.files, true));
filesInput.addEventListener("change", (event) => handleFiles(event.target.files, false));

dragDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dragDropZone.classList.add("dragover");
});

dragDropZone.addEventListener("dragleave", () => {
  dragDropZone.classList.remove("dragover");
});

dragDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDropZone.classList.remove("dragover");
  handleFiles(event.dataTransfer.files, false);
});

reduceRange.addEventListener("input", () => {
  reduceInput.value = reduceRange.value;
  scheduleReprocess();
});

reduceInput.addEventListener("input", () => {
  syncReductionControls();
  scheduleReprocess();
});

includeOriginals.addEventListener("change", updateDownloadState);
zipOutput.addEventListener("change", updateDownloadState);

downloadBtn.addEventListener("click", async () => {
  setStatus("Preparing download...", "loading");

  try {
    const didDownload = await downloadEntries(getDownloadEntries());
    if (didDownload) {
      setStatus("Download prepared.", "success");
    }
  } catch (error) {
    console.error("Download failed:", error);
    setStatus("Download failed. Please try again.", "error");
  }
});

syncReductionControls();
updateSummaryFromSource();
