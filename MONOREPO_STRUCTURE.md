# 🏗️ WakeSafe Monorepo Structure

## 📁 Directory Organization

```
WakeSafe/
├── 📱 client/                    # Web client (React/HTML)
│   ├── index.html
│   ├── js/
│   ├── styles/
│   └── sw.js
│
├── 📱 WakeSafeMobile/            # Mobile app (React Native/Expo)
│   ├── App.tsx
│   ├── src/
│   ├── assets/
│   └── package.json
│
├── 🤖 ai_server/                 # AI Server (Python/FastAPI)
│   ├── app/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── 🖥️ server/                    # Backend API (Node.js/Express)
│   ├── server.js
│   ├── app.js
│   ├── package.json
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   ├── services/
│   ├── middlewares/
│   ├── config/
│   └── utils/
│
├── 🐳 apps/                      # Docker configurations
│   ├── backend/
│   │   └── Dockerfile
│   └── ai-server/
│       └── Dockerfile
│
├── 🚀 deploy/                    # Deployment configurations
│   ├── backend-service.yaml
│   ├── ai-server-service.yaml
│   └── setup-secrets.sh
│
├── 📜 scripts/                   # Deployment scripts
│   └── deploy.sh
│
└── 📋 .github/workflows/         # CI/CD pipelines
    └── deploy-multi-service.yml
```

## 🎯 Services Overview

### 1. **Backend API** (`server/`)
- **Technology**: Node.js + Express
- **Purpose**: Main API server, handles authentication, photo uploads, sessions
- **Port**: 8080
- **Dockerfile**: `apps/backend/Dockerfile`
- **Cloud Run Service**: `wakesafe-api`

### 2. **AI Server** (`ai_server/`)
- **Technology**: Python + FastAPI
- **Purpose**: Fatigue detection, image analysis
- **Port**: 8000
- **Dockerfile**: `apps/ai-server/Dockerfile`
- **Cloud Run Service**: `wakesafe-ai`

### 3. **Web Client** (`client/`)
- **Technology**: HTML + JavaScript
- **Purpose**: Web dashboard interface
- **Deployment**: Static hosting (not containerized)

### 4. **Mobile App** (`WakeSafeMobile/`)
- **Technology**: React Native + Expo
- **Purpose**: Mobile application for drivers
- **Deployment**: App stores (not containerized)

## 🐳 Docker Build Context

### Backend Service
```dockerfile
# Build context: Root directory
# Dockerfile: apps/backend/Dockerfile
# Copies: server/ directory contents
```

### AI Server
```dockerfile
# Build context: Root directory  
# Dockerfile: apps/ai-server/Dockerfile
# Copies: ai_server/ directory contents
```

## 🚀 Deployment Process

### 1. **GitHub Actions Workflow**
- Triggers on push to `main` branch
- Builds both services in parallel
- Pushes to Artifact Registry
- Deploys to Cloud Run

### 2. **Manual Deployment**
```bash
# Deploy both services
./scripts/deploy.sh

# Deploy individual services
./scripts/deploy.sh backend
./scripts/deploy.sh ai-server
```

### 3. **Service URLs**
- **Backend API**: `https://wakesafe-api-xxx.run.app`
- **AI Server**: `https://wakesafe-ai-xxx.run.app`

## 🔧 Configuration

### Environment Variables
- **Backend**: MongoDB, Redis, JWT secrets
- **AI Server**: WakeSafe API URL, model paths
- **Mobile**: Backend API URL, WebSocket URL

### Secrets Management
- Stored in Google Secret Manager
- Accessed by Cloud Run services
- Setup via `deploy/setup-secrets.sh`

## 📱 Mobile App Integration

The mobile app connects to:
- **Backend API**: Authentication, photo uploads, sessions
- **WebSocket**: Real-time fatigue alerts
- **AI Server**: Photo analysis (via backend)

## 🌐 Web Client Integration

The web client connects to:
- **Backend API**: Dashboard data, user management
- **WebSocket**: Real-time updates

## 🔄 Development Workflow

1. **Local Development**
   ```bash
   # Backend
   cd server && npm install && npm start
   
   # AI Server
   cd ai_server && pip install -r requirements.txt && python start.py
   
   # Mobile
   cd WakeSafeMobile && npm install && npx expo start
   ```

2. **Testing**
   ```bash
   # Test backend
   curl http://localhost:8080/healthz
   
   # Test AI server
   curl http://localhost:8000/health
   ```

3. **Deployment**
   ```bash
   # Push to main branch triggers automatic deployment
   git push origin main
   ```

## 📊 Monitoring

- **Health Checks**: `/healthz` (backend), `/health` (AI server)
- **Metrics**: Built-in monitoring via Cloud Run
- **Logs**: Available in Google Cloud Console

## 🔐 Security

- **Authentication**: JWT tokens
- **Secrets**: Google Secret Manager
- **Network**: Private VPC (optional)
- **CORS**: Configured for mobile and web clients

## 📈 Scaling

- **Backend**: Auto-scales 1-10 instances
- **AI Server**: Auto-scales 0-5 instances
- **Resources**: Configurable CPU/memory per service
- **Concurrency**: Optimized for photo processing workload
