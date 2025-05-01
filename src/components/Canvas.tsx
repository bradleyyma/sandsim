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
    this.mass = 2.0;
    this.size = 4;
    this.color = '#e6c288';
  }
  
  applyForce(force: Vec2) {
    // F = ma, so a = F/m
    const f = force.mult(1 / this.mass);
    this.acc = this.acc.add(f);
  }
  
  update(dt: number) {
    // Apply gravity - sand sinks
    this.applyForce(new Vec2(0, 0.1 * this.mass));
    
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
    const bounce = 0.5; // Energy loss on bounce
    
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

const FluidSimulation: React.FC<FluidSimulationProps> = ({
  width = 600,
  height = 400,
  initialParticleCount = 50
}) => {
  console.log("render")
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestIdRef = useRef<number>(1);
  
  // Controls
  const [isPaused, setIsPaused] = useState(false);
  const [addSandParticles, setAddSandParticles] = useState(false);
  const [addFluidForce, setAddFluidForce] = useState(true); // Default to true
  const [showFluidVelocity, setShowFluidVelocity] = useState(false);

  const isPausedRef = useRef(isPaused);
  const showFluidVelocityRef = useRef(showFluidVelocity);
  
  // Grid resolution
  const cellSize = 10;
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
      particles.push(new SandParticle(
        Math.random() * width,
        Math.random() * (height * 0.3) // Start in top third
      ));
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
      
      // Add sand particles
      if (addSandParticles && mouseRef.current.down) {
        for (let i = 0; i < 3; i++) {
          const offsetX = (Math.random() - 0.5) * 20;
          const offsetY = (Math.random() - 0.5) * 20;
          sandParticlesRef.current.push(
            new SandParticle(mouseX + offsetX, mouseY + offsetY)
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
  }, [addFluidForce, addSandParticles]);
  
  // Simplified fluid simulation
  const updateFluid = () => {
    const grid = fluidGridRef.current;
    const dt = 0.1;
    const viscosity = 0.1;
    
    // Viscous diffusion
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
    
    // Simple vorticity confinement (adds swirls)
    for (let i = 1; i < rows - 1; i++) {
      for (let j = 1; j < cols - 1; j++) {
        // Add a bit of vorticity
        const curl = (
          (grid[i+1][j].u - grid[i-1][j].u) -
          (grid[i][j+1].v - grid[i][j-1].v)
        ) * 0.03;
        
        grid[i][j].u_prev = grid[i][j].u + curl;
        grid[i][j].v_prev = grid[i][j].v - curl;
      }
    }
    
    // Swap buffers
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        grid[i][j].u = grid[i][j].u_prev;
        grid[i][j].v = grid[i][j].v_prev;
        
        // Decay velocity for stability
        grid[i][j].u_prev *= 0.99;
        grid[i][j].v_prev *= 0.99;
      }
    }
  };
  
  // Update particles based on fluid velocities
  const updateParticles = () => {
    const particles = sandParticlesRef.current;
    const grid = fluidGridRef.current;
    const dt = 0.16;
    
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
    
    // Clear with slight persistence for water effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);
    
    // Draw blue water background
    ctx.fillStyle = 'rgba(30, 100, 180, 0.05)';
    ctx.fillRect(0, 0, width, height);
    
    // Draw fluid velocity field if enabled
    console.log("showFluidVelocity", showFluidVelocityRef.current)
    if (showFluidVelocityRef.current) {
      const grid = fluidGridRef.current;
      console.log("goodbye")
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      
      for (let i = 0; i < rows; i += 2) {
        for (let j = 0; j < cols; j += 2) {
          // console.log(`i: ${i}, j: ${j}`);
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
      updateFluid();
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
        <p>Toggle "Show Fluid Velocity" to see water current directions</p>
      </div>
    </div>
  );
};

export default FluidSimulation;