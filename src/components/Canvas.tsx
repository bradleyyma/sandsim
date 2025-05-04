import React, { useRef, useEffect, useState } from 'react';

interface FluidSimulationProps {
  width?: number;
  height?: number;
  initialParticleCount?: number;
}

// Simple 2D vector class
class Vec2 {
  constructor(public x: number, public y: number) {}
  
  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }
  
  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }
  
  mult(n: number): Vec2 {
    return new Vec2(this.x * n, this.y * n);
  }
  
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  
  normalize(): Vec2 {
    const len = this.length();
    if (len > 0) {
      return new Vec2(this.x / len, this.y / len);
    }
    return new Vec2(0, 0);
  }
}

// Sand particle class
class SandParticle {
  pos: Vec2;
  vel: Vec2;
  acc: Vec2;
  mass: number;
  size: number;
  color: string;
  
  constructor(x: number, y: number) {
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(0, 0);
    this.acc = new Vec2(0, 0);
    this.mass = 1.0;
    this.size = 2;
    this.color = '#e6c288';
  }
  
  applyForce(force: Vec2) {
    // F = ma, so a = F/m
    const f = force.mult(1 / this.mass);
    this.acc = this.acc.add(f);
  }
  
  update(dt: number) {
    // Apply gravity - sand sinks
    this.applyForce(new Vec2(0, 0.3 * this.mass));
    
    // Update velocity
    this.vel = this.vel.add(this.acc.mult(dt));
    
    // Limit velocity for stability
    const maxVel = 10;
    const velLength = this.vel.length();
    if (velLength > maxVel) {
      this.vel = this.vel.normalize().mult(maxVel);
    }
    
    // Update position
    this.pos = this.pos.add(this.vel.mult(dt));
    
    // Reset acceleration
    this.acc = new Vec2(0, 0);
  }
  
  // Simple boundary collision
  checkBoundary(width: number, height: number) {
    const bounce = 0.1; // Energy loss on bounce
    
    if (this.pos.x < this.size) {
      this.pos.x = this.size;
      this.vel.x *= -bounce;
    }
    if (this.pos.x > width - this.size) {
      this.pos.x = width - this.size;
      this.vel.x *= -bounce;
    }
    if (this.pos.y < this.size) {
      this.pos.y = this.size;
      this.vel.y *= -bounce;
    }
    if (this.pos.y > height - this.size) {
      this.pos.y = height - this.size;
      this.vel.y *= -bounce;
    }
  }
  
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Dust particle class (falls slower, smaller, settles on sand)
class DustParticle extends SandParticle {
  constructor(x: number, y: number) {
    super(x, y);
    this.mass = 0.5;
    this.size = 1.5;
    this.color = '#bfc9d1';
  }
  update(dt: number) {
    // Less gravity
    this.applyForce(new Vec2(0, 0.2 * this.mass));
    this.vel = this.vel.add(this.acc.mult(dt));
    const maxVel = 4;
    const velLength = this.vel.length();
    if (velLength > maxVel) {
      this.vel = this.vel.normalize().mult(maxVel);
    }
    this.pos = this.pos.add(this.vel.mult(dt));
    this.acc = new Vec2(0, 0);
  }
}

// Simple fluid cell
class FluidCell {
  u: number = 0;  // x velocity
  v: number = 0;  // y velocity
  u_prev: number = 0;
  v_prev: number = 0;
  
