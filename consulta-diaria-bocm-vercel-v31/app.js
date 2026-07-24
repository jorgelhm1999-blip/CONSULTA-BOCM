import { MUNICIPALITIES } from './municipalities.js';

const $ = selector => document.querySelector(selector);
const dateInput = $('#date');
const municipalityInput = $('#municipality');
const municipalityList = $('#municipality-list');
const searchButton = $('#search');
const status = $('#status');
const results = $('#results');

const BATCH_SIZE = 12;

const today = new Date();
dateInput.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
municipalityList.innerHTML = MUNICIPALITIES.map(name => `<option value="${name}"></option>`).join('');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function cveNumber(cve = '') {
  return Number(String(cve).split('-').pop()) || 0;
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

async function requestJson(params) {
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
  return data;
}

async function runSearch() {
  if (!dateInput.value) return;
  searchButton.disabled = true;
  setLoading('Leyendo el sumario XML oficial del BOCM…');

  const resultMap = new Map();
  let scanned = 0;
  let incomplete = false;

  try {
    const manifestParams = new URLSearchParams({ mode: 'manifest', date: dateInput.value });
    const manifest = await requestJson(manifestParams);

    if (!manifest.found || !Array.isArray(manifest.cves) || manifest.cves.length === 0) {
      status.textContent = 'No se ha localizado un boletín para esa fecha. Puede ser festivo o día sin publicación.';
      results.innerHTML = '<div class="empty">No hay BOCM localizado para la fecha seleccionada.</div>';
      return;
    }

    const allCves = manifest.cves;
    for (let offset = 0; offset < allCves.length; offset += BATCH_SIZE) {
      const batch = allCves.slice(offset, offset + BATCH_SIZE);
      status.innerHTML = `<span class="spinner"></span>Revisando anuncios ${offset + 1}-${Math.min(offset + batch.length, allCves.length)} de ${allCves.length}…`;

      const params = new URLSearchParams({
        mode: 'batch',
        date: dateInput.value,
        cves: batch.join(',')
      });
      if (municipalityInput.value.trim()) params.set('municipality', municipalityInput.value.trim());

      const data = await requestJson(params);
      scanned += data.existingCount || 0;
      if ((data.transientCount || 0) > 0) incomplete = true;
      for (const item of data.results || []) resultMap.set(item.cve, item);

      const partial = [...resultMap.values()].sort((a, b) => cveNumber(a.cve) - cveNumber(b.cve));
      results.innerHTML = partial.length ? partial.map(renderCard).join('') : '';
    }

    const finalResults = [...resultMap.values()].sort((a, b) => cveNumber(a.cve) - cveNumber(b.cve));
    const warning = incomplete ? ' · Consulta parcial: algún XML individual no respondió' : '';
    status.innerHTML = `<strong>BOCM nº ${manifest.bulletinNumber || '?'}</strong> · ${finalResults.length} resultado(s) de interés entre ${scanned} anuncios revisados de ${allCves.length} publicados${warning}. <a href="${manifest.bulletinUrl}" target="_blank" rel="noopener">Ver sumario oficial</a>`;
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
