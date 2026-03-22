# ASCII 3D Gallery

Interactive 3D shapes rendered as shape-conforming ASCII art with 24-bit truecolor. 11 scenes spanning topology, geometry, fractals, and physics. Written in C, compiled to WebAssembly.

## Viewers

- **[xterm.js viewer](/)** — terminal emulator in the browser, authentic terminal feel
- **[WebGL2 viewer](/canvas/)** — instanced GPU rendering, higher performance

## Shapes

| Category | Shape | Technique |
|----------|-------|-----------|
| Topology | Mobius Strip, Klein Bottle | Parametric surface |
| Geometry | Trefoil Knot, Catenoid-Helicoid, Gyroid | Parametric / SDF |
| Fractals | Menger Sponge, Mandelbulb | SDF ray marching |
| Physics | Black Hole (CPU/GPU/Worker), Lorenz Attractor | Verlet geodesics / point cloud |

## Controls

| Key | Action |
|-----|--------|
| W/S or arrows | Orbit camera |
| A/D or arrows | Orbit horizontal |
| Z/X | Zoom |
| Space | Toggle auto-rotation |
| Q/Esc | Menu |

## How it works

Each terminal character cell is a 3x2 sub-pixel grid. 80 ASCII glyphs are matched via a 6D density vector lookup table (262K entries). Contrast enhancement sharpens edges. Three rendering backends: parametric surfaces with z-buffering, Schwarzschild geodesic ray tracing (Velocity Verlet), and signed distance field ray marching for fractals.
