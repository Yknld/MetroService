import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import ngrok from 'ngrok';

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Metro instance tracking
interface MetroInstance {
  appId: string;
  appName: string;
  process: ChildProcess;
  workspaceDir: string;
  port: number;
  tunnelUrl?: string;
  bundleUrl?: string;
  startTime: Date;
  lastAccess: Date;
  isReady: boolean;
}

class MetroService {
  private instances: Map<string, MetroInstance> = new Map();
  private portPool: number[] = [];
  private currentPortIndex = 0;
  private cleanupInterval: NodeJS.Timeout;
  
  // Configuration
  private readonly METRO_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  private readonly PORT_RANGE_START = 8081;
  private readonly PORT_RANGE_END = 8180;
  private readonly WORKSPACE_BASE = '/tmp/metro-apps';
  
  constructor() {
    this.initializePortPool();
    this.startCleanupTimer();
    this.ensureWorkspaceDir();
  }
  
  /**
   * Initialize pool of available ports for Metro instances
   */
  private initializePortPool(): void {
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      this.portPool.push(port);
    }
    console.log(`🔌 Initialized Metro port pool: ${this.PORT_RANGE_START}-${this.PORT_RANGE_END} (${this.portPool.length} ports)`);
  }
  
  /**
   * Get next available port from the pool
   */
  private getNextPort(): number | null {
    if (this.portPool.length === 0) {
      console.warn('⚠️ No available ports in Metro pool');
      return null;
    }
    
    const port = this.portPool[this.currentPortIndex % this.portPool.length];
    this.currentPortIndex = (this.currentPortIndex + 1) % this.portPool.length;
    return port;
  }
  
  /**
   * Ensure workspace directory exists
   */
  private async ensureWorkspaceDir(): Promise<void> {
    try {
      await fs.mkdir(this.WORKSPACE_BASE, { recursive: true });
      console.log(`📁 Workspace directory ready: ${this.WORKSPACE_BASE}`);
    } catch (error) {
      console.error('Failed to create workspace directory:', error);
    }
  }
  
  /**
   * Start Metro for an app
   */
  async startMetro(appId: string, appName: string, files: Record<string, string>): Promise<{
    success: boolean;
    tunnelUrl?: string;
    bundleUrl?: string;
    port?: number;
    error?: string;
  }> {
    try {
      // Check if instance already exists
      if (this.instances.has(appId)) {
        const existing = this.instances.get(appId)!;
        existing.lastAccess = new Date();
        
        if (existing.isReady && existing.tunnelUrl) {
          console.log(`♻️ Reusing existing Metro for ${appName} (${appId})`);
          return {
            success: true,
            tunnelUrl: existing.tunnelUrl,
            bundleUrl: existing.bundleUrl,
            port: existing.port
          };
        }
      }
      
      const port = this.getNextPort();
      if (!port) {
        return {
          success: false,
          error: 'No available ports for Metro instance'
        };
      }
      
      console.log(`🚀 Starting Metro for ${appName} (${appId}) on port ${port}`);
      
      // Create workspace
      const workspaceDir = path.join(this.WORKSPACE_BASE, appId);
      await this.createWorkspace(workspaceDir, files);
      
      // Start Metro process
      const metroProcess = await this.startMetroProcess(workspaceDir, port);
      
      const instance: MetroInstance = {
        appId,
        appName,
        process: metroProcess,
        workspaceDir,
        port,
        startTime: new Date(),
        lastAccess: new Date(),
        isReady: false
      };
      
      this.instances.set(appId, instance);
      
      // Wait for Metro to be ready
      const isReady = await this.waitForMetroReady(port, 30);
      
      if (isReady) {
        // Create ngrok tunnel
        const tunnelUrl = await this.createTunnel(port);
        
        if (tunnelUrl) {
          instance.tunnelUrl = tunnelUrl;
          instance.bundleUrl = `${tunnelUrl}/index.bundle?platform=ios&dev=true&minify=false`;
          instance.isReady = true;
          
          console.log(`✅ Metro + tunnel ready for ${appName}:`);
          console.log(`   Metro: http://localhost:${port}`);
          console.log(`   Tunnel: ${tunnelUrl}`);
          console.log(`   Bundle: ${instance.bundleUrl}`);
          
          return {
            success: true,
            tunnelUrl,
            bundleUrl: instance.bundleUrl,
            port
          };
        } else {
          this.stopMetro(appId);
          return {
            success: false,
            error: 'Failed to create ngrok tunnel'
          };
        }
      } else {
        this.stopMetro(appId);
        return {
          success: false,
          error: 'Metro failed to start within timeout'
        };
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to start Metro for ${appName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Create workspace with app files
   */
  private async createWorkspace(workspaceDir: string, files: Record<string, string>): Promise<void> {
    try {
      // Clean and create workspace
      try {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist, ignore
      }
      
      await fs.mkdir(workspaceDir, { recursive: true });
      
      // Write all app files
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(workspaceDir, filePath);
        const dirPath = path.dirname(fullPath);
        
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');
      }
      
      console.log(`📁 Created workspace with ${Object.keys(files).length} files: ${workspaceDir}`);
    } catch (error) {
      console.error(`Failed to create workspace:`, error);
      throw error;
    }
  }
  
  /**
   * Start Metro process
   */
  private async startMetroProcess(workspaceDir: string, port: number): Promise<ChildProcess> {
    // Install dependencies first
    await this.installDependencies(workspaceDir);
    
    const metroProcess = spawn('npx', ['@expo/cli@latest', 'start', '--port', port.toString(), '--dev-client'], {
      cwd: workspaceDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        CI: '1' // Disable interactive prompts
      }
    });
    
    // Log Metro output
    metroProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Metro') || output.includes('Bundler') || output.includes('Starting')) {
        console.log(`[Metro ${port}] ${output.trim()}`);
      }
    });
    
    metroProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('ExpoModulesCorePlugin') && !error.includes('deprecated')) {
        console.error(`[Metro ${port} Error] ${error.trim()}`);
      }
    });
    
    metroProcess.on('exit', (code) => {
      console.log(`Metro process on port ${port} exited with code ${code}`);
    });
    
    return metroProcess;
  }
  
  /**
   * Install dependencies
   */
  private async installDependencies(workspaceDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`📦 Installing dependencies in ${workspaceDir}...`);
      
      const { exec } = require('child_process');
      exec('npm install --legacy-peer-deps', {
        cwd: workspaceDir,
        timeout: 120000 // 2 minute timeout
      }, (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error(`npm install failed: ${error}`);
          reject(error);
        } else {
          console.log(`✅ Dependencies installed in ${workspaceDir}`);
          resolve();
        }
      });
    });
  }
  
  /**
   * Wait for Metro to be ready
   */
  private async waitForMetroReady(port: number, maxAttempts: number = 30): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`http://localhost:${port}/status`, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log(`✅ Metro detected as ready on port ${port} (attempt ${attempt})`);
          return true;
        }
      } catch (error) {
        // Metro not ready yet, continue waiting
      }
      
      console.log(`⏳ Waiting for Metro on port ${port} (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.error(`❌ Metro on port ${port} failed to become ready after ${maxAttempts} attempts`);
    return false;
  }
  
  /**
   * Create ngrok tunnel
   */
  private async createTunnel(port: number): Promise<string | null> {
    try {
      console.log(`🌐 Creating ngrok tunnel for port ${port}...`);
      
      const tunnelUrl = await ngrok.connect({
        port,
        proto: 'http'
      });
      
      console.log(`✅ Tunnel created: ${tunnelUrl}`);
      return tunnelUrl;
    } catch (error) {
      console.error(`❌ Failed to create tunnel for port ${port}:`, error);
      return null;
    }
  }
  
  /**
   * Stop Metro instance
   */
  stopMetro(appId: string): boolean {
    const instance = this.instances.get(appId);
    if (!instance) {
      return false;
    }
    
    console.log(`🛑 Stopping Metro for ${instance.appName} (${appId})`);
    
    try {
      // Kill Metro process
      instance.process.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!instance.process.killed) {
          instance.process.kill('SIGKILL');
        }
      }, 5000);
      
      // Disconnect ngrok tunnel
      if (instance.tunnelUrl) {
        ngrok.disconnect(instance.tunnelUrl).catch(console.error);
      }
      
    } catch (error) {
      console.error(`Error stopping Metro process for ${appId}:`, error);
    }
    
    this.instances.delete(appId);
    console.log(`✅ Metro instance stopped for ${instance.appName}`);
    
    return true;
  }
  
  /**
   * Get Metro instance status
   */
  getStatus(appId: string): any {
    const instance = this.instances.get(appId);
    if (!instance) {
      return null;
    }
    
    const now = new Date();
    return {
      appId: instance.appId,
      appName: instance.appName,
      port: instance.port,
      tunnelUrl: instance.tunnelUrl,
      bundleUrl: instance.bundleUrl,
      isReady: instance.isReady,
      uptime: now.getTime() - instance.startTime.getTime(),
      lastAccess: now.getTime() - instance.lastAccess.getTime()
    };
  }
  
  /**
   * List all active instances
   */
  listInstances(): any[] {
    return Array.from(this.instances.values()).map(instance => {
      const now = new Date();
      return {
        appId: instance.appId,
        appName: instance.appName,
        port: instance.port,
        tunnelUrl: instance.tunnelUrl,
        bundleUrl: instance.bundleUrl,
        isReady: instance.isReady,
        uptime: now.getTime() - instance.startTime.getTime(),
        lastAccess: now.getTime() - instance.lastAccess.getTime()
      };
    });
  }
  
  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveInstances();
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    console.log('🧹 Metro cleanup timer started (5 min intervals)');
  }
  
  /**
   * Clean up inactive instances
   */
  private cleanupInactiveInstances(): void {
    const now = new Date();
    const inactiveInstances: string[] = [];
    
    for (const [appId, instance] of this.instances) {
      const timeSinceLastAccess = now.getTime() - instance.lastAccess.getTime();
      
      if (timeSinceLastAccess > this.METRO_TIMEOUT) {
        inactiveInstances.push(appId);
      }
    }
    
    if (inactiveInstances.length > 0) {
      console.log(`🧹 Cleaning up ${inactiveInstances.length} inactive Metro instances`);
      
      for (const appId of inactiveInstances) {
        this.stopMetro(appId);
      }
    }
  }
  
  /**
   * Shutdown all instances
   */
  shutdown(): void {
    console.log('🛑 Shutting down all Metro instances...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    for (const appId of this.instances.keys()) {
      this.stopMetro(appId);
    }
    
    // Disconnect all ngrok tunnels
    ngrok.disconnect().catch(console.error);
    
    console.log('✅ All Metro instances stopped');
  }
}

// Initialize Metro service
const metroService = new MetroService();

// API Routes

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'metro-service',
    timestamp: new Date().toISOString(),
    activeInstances: metroService.listInstances().length
  });
});

/**
 * Start Metro for an app
 */
app.post('/metro/start', async (req, res) => {
  try {
    const { appId, appName, files } = req.body;
    
    if (!appId || !appName || !files) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: appId, appName, files'
      });
    }
    
    console.log(`📱 Received Metro start request for ${appName} (${appId})`);
    
    const result = await metroService.startMetro(appId, appName, files);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error: any) {
    console.error('Metro start error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Metro status for an app
 */
app.get('/metro/status/:appId', (req, res) => {
  const { appId } = req.params;
  const status = metroService.getStatus(appId);
  
  if (status) {
    res.json({
      success: true,
      status
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Metro instance not found'
    });
  }
});

/**
 * Stop Metro for an app
 */
app.delete('/metro/stop/:appId', (req, res) => {
  const { appId } = req.params;
  const stopped = metroService.stopMetro(appId);
  
  if (stopped) {
    res.json({
      success: true,
      message: 'Metro instance stopped'
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Metro instance not found'
    });
  }
});

/**
 * List all active Metro instances
 */
app.get('/metro/list', (req, res) => {
  const instances = metroService.listInstances();
  
  res.json({
    success: true,
    instances,
    totalInstances: instances.length
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  metroService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  metroService.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Metro Service listening on port ${PORT}`);
  console.log(`📱 Ready to serve Metro instances for TheEverythingApp`);
});

export default app;
