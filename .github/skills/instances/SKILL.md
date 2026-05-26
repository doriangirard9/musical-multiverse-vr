---
name: instances
description: Convert repeated mesh patterns to instances with instanced buffers for colors, position, rotation. Covers standard instances and thin instances. Reduces draw calls from N to 1.
---

# Optimize Meshes with BabylonJS Instances

## Overview

BabylonJS **instances** are lightweight copies of a mesh that share geometry and material but can have different transforms and per-instance data. This skill covers:
- Standard instances with instanced color buffers
- Per-instance data (colors, position, rotation, scale)
- Thin instances (maximum performance)
- Complete code examples and conversions

## When to Use

### ✅ Use Instances
- 10+ identical meshes in scene
- Grids/arrays (sequencer pads, keyboards, matrices)
- Frequent color/position updates needed
- Performance-critical applications

### ✅ Use Thin Instances
- 100+ identical meshes
- No per-instance mesh control needed
- Maximum performance required
- Stateless geometry

### ❌ Don't Use Instances
- Single or few meshes (< 5)
- Each mesh needs different geometry
- Complex physics per-mesh
- Non-uniform scaling

---

# Part 1: Standard Instances with Instanced Buffers

## What Are Instances?

Instances are copies of a root mesh that:
- **Share geometry** (same vertices/indices)
- **Share material** (same textures/shaders)
- **Have individual transforms** (position, rotation, scale)
- **Have individual data buffers** (colors, custom attributes)

Result: **1 draw call** instead of N meshes

## Basic Instance Creation

### Step 1: Create Template Mesh

```typescript
// Create the root/template mesh
const template = BABYLON.CreateBox(
    "box_template",
    { width: 1, height: 1, depth: 1 },
    scene
);
template.material = myMaterial;
template.isVisible = false; // Hide template, show only instances
template.parent = parentNode;
```

### Step 2: Create Instances

```typescript
// Create 100 instances from template
const instances: BABYLON.AbstractMesh[] = [];
for (let i = 0; i < 100; i++) {
    const instance = template.createInstance(`box_${i}`);
    instance.position.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    instances.push(instance);
}
```

**That's it!** All instances render in 1 draw call.

---

## Instance Buffers: Colors

### Register Color Buffer

```typescript
// Register "color" buffer with 4 floats (RGBA)
template.registerInstancedBuffer("color", 4);

// Set default color
template.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
```

### Set Per-Instance Colors

```typescript
// Each instance can have different color
for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const r = Math.random();
    const g = Math.random();
    const b = Math.random();
    
    instance.instancedBuffers.color = new BABYLON.Color4(r, g, b, 1);
}
```

### Real-Time Color Updates

```typescript
// Update colors dynamically (very fast!)
let hue = 0;
const interval = setInterval(() => {
    hue += 0.01;
    for (let i = 0; i < instances.length; i++) {
        const color = BABYLON.Color3.FromHSV(hue % 360, 1, 1).toColor4();
        instances[i].instancedBuffers.color = color;
    }
}, 16); // 60 FPS
```

---

## Instance Buffers: Custom Data

### Custom Buffer for Extra Data

```typescript
// Register custom buffers for any data
template.registerInstancedBuffer("intensity", 1);    // 1 float
template.registerInstancedBuffer("scale", 1);         // 1 float
template.registerInstancedBuffer("rotationY", 1);     // 1 float

// Set per instance
instance.instancedBuffers.intensity = 0.5;
instance.instancedBuffers.scale = 1.2;
instance.instancedBuffers.rotationY = Math.PI / 4;
```

**Note:** Shader must read these buffers via Node Material or custom shader.

---

## Complete Example: Color Grid

### ❌ Before: Individual Meshes (Inefficient)

