import { searchBocmBatch } from '../lib/bocm.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const date = String(req.query.date || '');
  const municipality = String(req.query.municipality || '');
  const start = Number(req.query.start || 1);
  const size = Number(req.query.size || 12);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Fecha no válida.' });
  }

  try {
    const data = await searchBocmBatch(date, municipality, start, size);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'No se ha podido consultar este lote del BOCM.' });
  }
}