  constructor() {
    this.u = 0;
    this.v = 0;
    this.u_prev = 0;
    this.v_prev = 0;
  }
}

// Helper: clamp
function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// Advection step (semi-Lagrangian)
function advect(grid: FluidCell[][], uField: number[][], vField: number[][], dt: number, cellSize: number, rows: number, cols: number) {
  const uNew: number[][] = [];
  const vNew: number[][] = [];
  for (let i = 0; i < rows; i++) {
    uNew[i] = [];
    vNew[i] = [];
    for (let j = 0; j < cols; j++) {
      // Backtrace
      let x = j - uField[i][j] * dt / cellSize;
      let y = i - vField[i][j] * dt / cellSize;
      x = clamp(x, 0.5, cols - 1.5);
      y = clamp(y, 0.5, rows - 1.5);
      const i0 = Math.floor(y);
      const i1 = i0 + 1;
      const j0 = Math.floor(x);
      const j1 = j0 + 1;
      const s1 = x - j0;
      const s0 = 1 - s1;
      const t1 = y - i0;
      const t0 = 1 - t1;
      // Bilinear interpolation
      uNew[i][j] =
        s0 * (t0 * uField[i0][j0] + t1 * uField[i1][j0]) +
        s1 * (t0 * uField[i0][j1] + t1 * uField[i1][j1]);
      vNew[i][j] =
        s0 * (t0 * vField[i0][j0] + t1 * vField[i1][j0]) +
        s1 * (t0 * vField[i0][j1] + t1 * vField[i1][j1]);
    }
  }
  // Copy back
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      grid[i][j].u = uNew[i][j];
      grid[i][j].v = vNew[i][j];
    }
  }
}

// Projection step (enforce incompressibility)
function project(grid: FluidCell[][], rows: number, cols: number, cellSize: number) {
  const div: number[][] = [];
  const p: number[][] = [];
  for (let i = 0; i < rows; i++) {
    div[i] = [];
    p[i] = [];
    for (let j = 0; j < cols; j++) {
      // Compute divergence
      const uR = j < cols - 1 ? grid[i][j + 1].u : 0;
      const uL = j > 0 ? grid[i][j - 1].u : 0;
      const vU = i < rows - 1 ? grid[i + 1][j].v : 0;
      const vD = i > 0 ? grid[i - 1][j].v : 0;
      div[i][j] = -0.5 * cellSize * (uR - uL + vU - vD);
      p[i][j] = 0;
    }
  }
  // Solve Poisson equation for pressure (Jacobi iteration)
  for (let k = 0; k < 20; k++) {
    for (let i = 1; i < rows - 1; i++) {
      for (let j = 1; j < cols - 1; j++) {
        p[i][j] = (div[i][j] + p[i - 1][j] + p[i + 1][j] + p[i][j - 1] + p[i][j + 1]) / 4;
      }
    }
  }
  // Subtract pressure gradient from velocity field
  for (let i = 1; i < rows - 1; i++) {
    for (let j = 1; j < cols - 1; j++) {
      grid[i][j].u -= 0.5 * (p[i][j + 1] - p[i][j - 1]) / cellSize;
      grid[i][j].v -= 0.5 * (p[i + 1][j] - p[i - 1][j]) / cellSize;
    }
  }
}

// Improved Stable Fluids update (now takes parameters)
function updateFluid(grid: FluidCell[][], rows: number, cols: number, cellSize: number) {
  const dt = 0.1;
  const viscosity = 0.1;

  // 1. Add forces (already done in mouse interaction)

  // 2. Diffuse velocities (simple explicit diffusion)
  for (let i = 1; i < rows - 1; i++) {
    for (let j = 1; j < cols - 1; j++) {
      grid[i][j].u = grid[i][j].u_prev +
        viscosity * (
          grid[i+1][j].u_prev + grid[i-1][j].u_prev +
          grid[i][j+1].u_prev + grid[i][j-1].u_prev - 
          4 * grid[i][j].u_prev
        );
      grid[i][j].v = grid[i][j].v_prev +
        viscosity * (
          grid[i+1][j].v_prev + grid[i-1][j].v_prev +
          grid[i][j+1].v_prev + grid[i][j-1].v_prev - 
          4 * grid[i][j].v_prev
        );
    }
  }

  // 3. Advect velocities
  // Prepare arrays for advection
  const uField: number[][] = [];
  const vField: number[][] = [];
  for (let i = 0; i < rows; i++) {
    uField[i] = [];
    vField[i] = [];
    for (let j = 0; j < cols; j++) {
      uField[i][j] = grid[i][j].u;
      vField[i][j] = grid[i][j].v;
    }
  }
  advect(grid, uField, vField, dt, cellSize, rows, cols);

  // 4. Project (make velocity field divergence-free)
  project(grid, rows, cols, cellSize);

  // 5. Swap buffers and decay
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      grid[i][j].u_prev = grid[i][j].u * 0.99;
      grid[i][j].v_prev = grid[i][j].v * 0.99;
    }
  }
}

