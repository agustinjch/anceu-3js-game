# Pepe e as Pegadas de Anceu — Documento de diseño

## Concepto
Juego 3D de aventura sobre el **patrimonio (visible e invisible) de Anceu** (Ponte Caldelas, Pontevedra).
Protagonista: **Pepe**, el perro del coliving, que conoce cada rincón y a cada vecino.
Tono **épico**. Juego en navegador (three.js), **móvil primero**, también PC.

## Premisa
**A Néboa do Esquecemento.** Una mañana, una niebla de olvido baja del monte y se traga Anceu:
los lugares pierden color, los vecinos olvidan sus historias. Pepe recupera las **pegadas**
(fragmentos de memoria) de cada lugar y de cada vecino. Cada pegada recuperada devuelve vida a
esa parte de la aldea. Clímax final: descender a **Eiras, la aldea asolagada**.

Inspirado directamente en *Pegadas do Recordo* (vídeos de vecinos + carteles NFC/QR).

## Estructura
- **Hub:** el núcleo de Anceu, recreado lo más fiel posible (terreno LiDAR, edificios Catastro/OSM,
  caminos reales), con toques épicos (niebla, luz, música).
- **Fases:** cada lugar de patrimonio es una fase con su propia mecánica, en su ubicación real.
  Los lugares lejanos (Eiras, Monte de Toro) se alcanzan con transición, no a escala continua.
- Arquitectura modular: añadir una fase = añadir un módulo, sin tocar el resto.

### Fases candidatas
| Fase | Vecino | Mecánica |
|---|---|---|
| Os Muíños (prototipo) | Laurita | Puzzle de agua: abrir canales/compuertas para mover las ruedas |
| O fútbol das tres aldeas | Casiano | Minijuego |
| Monte de Toro | Rogelio | Ascenso de plataformas / trepar |
| Eiras asolagada (final) | Pepe (vecino) | Exploración bajo el agua |
| Murales, mesa longa, etc. | África, Rosa, Se, Rosario… | Por definir |

## Vecinos
Vecinos reales con nombre real (si alguien se molesta, se cambia). Aparecen como personajes 3D en
la aldea (genéricos en el prototipo; luego modelos Meshy a partir de fotos). Al completar su fase
se desbloquea su **vídeo real de Pegadas do Recordo**.

## Inicio
Pepe despierta en la casa del coliving (interior jugable: cocina, mesa longa, coworking).
Café de las 8:30, el pan llega a las 9… y entra la niebla.

## Idiomas
Galego (por defecto), castellano, inglés.

## Arte
- Pepe: modelo propio (Mixamo rig, anims: run, walk, jump, climb, open door). Se pueden añadir más de Mixamo.
- Escenarios: assets libres (Poly Haven, Quaternius, Kenney…) elegidos para parecerse a Anceu
  (piedra granítica, musgo, carballos, castaños, hórreos). Piezas clave se sustituyen después por modelos Meshy.
- Referencias: fotos reales en `assets/ref/` (cuando las haya).

## Técnico
- Vite + TypeScript + three.js (vanilla), física Rapier.
- Assets comprimidos (gltf-transform: meshopt/Draco + KTX2) — el GLB de 26 MB debe bajar a pocos MB.
- Controles: joystick virtual + botones en móvil; WASD/espacio en PC; cámara tercera persona.
- i18n con ficheros JSON por idioma.

## Prototipo (alcance)
1. Hub mínimo: núcleo de Anceu con terreno real + casas aproximadas + camino al río, con niebla.
2. Pepe controlable (andar, correr, saltar) en móvil y PC.
3. Una fase: **Os Muíños** con su puzzle y la recuperación de la primera pegada.
4. Selector de idioma gl/es/en.