```typescript
class ColorGrid_BAD {
    meshes: BABYLON.AbstractMesh[][] = [];

    constructor(rows: number, cols: number, scene: BABYLON.Scene) {
        // Create separate box for each cell - VERY SLOW!
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                // Creates 100+ separate meshes!
                const box = BABYLON.CreateBox(
                    `cell_${r}_${c}`,
                    { width: 0.9, height: 0.9, depth: 0.1 },
                    scene
                );
                box.position.set(r, 0, c);
                box.material = new BABYLON.StandardMaterial("mat", scene);
                
                // Problem: Each box needs material update for color
                const color = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
                box.material.diffuse = color;
                
                row.push(box);
            }
            this.meshes.push(row);
        }
    }

    setColor(r: number, c: number, color: BABYLON.Color3) {
        // Updates individual material - slow!
        const mesh = this.meshes[r][c];
        (mesh.material as BABYLON.StandardMaterial).diffuse = color;
    }
}

// Usage:
// const grid = new ColorGrid_BAD(10, 10, scene); // 100 draw calls!
```

### ✅ After: Instances with Color Buffers (Optimized)

```typescript
class ColorGrid_GOOD {
    instances: BABYLON.AbstractMesh[][] = [];
    template: BABYLON.AbstractMesh;

    constructor(rows: number, cols: number, scene: BABYLON.Scene) {
        // Create ONE template
        this.template = BABYLON.CreateBox(
            "cell_template",
            { width: 0.9, height: 0.9, depth: 0.1 },
            scene
        );
        this.template.material = new BABYLON.StandardMaterial("mat", scene);
        this.template.isVisible = false; // Hide template
        
        // Register color buffer
        this.template.registerInstancedBuffer("color", 4);
        this.template.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
        
        // Create instances from template
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                const instance = this.template.createInstance(`cell_${r}_${c}`);
                instance.position.set(r, 0, c);
                
                // Set individual color via buffer (instant!)
                const color = new BABYLON.Color3(
                    Math.random(),
                    Math.random(),
                    Math.random()
                ).toColor4();
                instance.instancedBuffers.color = color;
                
                row.push(instance);
            }
            this.instances.push(row);
        }
    }

    setColor(r: number, c: number, color: BABYLON.Color3) {
        // Updates instanced buffer - FAST!
        const instance = this.instances[r][c];
        instance.instancedBuffers.color = color.toColor4();
    }
}

// Usage:
// const grid = new ColorGrid_GOOD(10, 10, scene); // 1 draw call!
```

**Performance Impact:**
- Draw calls: 100 → 1
- Memory: Shared geometry
- Color update: Instant per instance

---

## SequencerN3D Example

### Before: 144 Individual Boxes

```typescript
// ❌ Bad: 144 separate meshes
for (let s = 0; s < 12; s++) {
    for (let n = 0; n < 12; n++) {
        const pad = B.CreateBox(`pad_${s}_${n}`, {...}, scene);
        pad.position.set(x, y, z);
        T.MeshUtils.setColor(pad, color); // Updates material
        this.notes[s][n] = pad;
    }
}
```

### After: Instances with Color Buffers

```typescript
// ✅ Good: Template + 144 instances
const template = B.CreateBox("pad_template", {...}, scene);
template.isVisible = false;
template.registerInstancedBuffer("color", 4);

for (let s = 0; s < 12; s++) {
    for (let n = 0; n < 12; n++) {
        const instance = template.createInstance(`pad_${s}_${n}`);
        instance.position.set(x, y, z);
        instance.instancedBuffers.color = color; // Direct buffer
        this.notes[s][n] = instance;
    }
}

// Colorize becomes trivial:
colorize(s: number, n: number, color: Color4) {
    this.notes[s][n].instancedBuffers.color = color;
}
```

---

# Part 2: Thin Instances (Maximum Performance)

## What Are Thin Instances?

Thin instances are even lighter than standard instances:
- **No per-instance mesh references** - You manage data yourself
- **Single GPU buffer** - All transforms in one buffer
- **Maximum performance** - Best for 100+ objects
- **Trade-off** - Less per-instance control

## When to Use Thin Instances

✅ **Use when:**
- 100+ identical meshes needed
- All meshes are "dumb" (no per-mesh tracking)
- Maximum performance required
- Particles, crowds, large grids

❌ **Don't use when:**
- Need to interact with individual instances
- Require custom per-instance attributes
- Only 10-20 meshes

## Thin Instance API

### Create Thin Instances

