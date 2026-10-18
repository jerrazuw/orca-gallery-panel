#!/usr/bin/env bash
# Orca's panel CSP only allows data: images, so each image is inlined as base64 into panel.html.
# Uso: ./build.sh [carpeta]   (default: ~/Pictures/Gallery, o imagenes/ si esa no existe)
set -euo pipefail
cd "$(dirname "$0")"

MAX_PX=800
src="${1:-$HOME/Pictures/Gallery}"
[[ -d "$src" ]] || src=imagenes

shopt -s nullglob nocaseglob
imgs=("$src"/*.{png,jpg,jpeg,gif,webp})
shopt -u nullglob nocaseglob
(( ${#imgs[@]} )) || { echo "No hay imágenes en $src" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

shrink() {
  local in=$1 out=$2 w h
  if command -v sips >/dev/null; then
    w=$(sips -g pixelWidth "$in" 2>/dev/null | awk '/pixelWidth/{print $2}')
    h=$(sips -g pixelHeight "$in" 2>/dev/null | awk '/pixelHeight/{print $2}')
    if [[ -n $w && -n $h ]] && (( w > MAX_PX || h > MAX_PX )); then
      sips -Z "$MAX_PX" "$in" --out "$out" >/dev/null 2>&1 && return 0
    fi
  elif command -v convert >/dev/null; then
    convert "$in" -resize "${MAX_PX}x${MAX_PX}>" "$out" 2>/dev/null && return 0
  fi
  cp "$in" "$out"
}

{
  cat <<'HTML'
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--background, transparent); }
  .mona {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 600ms ease;
  }
  .mona.visible { opacity: 1; pointer-events: auto; }
  body.fill .mona { object-fit: cover; }
  #fit {
    position: absolute; top: 8px; right: 8px; z-index: 1;
    padding: 4px 8px; font: 12px system-ui, sans-serif; cursor: pointer;
    color: var(--foreground, #ddd); background: var(--secondary, #2a2a2a);
    border: 1px solid var(--border, #555); border-radius: 6px;
    opacity: 0; transition: opacity 200ms ease;
  }
  body:hover #fit { opacity: 0.9; }
</style>
</head>
<body>
<img class="mona" alt="" title="Clic para cambiar">
<img class="mona" alt="" title="Clic para cambiar">
<button id="fit" type="button">Llenar</button>
<script>
var imgs = [
HTML
  n=0
  for f in "${imgs[@]}"; do
    lower=$(printf %s "$f" | tr '[:upper:]' '[:lower:]')
    case "$lower" in
      *.png) mime=png ;; *.gif) mime=gif ;; *.webp) mime=webp ;; *) mime=jpeg ;;
    esac
    out="$tmp/$n.$mime"
    case "$mime" in
      gif|webp) cp "$f" "$out" ;;
      *) shrink "$f" "$out" ;;
    esac
    printf '"data:image/%s;base64,%s",\n' "$mime" "$(base64 < "$out" | tr -d '\n')"
    n=$((n + 1))
  done
  cat <<'HTML'
];
var ROTATE_MS = 3 * 60 * 1000;
var layers = document.querySelectorAll('.mona');
var front = 0;
var deck = [];
var last = -1;
var timer;

function draw() {
  if (!deck.length) {
    deck = imgs.map(function (_, i) { return i; });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    if (deck.length > 1 && deck[deck.length - 1] === last) deck.unshift(deck.pop());
  }
  return (last = deck.pop());
}

function next() {
  var back = layers[1 - front];
  back.onload = function () {
    back.classList.add('visible');
    layers[front].classList.remove('visible');
    front = 1 - front;
  };
  back.src = imgs[draw()];
}

function show() {
  next();
  clearInterval(timer);
  timer = setInterval(next, ROTATE_MS);
}

layers.forEach(function (el) { el.addEventListener('click', show); });

var fitBtn = document.getElementById('fit');
fitBtn.addEventListener('click', function () {
  var fill = document.body.classList.toggle('fill');
  fitBtn.textContent = fill ? 'Entera' : 'Llenar';
});

show();
</script>
</body>
</html>
HTML
} > panel.html

size=$(wc -c < panel.html | tr -d ' ')
echo "panel.html: ${#imgs[@]} imágenes de \"$src\", $((size / 1024)) KB (límite de Orca: 10240 KB)"
(( size <= 10485760 )) || { echo "Te pasaste de 10 MB: saca o achica imágenes" >&2; exit 1; }
