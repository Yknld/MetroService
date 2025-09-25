# MetroService Deployment Guide

## 🚀 **Quick Setup on Remote MacBook**

### 1. **Clone the Repository**
```bash
git clone https://github.com/Yknld/MetroService.git
cd MetroService
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Build TypeScript**
```bash
npm run build
```

### 4. **Start the Service**
```bash
# Option 1: Use the startup script
./start.sh

# Option 2: Use npm directly
npm start

# Option 3: Development mode with auto-reload
npm run dev
```

The service will start on **port 3003** and be ready to handle Metro requests from Railway ContainerFinal.

---

## 🔧 **Configuration**

### Environment Variables (Optional)
```bash
# Port for the Metro Service (default: 3003)
export PORT=3003

# Custom workspace directory (default: /tmp/metro-apps)
export WORKSPACE_BASE=/tmp/metro-apps
```

### Firewall Configuration
Make sure port 3003 is accessible from Railway:
```bash
# If using UFW firewall
sudo ufw allow 3003

# Check if port is listening
lsof -i :3003
```

---

## 🧪 **Testing the Service**

### 1. **Health Check**
```bash
curl http://localhost:3003/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "metro-service",
  "timestamp": "2025-09-25T...",
  "activeInstances": 0
}
```

### 2. **Test Metro Start** (Optional)
```bash
curl -X POST http://localhost:3003/metro/start \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "test-app-123",
    "appName": "TestApp",
    "files": {
      "App.tsx": "import React from \"react\"; export default function App() { return null; }",
      "package.json": "{\"name\": \"test-app\", \"dependencies\": {}}"
    }
  }'
```

### 3. **List Active Instances**
```bash
curl http://localhost:3003/metro/list
```

---

## 🔗 **Integration with Railway**

Once the MetroService is running on the remote MacBook, Railway ContainerFinal will automatically delegate Metro requests to:

```
http://207.254.71.97:3003
```

The Railway server detects it's in a cloud environment and uses `RemoteMetroService` instead of local Metro handling.

---

## 📊 **Monitoring**

### Service Status
- **Health**: `GET /health`
- **Active Instances**: `GET /metro/list`
- **Specific App Status**: `GET /metro/status/:appId`

### Logs
The service provides detailed console logging for:
- Metro instance lifecycle
- ngrok tunnel creation/destruction
- Workspace management
- Error handling
- Auto-cleanup operations

### Auto-Cleanup
- Inactive Metro instances are automatically cleaned up after **15 minutes**
- Cleanup runs every **5 minutes**
- Manual cleanup: `DELETE /metro/stop/:appId`

---

## 🛠 **Troubleshooting**

### Common Issues

1. **Port 3003 already in use**
   ```bash
   # Find process using port 3003
   lsof -i :3003
   
   # Kill the process
   kill -9 <PID>
   
   # Or use a different port
   PORT=3004 npm start
   ```

2. **ngrok not found**
   ```bash
   # Install ngrok
   npm install -g ngrok
   
   # Or ensure it's in PATH
   which ngrok
   ```

3. **Metro startup fails**
   ```bash
   # Ensure Expo CLI is available
   npx @expo/cli@latest --version
   
   # Clear npm cache
   npm cache clean --force
   ```

4. **Permission issues with /tmp/metro-apps**
   ```bash
   # Create directory with proper permissions
   sudo mkdir -p /tmp/metro-apps
   sudo chown $(whoami) /tmp/metro-apps
   ```

### Debug Endpoints
- Railway can check remote Metro health: `GET https://containerfinal-production.up.railway.app/debug/remote-metro`

---

## 🔄 **Running as a Service** (Optional)

To keep MetroService running permanently:

### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start service with PM2
pm2 start npm --name "metro-service" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Using systemd (Linux)
```bash
# Create service file
sudo nano /etc/systemd/system/metro-service.service
```

```ini
[Unit]
Description=Metro Service for TheEverythingApp
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/MetroService
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3003

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable metro-service
sudo systemctl start metro-service

# Check status
sudo systemctl status metro-service
```

---

## 📈 **Performance Notes**

- **Concurrent Apps**: Supports up to 100 concurrent Metro instances (ports 8081-8180)
- **Memory Usage**: ~50-100MB per Metro instance
- **Startup Time**: ~30-60 seconds per Metro instance (includes npm install + Metro start + ngrok tunnel)
- **Cleanup**: Automatic cleanup prevents memory leaks from abandoned instances

---

## 🔗 **Repository**
- **GitHub**: https://github.com/Yknld/MetroService
- **Issues**: Report issues on GitHub
- **Updates**: Pull latest changes with `git pull origin main`
