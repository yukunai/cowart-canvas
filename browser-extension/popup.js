const storageKey = 'cowartBaseUrl';
const input = document.querySelector('#baseUrlInput');
const status = document.querySelector('#status');
const extensionApi = globalThis.chrome;

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return trimmed || 'http://127.0.0.1:43219';
}

async function loadBaseUrl() {
  const stored = await extensionApi?.storage?.local?.get?.(storageKey).catch(() => null);
  input.value = normalizeBaseUrl(stored?.[storageKey] || input.value);
}

async function saveBaseUrl() {
  const next = normalizeBaseUrl(input.value);
  input.value = next;
  await extensionApi?.storage?.local?.set?.({ [storageKey]: next }).catch(() => null);
}

async function openCowart(path) {
  await saveBaseUrl();
  const url = `${normalizeBaseUrl(input.value)}${path}`;
  status.textContent = '正在打开...';
  if (extensionApi?.tabs?.create) {
    await extensionApi.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  window.close();
}

input.addEventListener('change', saveBaseUrl);
for (const button of document.querySelectorAll('button[data-path]')) {
  button.addEventListener('click', () => openCowart(button.dataset.path));
}

loadBaseUrl();