const FluidSimulation: React.FC<FluidSimulationProps> = ({
  width = 600,
  height = 700,
  initialParticleCount = 1000
}) => {
  console.log("render")
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestIdRef = useRef<number>(1);
  
  // Controls
  const [isPaused, setIsPaused] = useState(false);
  const [addSandParticles, setAddSandParticles] = useState(false);
  const [addFluidForce, setAddFluidForce] = useState(true); // Default to true
  const [showFluidVelocity, setShowFluidVelocity] = useState(false);
  const [addDustParticles, setAddDustParticles] = useState(false);

  const isPausedRef = useRef(isPaused);
  const showFluidVelocityRef = useRef(showFluidVelocity);
  
  // Grid resolution
  const cellSize = 5;
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);
  
  // Create fluid grid
  const fluidGridRef = useRef<FluidCell[][]>([]);
  
  // Sand particles
  const sandParticlesRef = useRef<SandParticle[]>([]);
  
  // Mouse position
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0, down: false });
  
  useEffect(() => {
    isPausedRef.current = isPaused;

  }, [isPaused]);
  useEffect(() => {
    showFluidVelocityRef.current = showFluidVelocity;
  }, [showFluidVelocity]);
  // Initialize and clean up
  useEffect(() => {
    // Initialize fluid grid
    const grid: FluidCell[][] = [];
    for (let i = 0; i < rows; i++) {
      grid[i] = [];
      for (let j = 0; j < cols; j++) {
        grid[i][j] = new FluidCell();
      }
    }
    fluidGridRef.current = grid;
    
    // Initialize particles 
    const particles: SandParticle[] = [];
    for (let i = 0; i < initialParticleCount; i++) {
      var rand = Math.random();
      if (rand < 0.5) {
        particles.push(new DustParticle(
          Math.random() * width,
          Math.random() * (height * 0.5) // Start in top third
        ));
      }
      else {
        particles.push(new SandParticle(
          Math.random() * width,
          Math.random() * (height * 0.5) // Start in top third
        ));
      }
      
    }
    sandParticlesRef.current = particles;
    
    // Initialize canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = width;
    canvas.height = height;
    
    // Start animation
    requestIdRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (requestIdRef.current) {
        cancelAnimationFrame(requestIdRef.current);
      }
    };
  }, [width, height, initialParticleCount]);
  
  // Set up mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      mouseRef.current = {
        x: mouseX,
        y: mouseY,
        prevX: mouseX,
        prevY: mouseY,
        down: true
      };
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.down) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Apply force to fluid
      if (addFluidForce) {
        const dx = mouseX - mouseRef.current.prevX;
        const dy = mouseY - mouseRef.current.prevY;
        
        // Find grid cell
        const gridX = Math.floor(mouseX / cellSize);
        const gridY = Math.floor(mouseY / cellSize);
        
        // Add velocity in a small radius
        const radius = 3;
        for (let y = gridY - radius; y <= gridY + radius; y++) {
          for (let x = gridX - radius; x <= gridX + radius; x++) {
            if (x >= 0 && x < cols && y >= 0 && y < rows) {
              const distance = Math.sqrt((x - gridX) ** 2 + (y - gridY) ** 2);
              if (distance <= radius) {
                const factor = 1 - (distance / radius);
                fluidGridRef.current[y][x].u_prev += dx * factor * 0.2;
                fluidGridRef.current[y][x].v_prev += dy * factor * 0.2;
              }
            }
          }
        }
      }
      
      // Add sand or dust particles
      if (addSandParticles && mouseRef.current.down) {
        for (let i = 0; i < 3; i++) {
          const offsetX = (Math.random() - 0.5) * 20;
          const offsetY = (Math.random() - 0.5) * 20;
          sandParticlesRef.current.push(
            new SandParticle(mouseX + offsetX, mouseY + offsetY)
          );
        }
      }
      if (addDustParticles && mouseRef.current.down) {
        for (let i = 0; i < 2; i++) {
          const offsetX = (Math.random() - 0.5) * 20;
          const offsetY = (Math.random() - 0.5) * 20;
          sandParticlesRef.current.push(
            new DustParticle(mouseX + offsetX, mouseY + offsetY)
          );
        }
      }
      
      mouseRef.current = {
        x: mouseX,
        y: mouseY,
        prevX: mouseRef.current.x,
        prevY: mouseRef.current.y,
        down: true
      };
    };
    
    const handleMouseUp = () => {
      mouseRef.current.down = false;
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [addFluidForce, addSandParticles, addDustParticles]);
  
  // Update particles based on fluid velocities
  const updateParticles = () => {
    const particles = sandParticlesRef.current;
    const grid = fluidGridRef.current;
    const dt = 0.16;

    // --- Spatial grid setup ---
    const spatialCellSize = 8; // Slightly smaller than sand size for accuracy
    const gridCols = Math.ceil(width / spatialCellSize);
    const gridRows = Math.ceil(height / spatialCellSize);
    // Each cell contains an array of indices into the particles array
    const spatialGrid: number[][][] = Array.from({ length: gridRows }, () =>
      Array.from({ length: gridCols }, () => [])
    );

    // Place particles into spatial grid
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const cellX = Math.floor(p.pos.x / spatialCellSize);
      const cellY = Math.floor(p.pos.y / spatialCellSize);
      if (
        cellX >= 0 && cellX < gridCols &&
        cellY >= 0 && cellY < gridRows
      ) {
        spatialGrid[cellY][cellX].push(i);
      }
    }

    // --- Efficient collision detection ---
    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];
      const cellX = Math.floor(p1.pos.x / spatialCellSize);
      const cellY = Math.floor(p1.pos.y / spatialCellSize);
      // Check this cell and neighbors
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cellX + ox;
          const ny = cellY + oy;
          if (nx < 0 || nx >= gridCols || ny < 0 || ny >= gridRows) continue;
          const cell = spatialGrid[ny][nx];
          for (const j of cell) {
            if (i >= j) continue; // Avoid double checks and self
            const p2 = particles[j];
            // Dust only collides with sand
            if (p1 instanceof DustParticle && p2 instanceof DustParticle) continue;
            // Usual collision logic
            const dx = p2.pos.x - p1.pos.x;
            const dy = p2.pos.y - p1.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = p1.size + p2.size;
            if (dist < minDist && dist > 0) {
              const overlap = 0.5 * (minDist - dist);
              const nx = dx / dist;
              const ny = dy / dist;
              p1.pos.x -= nx * overlap;
              p1.pos.y -= ny * overlap;
              p2.pos.x += nx * overlap;
              p2.pos.y += ny * overlap;
              // Velocity response (damped bounce)
              const bounce = 0.5;
              const v1 = p1.vel.x * nx + p1.vel.y * ny;
              const v2 = p2.vel.x * nx + p2.vel.y * ny;
              const v1After = v2 * bounce;
              const v2After = v1 * bounce;
              p1.vel.x += (v1After - v1) * nx;
              p1.vel.y += (v1After - v1) * ny;
              p2.vel.x += (v2After - v2) * nx;
              p2.vel.y += (v2After - v2) * ny;
            }
          }
        }
      }
    }

    // After collision resolution, for each dust, check if it overlaps sand below and stop it
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p instanceof DustParticle) {
        for (let j = 0; j < particles.length; j++) {
          if (i === j) continue;
          const other = particles[j];
          if (!(other instanceof DustParticle)) {
            // If dust is overlapping sand and above it, stop downward velocity
            const dx = other.pos.x - p.pos.x;
            const dy = other.pos.y - p.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = p.size + other.size;
            if (dist < minDist && dy > 0) {
              p.pos.y = other.pos.y - minDist;
              if (p.vel.y > 0) p.vel.y = 0;
            }
          }
        }
      }
    }

    for (const particle of particles) {
      // Get fluid cell at particle position
      const cellX = Math.floor(particle.pos.x / cellSize);
      const cellY = Math.floor(particle.pos.y / cellSize);
      
      // Apply fluid force to particle
      if (cellX >= 0 && cellX < cols && cellY >= 0 && cellY < rows) {
        const fluidForce = new Vec2(
          grid[cellY][cellX].u * 0.5,
          grid[cellY][cellX].v * 0.5
        );
        particle.applyForce(fluidForce);
      }
      
      // Update particle
      particle.update(dt);
      particle.checkBoundary(width, height);
    }
  };
  
  // Render simulation
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas completely
    ctx.clearRect(0, 0, width, height);
    // Fill with solid background color
    ctx.fillStyle = '#0a1e37';
    ctx.fillRect(0, 0, width, height);

    // Draw fluid velocity field if enabled
    if (showFluidVelocityRef.current) {
      const grid = fluidGridRef.current;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      
      for (let i = 0; i < rows; i += 2) {
        for (let j = 0; j < cols; j += 2) {
          const x = (j + 0.5) * cellSize;
          const y = (i + 0.5) * cellSize;
          const u = grid[i][j].u;
          const v = grid[i][j].v;
          
          // Scale for visibility
          const displayLength = Math.min(cellSize * 2, Math.sqrt(u*u + v*v) * cellSize * 5);
          if (displayLength > 0.5) {
            const angle = Math.atan2(v, u);
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(
              x + Math.cos(angle) * displayLength,
              y + Math.sin(angle) * displayLength
            );
            ctx.stroke();
          }
        }
      }
    }
    
    // Draw particles
    const particles = sandParticlesRef.current;
    for (const particle of particles) {
      particle.draw(ctx);
    }
  };
  
  // Animation loop
  const animate = () => {
    if (!isPausedRef.current) {
      updateFluid(fluidGridRef.current, rows, cols, cellSize);
      updateParticles();
    }
    
    render();
    requestIdRef.current = requestAnimationFrame(animate);
  };
  
  return (
    <div className="fluid-simulation-container">
      <div className="controls" style={{ marginBottom: '10px' }}>
        <button 
          onClick={() => setIsPaused(!isPaused)}
          style={{ margin: '5px', padding: '8px 12px' }}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        
        <button 
          onClick={() => setAddFluidForce(!addFluidForce)}
          style={{ 
            margin: '5px', 
            padding: '8px 12px',
            background: addFluidForce ? '#4287f5' : undefined 
          }}
        >
          {addFluidForce ? 'Adding Fluid Force' : 'Add Fluid Force'}
        </button>
        
        <button 
          onClick={() => setAddSandParticles(!addSandParticles)}
          style={{ 
            margin: '5px', 
            padding: '8px 12px',
            background: addSandParticles ? '#e6c288' : undefined 
          }}
        >
          {addSandParticles ? 'Adding Sand' : 'Add Sand'}
        </button>
        
        <button 
          onClick={() => setAddDustParticles(!addDustParticles)}
          style={{ 
            margin: '5px', 
            padding: '8px 12px',
            background: addDustParticles ? '#bfc9d1' : undefined,
            color: addDustParticles ? '#222' : undefined
          }}
        >
          {addDustParticles ? 'Adding Dust' : 'Add Dust'}
        </button>
        
        <button 
          onClick={() => setShowFluidVelocity(!showFluidVelocity)}
          style={{ margin: '5px', padding: '8px 12px' }}
        >
          {showFluidVelocity ? 'Hide Fluid Velocity' : 'Show Fluid Velocity'}
        </button>
        
        <button 
          onClick={() => {
            // Reset simulation
            sandParticlesRef.current = [];
            
            // Clear fluid velocities
            for (let i = 0; i < rows; i++) {
              for (let j = 0; j < cols; j++) {
                fluidGridRef.current[i][j].u = 0;
                fluidGridRef.current[i][j].v = 0;
                fluidGridRef.current[i][j].u_prev = 0;
                fluidGridRef.current[i][j].v_prev = 0;
              }
            }
          }}
          style={{ margin: '5px', padding: '8px 12px' }}
        >
          Reset
        </button>
      </div>
      
      <canvas 
        ref={canvasRef} 
        style={{ 
          border: '1px solid #333',
          background: '#0a1e37',
          display: 'block'
        }} 
      />
      
      <div style={{ marginTop: '10px', fontSize: '14px' }}>
        <p>Drag with "Add Fluid Force" to move the water (enabled by default)</p>
        <p>Toggle "Add Sand" and drag to create sand particles</p>
        <p>Toggle "Add Dust" and drag to create dust particles</p>
        <p>Toggle "Show Fluid Velocity" to see water current directions</p>
      </div>
    </div>
  );
};

export default FluidSimulation;