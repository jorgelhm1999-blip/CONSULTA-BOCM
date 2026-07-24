import { MUNICIPALITIES } from './municipalities.js';

const $ = selector => document.querySelector(selector);
const dateInput = $('#date');
const municipalityInput = $('#municipality');
const municipalityList = $('#municipality-list');
const searchButton = $('#search');
const status = $('#status');
const results = $('#results');

const BATCH_SIZE = 12;
const MAX_ANNOUNCEMENTS = 360;

const today = new Date();
dateInput.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
municipalityList.innerHTML = MUNICIPALITIES.map(name => `<option value="${name}"></option>`).join('');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderCard(item) {
  const tags = (item.matches || []).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join('');
  const level = item.score >= 90 ? 'Prioridad alta' : 'De interés';
  const heading = item.cve || 'Anuncio BOCM';
  return `<article class="card">
    <div class="badges"><span class="badge high">${level}</span>${tags}</div>
    <h2>${escapeHtml(heading)}</h2>
    <p class="announcement-title">${escapeHtml(item.title || '')}</p>
    <div class="actions"><a href="${item.url}" target="_blank" rel="noopener">Abrir anuncio en HTML</a></div>
  </article>`;
}

function setLoading(text) {
  results.innerHTML = '';
  status.innerHTML = `<span class="spinner"></span>${text}`;
}

async function requestBatch(params, retry = false) {
  const response = await fetch(`/api/search?${params}`);
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(response.ok
      ? 'El servidor devolvió una respuesta no válida.'
      : `La función de consulta falló${response.status ? ` (${response.status})` : ''}${preview ? `: ${preview}` : '.'}`);
  }
  if (!response.ok) throw new Error(data.error || `Error de consulta (${response.status})`);

  // Un lote con fallos temporales se repite una sola vez. Cada invocación
  // sigue siendo pequeña y no acumula trabajo hasta provocar un 504.
  if (data.transientCount > 0 && !retry) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return requestBatch(params, true);
  }
  return data;
}

async function runSearch() {
  if (!dateInput.value) return;
  searchButton.disabled = true;
  setLoading('Consultando XML del BOCM por lotes…');

  const resultMap = new Map();
  let start = 1;
  let scanned = 0;
  let bulletinNumber = 0;
  let consecutiveEmpty = 0;
  let foundAny = false;
  let incomplete = false;

  try {
    while (start <= MAX_ANNOUNCEMENTS) {
      const params = new URLSearchParams({
        date: dateInput.value,
        start: String(start),
        size: String(BATCH_SIZE)
      });
      if (municipalityInput.value.trim()) params.set('municipality', municipalityInput.value.trim());

      status.innerHTML = `<span class="spinner"></span>Revisando anuncios ${start}-${start + BATCH_SIZE - 1}…`;
      const data = await requestBatch(params);

      if (data.bulletinNumber) bulletinNumber = data.bulletinNumber;
      if (data.transientCount > 0) incomplete = true;
      scanned += data.existingCount || 0;

      for (const item of data.results || []) resultMap.set(item.cve, item);

      if ((data.existingCount || 0) > 0) {
        foundAny = true;
        consecutiveEmpty = 0;
      } else if ((data.missingCount || 0) === BATCH_SIZE && (data.transientCount || 0) === 0) {
        consecutiveEmpty += 1;
      } else {
        consecutiveEmpty = 0;
      }

      const partial = [...resultMap.values()].sort((a, b) => b.score - a.score || a.cve.localeCompare(b.cve, undefined, { numeric: true }));
      results.innerHTML = partial.length ? partial.map(renderCard).join('') : '';

      // Dos lotes consecutivos totalmente inexistentes confirman el final.
      // Antes de encontrar el anuncio 1, dos lotes vacíos significan día sin BOCM.
      if (consecutiveEmpty >= 2) break;
      start += BATCH_SIZE;
    }

    if (!foundAny) {
      status.textContent = 'No se ha localizado un boletín para esa fecha. Puede ser festivo o día sin publicación.';
      results.innerHTML = '<div class="empty">No hay BOCM localizado para la fecha seleccionada.</div>';
      return;
    }

    const finalResults = [...resultMap.values()].sort((a, b) => b.score - a.score || a.cve.localeCompare(b.cve, undefined, { numeric: true }));
    const compact = dateInput.value.replaceAll('-', '');
    const bulletinUrl = bulletinNumber
      ? `https://www.bocm.es/boletin/bocm-${compact}-${bulletinNumber}`
      : `https://www.bocm.es/boletin/bocm-${compact}`;
    const warning = incomplete ? ' · Consulta parcial: algún XML no respondió' : '';
    status.innerHTML = `<strong>BOCM nº ${bulletinNumber || '?'}</strong> · ${finalResults.length} resultado(s) de interés entre ${scanned} anuncios revisados${warning}. <a href="${bulletinUrl}" target="_blank" rel="noopener">Ver sumario oficial</a>`;
    results.innerHTML = finalResults.length ? finalResults.map(renderCard).join('') : '<div class="empty">No se han detectado publicaciones que cumplan los criterios configurados.</div>';
  } catch (error) {
    status.textContent = error.message;
    results.innerHTML = '<div class="empty">La consulta no ha podido completarse.</div>';
  } finally {
    searchButton.disabled = false;
  }
}

searchButton.addEventListener('click', runSearch);
municipalityInput.addEventListener('keydown', event => { if (event.key === 'Enter') runSearch(); });