```typescript
// Create template
const template = BABYLON.CreateBox("template", {...}, scene);

// Create 1000 thin instances
const thinInstances: number[] = [];
for (let i = 0; i < 1000; i++) {
    const idx = template.thinInstanceAdd();
    thinInstances.push(idx);
    
    // Set transform via matrix
    const matrix = BABYLON.Matrix.Translation(
        Math.random() * 100,
        Math.random() * 100,
        Math.random() * 100
    );
    template.thinInstanceSetMatrixAt(idx, matrix);
}

// Refresh after all updates
template.thinInstanceRefresh();
```

### Update Thin Instance Transforms

```typescript
// Update individual thin instance position
const idx = 0;
const newMatrix = BABYLON.Matrix.Translation(10, 5, 3);
template.thinInstanceSetMatrixAt(idx, newMatrix);

// Refresh to apply changes
template.thinInstanceRefresh();
```

### Remove Thin Instances

```typescript
// Remove thin instance at index
template.thinInstanceRemoveAt(5);

// This also updates indices, so be careful with manual tracking
```

---

## Thin Instances vs Standard Instances

| Feature | Standard Instances | Thin Instances |
|---------|-------------------|-----------------|
| Per-instance ref | ✅ Mesh object | ❌ Index only |
| Per-instance buffers | ✅ Colors, data | ❌ Matrix only |
| Transforms | ✅ Property access | ✅ Matrix buffer |
| Performance | Good | **Excellent** |
| Count limit | ~1000-5000 | 10,000+ |
| Best for | UI grids, interactive | Particles, crowds |
| Complexity | Medium | High |

---

## Thin Instance Example: Particle Grid

### Dense Particle Grid (1000 particles)

```typescript
class ThinParticleGrid {
    template: BABYLON.AbstractMesh;
    particleCount = 1000;
    gridSize = 32;

    constructor(scene: BABYLON.Scene) {
        // Create template sphere
        this.template = BABYLON.CreateSphere("particle", {diameter: 0.1}, scene);
        this.template.material = new BABYLON.StandardMaterial("mat", scene);
        
        // Create thin instances
        for (let i = 0; i < this.particleCount; i++) {
            this.template.thinInstanceAdd();
            
            // Position in grid
            const x = (i % this.gridSize) * 2;
            const y = Math.floor(i / this.gridSize) * 2;
            const z = Math.random() * 10;
            
            const matrix = BABYLON.Matrix.Translation(x, y, z);
            this.template.thinInstanceSetMatrixAt(i, matrix);
        }
        
        this.template.thinInstanceRefresh();
    }

    updateParticle(idx: number, x: number, y: number, z: number) {
        const matrix = BABYLON.Matrix.Translation(x, y, z);
        this.template.thinInstanceSetMatrixAt(idx, matrix);
        this.template.thinInstanceRefresh();
    }

    animateWave(time: number) {
        for (let i = 0; i < this.particleCount; i++) {
            const x = (i % this.gridSize) * 2;
            const y = Math.floor(i / this.gridSize) * 2;
            const z = Math.sin(x * 0.5 + time) * Math.cos(y * 0.5 + time) * 5;
            
            this.updateParticle(i, x, y, z);
        }
    }
}
```

---

# Part 3: Decision Tree & Comparison

## Which Should I Use?

```
How many identical meshes do you have?

├─ 1-5 meshes
│  └─ Don't use instances (overhead not worth it)
│
├─ 6-100 meshes
│  ├─ Need individual tracking/interactions?
│  │  ├─ Yes → Use Standard Instances ✅
│  │  └─ No → Use Thin Instances
│  └─ Need color/custom buffers?
│     ├─ Yes → Use Standard Instances ✅
│     └─ No → Thin Instances or standard, your choice
│
└─ 100+ meshes
   ├─ Need per-instance interaction?
   │  ├─ Yes → Use Standard Instances (but manage carefully)
   │  └─ No → Use Thin Instances ✅ (Best performance)
```

---

# Part 4: Performance Comparison

```typescript
// Test scene: 10x10 grid (100 boxes)

// 1. Individual Meshes (baseline)
for (let i = 0; i < 100; i++) {
    const box = B.CreateBox(`box_${i}`, {...}, scene);
}
// Draw calls: 100
// GPU Memory: ~5 MB
// FPS: ~30

// 2. Standard Instances
const template = B.CreateBox("template", {...}, scene);
template.registerInstancedBuffer("color", 4);
for (let i = 0; i < 100; i++) {
    const instance = template.createInstance(`box_${i}`);
}
// Draw calls: 1
// GPU Memory: ~50 KB
// FPS: ~60 ✅

// 3. Thin Instances
const template = B.CreateBox("template", {...}, scene);
for (let i = 0; i < 100; i++) {
    template.thinInstanceAdd();
}
template.thinInstanceRefresh();
// Draw calls: 1
// GPU Memory: ~10 KB
// FPS: ~60 ✅
```

