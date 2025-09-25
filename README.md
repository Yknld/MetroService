# Metro Service for TheEverythingApp

A lightweight Metro bundling service that runs on the remote MacBook to handle React Native app bundling and ngrok tunneling for TheEverythingApp.

## Architecture

This service works in conjunction with the Railway-hosted ContainerFinal server:

- **Railway ContainerFinal**: Handles app generation, database, API endpoints
- **Remote MacBook Metro Service**: Handles Metro bundling + ngrok tunneling

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build TypeScript**
   ```bash
   npm run build
   ```

3. **Start Service**
   ```bash
   npm start
   # or use the startup script
   ./start.sh
   ```

## API Endpoints

### Health Check
```
GET /health
```

### Start Metro Instance
```
POST /metro/start
{
  "appId": "970c8dae-33c6-4fd6-b992-26504e92da3c",
  "appName": "HelloApp",
  "files": {
    "App.tsx": "...",
    "package.json": "...",
    "index.js": "..."
  }
}
```

### Get Metro Status
```
GET /metro/status/:appId
```

### Stop Metro Instance
```
DELETE /metro/stop/:appId
```

### List All Instances
```
GET /metro/list
```

## Configuration

- **Port**: 3003 (configurable via PORT env var)
- **Metro Ports**: 8081-8180 (100 concurrent instances)
- **Workspace**: `/tmp/metro-apps/`
- **Cleanup**: Auto-cleanup after 15 minutes inactivity

## Features

- ✅ **Multiple Metro Instances**: Up to 100 concurrent apps
- ✅ **ngrok Tunneling**: Automatic tunnel creation for each app
- ✅ **Auto Cleanup**: Inactive instances cleaned up after 15 minutes
- ✅ **Workspace Management**: Isolated workspaces for each app
- ✅ **Dependency Installation**: Automatic npm install for each app
- ✅ **Health Monitoring**: Status endpoints for monitoring

## Integration with Railway

The Railway ContainerFinal server delegates Metro requests to this service:

1. **App Generation**: Railway handles OpenHands app generation
2. **Metro Request**: Railway sends app files to this service
3. **Metro + Tunnel**: This service creates Metro + ngrok tunnel
4. **URL Return**: Tunnel URL returned to Railway → TheEverythingApp

## Running Alongside ShellAppServer

This service runs on port 3003, while ShellAppServer runs on port 3002. Both can run simultaneously on the same MacBook.

## Logs

The service provides detailed logging for:
- Metro instance lifecycle
- ngrok tunnel creation
- Workspace management
- Error handling
- Cleanup operations
