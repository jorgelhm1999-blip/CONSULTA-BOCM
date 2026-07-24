# Consulta Diaria BOCM v31

La consulta XML se procesa en lotes pequenos desde el navegador para evitar los timeouts de una unica funcion de Vercel.

## Archivos modificados

- `lib/bocm.js`
- `api/search.js`
- `app.js`
- `index.html`

El motor de clasificacion XML (`classifyRecord`) no se ha modificado.
