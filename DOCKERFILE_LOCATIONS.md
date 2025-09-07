# 🐳 WakeSafe Dockerfile Locations and Purposes

## 📁 Current Dockerfile Structure

### **1. `server/dockerfile` (Legacy - Lowercase)**
- **Purpose**: Original backend Dockerfile (legacy)
- **Status**: ❌ **OUTDATED** - Should be removed
- **Issues**: 
  - Uses lowercase filename
  - Copies from current directory instead of server/
  - Missing build optimizations

### **2. `ai_server/Dockerfile` (AI Server Root)**
- **Purpose**: AI server Dockerfile in original location
- **Status**: ✅ **GOOD** - Updated and working
- **Features**:
  - Python 3.9-slim base
  - OpenCV and dlib dependencies
  - AI model downloads
  - Health checks
  - **Fixed**: `libatlas3-base` instead of `libatlas-base-dev`

### **3. `apps/backend/Dockerfile` (Monorepo Backend)**
- **Purpose**: Optimized backend Dockerfile for monorepo
- **Status**: ✅ **GOOD** - Current and optimized
- **Features**:
  - Node.js 18-alpine base
  - Multi-stage build
  - Copies from `server/` directory
  - Redis and tini included
  - Health checks
  - Proper build context

### **4. `apps/ai-server/Dockerfile` (Monorepo AI Server)**
- **Purpose**: Optimized AI server Dockerfile for monorepo
- **Status**: ✅ **GOOD** - Current and optimized
- **Features**:
  - Python 3.9-slim base
  - Copies from `ai_server/` directory
  - All AI dependencies
  - Model downloads
  - Health checks

## 🔧 GitHub Actions Workflow Configuration

### **Current Workflow Usage**
- **`deploy.yml`**: Uses `apps/backend/Dockerfile` ✅
- **`deploy-multi-service.yml`**: Uses both `apps/backend/Dockerfile` and `apps/ai-server/Dockerfile` ✅

### **Fixed Issues**
1. **Docker Tag Format**: Fixed double slashes in Artifact Registry URLs
2. **Registry Configuration**: Updated from GCR to Artifact Registry
3. **Build Context**: Proper monorepo build context

## 🚀 Recommended Actions

### **1. Remove Legacy Dockerfile**
```bash
# Remove the outdated server/dockerfile
rm server/dockerfile
```

### **2. Keep Current Structure**
```
WakeSafe/
├── apps/
│   ├── backend/Dockerfile      # ✅ Backend service
│   └── ai-server/Dockerfile    # ✅ AI server service
├── ai_server/Dockerfile        # ✅ AI server (original location)
└── server/                     # Backend code (no Dockerfile needed)
```

### **3. Build Commands**
```bash
# Backend service
docker build -f apps/backend/Dockerfile -t wakesafe-backend .

# AI server service
docker build -f apps/ai-server/Dockerfile -t wakesafe-ai .
```

## 📊 Dockerfile Comparison

| Feature | server/dockerfile | apps/backend/Dockerfile | ai_server/Dockerfile | apps/ai-server/Dockerfile |
|---------|------------------|------------------------|---------------------|---------------------------|
| **Status** | ❌ Legacy | ✅ Current | ✅ Working | ✅ Current |
| **Base Image** | node:18-alpine | node:18-alpine | python:3.9-slim | python:3.9-slim |
| **Build Context** | Current dir | server/ | Current dir | ai_server/ |
| **Multi-stage** | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| **Health Checks** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Optimizations** | ❌ Basic | ✅ Advanced | ✅ Good | ✅ Advanced |
| **Monorepo Ready** | ❌ No | ✅ Yes | ❌ No | ✅ Yes |

## 🎯 Final Recommendation

**Keep the current structure:**
- ✅ `apps/backend/Dockerfile` - For backend service
- ✅ `apps/ai-server/Dockerfile` - For AI server service
- ✅ `ai_server/Dockerfile` - Keep as backup/reference
- ❌ `server/dockerfile` - **REMOVE** (legacy)

**GitHub Actions will use:**
- `apps/backend/Dockerfile` for backend deployment
- `apps/ai-server/Dockerfile` for AI server deployment

This structure provides:
- ✅ Proper monorepo organization
- ✅ Optimized builds
- ✅ Clear separation of concerns
- ✅ Easy maintenance and updates
