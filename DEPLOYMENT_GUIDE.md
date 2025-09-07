# 🚀 WakeSafe Multi-Service Deployment Guide

## 📋 Prerequisites

### 1. **Google Cloud Setup**
```bash
# Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

### 2. **Docker Setup**
```bash
# Install Docker Desktop
# https://www.docker.com/products/docker-desktop

# Verify installation
docker --version
```

### 3. **GitHub Secrets**
Set these secrets in your GitHub repository:
- `GCP_PROJECT_ID`: Your Google Cloud project ID
- `GCP_SA_KEY`: Service account key (JSON)
- `GCP_REGION`: Deployment region (e.g., us-central1)

## 🏗️ Project Structure

```
WakeSafe/
├── 📱 client/                    # Web client
├── 📱 WakeSafeMobile/            # Mobile app  
├── 🤖 ai_server/                 # AI Server (Python)
├── 🖥️ server/                    # Backend API (Node.js)
├── 🐳 apps/                      # Docker configs
├── 🚀 deploy/                    # Deployment configs
└── 📜 scripts/                   # Deployment scripts
```

## 🚀 Deployment Methods

### Method 1: GitHub Actions (Recommended)

1. **Push to main branch**
   ```bash
   git add .
   git commit -m "Deploy services"
   git push origin main
   ```

2. **Monitor deployment**
   - Go to GitHub Actions tab
   - Watch the deployment progress
   - Check Cloud Run console for service URLs

### Method 2: Manual Deployment

1. **Setup secrets**
   ```bash
   ./deploy/setup-secrets.sh
   ```

2. **Deploy services**
   ```bash
   # Deploy both services
   ./scripts/deploy.sh
   
   # Or deploy individually
   ./scripts/deploy.sh backend
   ./scripts/deploy.sh ai-server
   ```

### Method 3: Individual Service Deployment

#### Backend API
```bash
# Build and push
docker build -f apps/backend/Dockerfile -t gcr.io/PROJECT_ID/wakesafe-api .
docker push gcr.io/PROJECT_ID/wakesafe-api

# Deploy to Cloud Run
gcloud run deploy wakesafe-api \
  --image gcr.io/PROJECT_ID/wakesafe-api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

#### AI Server
```bash
# Build and push
docker build -f apps/ai-server/Dockerfile -t gcr.io/PROJECT_ID/wakesafe-ai .
docker push gcr.io/PROJECT_ID/wakesafe-ai

# Deploy to Cloud Run
gcloud run deploy wakesafe-ai \
  --image gcr.io/PROJECT_ID/wakesafe-ai \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

## 🔧 Configuration

### Environment Variables

#### Backend Service
```bash
NODE_ENV=production
PORT=8080
MONGODB_URL=mongodb://...
REDIS_URL=redis://...
JWT_SECRET=your-secret
GCS_BUCKET=your-bucket
```

#### AI Server
```bash
HOST=0.0.0.0
PORT=8000
PYTHONPATH=/app
WAKESAFE_API_URL=https://wakesafe-api-xxx.run.app
WAKESAFE_API_TOKEN=your-token
AI_SERVER_SECRET_KEY=your-secret
```

### Secrets Management

1. **Create secrets**
   ```bash
   echo -n "your-mongodb-url" | gcloud secrets create mongodb-url --data-file=-
   echo -n "your-redis-url" | gcloud secrets create redis-url --data-file=-
   echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
   ```

2. **Grant access**
   ```bash
   gcloud secrets add-iam-policy-binding mongodb-url \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

## 📊 Service URLs

After deployment, you'll get URLs like:
- **Backend API**: `https://wakesafe-api-xxx.run.app`
- **AI Server**: `https://wakesafe-ai-xxx.run.app`

## 🔍 Testing Deployment

### 1. **Health Checks**
```bash
# Backend health
curl https://wakesafe-api-xxx.run.app/healthz

# AI server health  
curl https://wakesafe-ai-xxx.run.app/health
```

### 2. **Test API Endpoints**
```bash
# Test authentication
curl -X POST https://wakesafe-api-xxx.run.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test AI analysis
curl -X POST https://wakesafe-ai-xxx.run.app/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"photo_id":"test","gcs_url":"https://example.com/photo.jpg"}'
```

## 📱 Mobile App Configuration

Update `WakeSafeMobile/src/config/index.ts`:
```typescript
export const CONFIG = {
  API_BASE_URL: 'https://wakesafe-api-xxx.run.app/api',
  WS_URL: 'https://wakesafe-api-xxx.run.app',
  // ... other config
};
```

## 🌐 Web Client Configuration

Update `client/js/config.js`:
```javascript
const CONFIG = {
  API_BASE_URL: 'https://wakesafe-api-xxx.run.app/api',
  WS_URL: 'https://wakesafe-api-xxx.run.app',
  // ... other config
};
```

## 🔄 CI/CD Pipeline

The GitHub Actions workflow:
1. **Triggers** on push to main branch
2. **Builds** both Docker images in parallel
3. **Pushes** to Artifact Registry
4. **Deploys** to Cloud Run
5. **Tests** deployments
6. **Cleans up** old images

## 📈 Monitoring

### Cloud Run Console
- View service metrics
- Check logs
- Monitor performance

### Health Endpoints
- Backend: `/healthz`, `/readyz`
- AI Server: `/health`

### Custom Metrics
- Processing times
- Error rates
- Request counts

## 🚨 Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check Docker build locally
   docker build -f apps/backend/Dockerfile .
   ```

2. **Deployment Failures**
   ```bash
   # Check Cloud Run logs
   gcloud run services logs wakesafe-api --region=us-central1
   ```

3. **Health Check Failures**
   ```bash
   # Verify environment variables
   gcloud run services describe wakesafe-api --region=us-central1
   ```

4. **Permission Issues**
   ```bash
   # Check service account permissions
   gcloud projects get-iam-policy PROJECT_ID
   ```

### Debug Commands

```bash
# View service details
gcloud run services describe SERVICE_NAME --region=REGION

# View logs
gcloud run services logs SERVICE_NAME --region=REGION

# Test locally
docker run -p 8080:8080 gcr.io/PROJECT_ID/wakesafe-api
```

## 🔐 Security Best Practices

1. **Use Secret Manager** for sensitive data
2. **Enable IAM** for service accounts
3. **Configure CORS** properly
4. **Use HTTPS** for all communications
5. **Regular security updates**

## 📊 Performance Optimization

1. **Resource Allocation**
   - Backend: 2 CPU, 2GB RAM
   - AI Server: 2 CPU, 4GB RAM

2. **Scaling Configuration**
   - Backend: 1-10 instances
   - AI Server: 0-5 instances

3. **Caching Strategy**
   - Redis for session data
   - GCS for image storage

## 🎯 Next Steps

1. **Monitor** service performance
2. **Update** mobile app configuration
3. **Test** end-to-end functionality
4. **Set up** monitoring alerts
5. **Configure** custom domains (optional)
