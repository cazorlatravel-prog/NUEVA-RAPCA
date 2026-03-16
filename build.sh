#!/bin/bash
# RAPCA Campo — Build script: concatenar y minificar JS
# Uso: bash build.sh

set -e

JS_FILES=(
  app.js auth.js forms.js camera.js sync.js map.js
  panel.js admin.js gabinete.js precarga.js
  dashboard.js timeline.js comparador.js galeria.js
)

echo "Concatenando ${#JS_FILES[@]} archivos JS..."
cat "${JS_FILES[@]}" > dist/rapca.js

echo "Minificando con terser..."
npx terser dist/rapca.js -o dist/rapca.min.js --compress --mangle 2>/dev/null

ORIG=$(wc -c < dist/rapca.js)
MINI=$(wc -c < dist/rapca.min.js)
PCT=$((100 - MINI * 100 / ORIG))
echo "Original: ${ORIG} bytes → Minificado: ${MINI} bytes (${PCT}% reducción)"
echo "Archivo: dist/rapca.min.js"
echo ""
echo "Para usar en producción, cambia en index.html:"
echo "  Los scripts individuales por: <script src=\"dist/rapca.min.js\"></script>"