---

# Part 5: Code Conversion Guide

## Convert Individual Meshes → Standard Instances

### Step 1: Identify Loop

```typescript
// Find this pattern:
for (let i = 0; i < count; i++) {
    const mesh = B.CreateBox(`mesh_${i}`, {...}, scene); // ❌ REPLACE
    mesh.material = material;
    mesh.position.set(x, y, z);
}
```

### Step 2: Create Template Before Loop

```typescript
// BEFORE loop:
const template = B.CreateBox("template", {...}, scene);
template.material = material;
template.isVisible = false;
template.registerInstancedBuffer("color", 4);

// If you need colors:
template.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
```

### Step 3: Replace Loop

```typescript
// Replace B.CreateBox with template.createInstance:
for (let i = 0; i < count; i++) {
    const instance = template.createInstance(`instance_${i}`); // ✅ USE
    instance.position.set(x, y, z);
    if (needsColor) {
        instance.instancedBuffers.color = color;
    }
}
```

---

## Common Pitfalls

### ❌ Forgetting to Hide Template

```typescript
const template = B.CreateBox(...);
// Missing: template.isVisible = false;

// Result: Template shows as first mesh in scene!
```

**Fix:** Always add `template.isVisible = false`

### ❌ Forgetting to Register Buffer

```typescript
template.registerInstancedBuffer("color", 4); // ✅
instance.instancedBuffers.color = color;
```

vs

```typescript
// ❌ Missing registerInstancedBuffer
instance.instancedBuffers.color = color; // Won't work!
```

### ❌ Using Different Materials

```typescript
// ❌ WRONG - Breaks instancing
instance.material = customMaterial;
```

**All instances MUST share template's material**

### ❌ Mixing Instances and Regular Meshes

```typescript
// ❌ Don't do this:
template.createInstance("i1");
const regularMesh = B.CreateBox("box", {...}, scene); // Same mesh type!
```

**Keep similar meshes as instances, not mix**

---

# Testing & Validation

## Check Draw Calls

```typescript
// In browser DevTools:
// 1. Open DevTools (F12)
// 2. Inspector tab → Scene
// 3. Look for "Active meshes" and draw calls

// Test: Compare before/after
console.log(scene.getActiveMeshes().length); // Should be ~1 instead of 100
```

## Performance Profiling

```typescript
const start = performance.now();

// Update 1000 colors
for (let i = 0; i < 1000; i++) {
    instances[i].instancedBuffers.color = newColor;
}

const elapsed = performance.now() - start;
console.log(`Updated 1000 colors in ${elapsed}ms`); // Should be <5ms
```

---

# Complete Working Example

See [SequencerN3D.ts](../../src/node3d/subs/SequencerN3D.ts) in this repository:

- 12×12 grid = 144 pads
- Uses standard instances with color buffers
- Dynamic color updates in real-time
- Reduced from 144 draw calls to 1 draw call

---

# Quick Reference

| Task | Code |
|------|------|
| Create template | `const t = B.CreateBox("t", {...}); t.isVisible = false;` |
| Register colors | `t.registerInstancedBuffer("color", 4);` |
| Create instance | `const i = t.createInstance("i1");` |
| Set color | `instance.instancedBuffers.color = color;` |
| Set position | `instance.position.set(x, y, z);` |
| Create thin | `template.thinInstanceAdd();` |
| Set thin matrix | `template.thinInstanceSetMatrixAt(idx, matrix);` |

---

# Resources

- [BabylonJS Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances)
- [Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)
- [Custom Buffers](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances#custom-buffers)

---

**Last Updated:** May 5, 2026  
**Examples:** SequencerN3D (144-pad grid), Color Grid (10×10), Particle Grid (1000)  
**Performance:** 100x meshes: 30 FPS → 60 FPS ✅

