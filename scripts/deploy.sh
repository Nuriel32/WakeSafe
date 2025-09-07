#!/bin/bash

# WakeSafe Multi-Service Deployment Script
# This script deploys both backend and AI server to Google Cloud Run

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"wakesafe-470816"}
REGION=${GCP_REGION:-"us-central1"}
REGISTRY="${REGION}-docker.pkg.dev"
REPOSITORY="wakesafe"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if gcloud is installed
check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    log_success "gcloud CLI is installed"
}

# Check if docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    log_success "Docker is installed"
}

# Authenticate with Google Cloud
authenticate() {
    log_info "Authenticating with Google Cloud..."
    gcloud auth login
    gcloud config set project $PROJECT_ID
    gcloud auth configure-docker $REGISTRY
    log_success "Authentication completed"
}

# Build and push backend service
deploy_backend() {
    log_info "Building and deploying backend service..."
    
    # Build the image (context is root directory, Dockerfile copies server/ directory)
    docker build -f apps/backend/Dockerfile -t $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-api:latest .
    
    # Push the image
    docker push $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-api:latest
    
    # Deploy to Cloud Run
    gcloud run deploy wakesafe-api \
        --image $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-api:latest \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --port 8080 \
        --memory 2Gi \
        --cpu 2 \
        --max-instances 10 \
        --min-instances 1 \
        --concurrency 100 \
        --timeout 300 \
        --set-env-vars NODE_ENV=production \
        --set-env-vars PORT=8080
    
    log_success "Backend service deployed successfully"
}

# Build and push AI server service
deploy_ai_server() {
    log_info "Building and deploying AI server service..."
    
    # Build the image (context is root directory, Dockerfile copies ai_server/ directory)
    docker build -f apps/ai-server/Dockerfile -t $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-ai:latest .
    
    # Push the image
    docker push $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-ai:latest
    
    # Deploy to Cloud Run
    gcloud run deploy wakesafe-ai \
        --image $REGISTRY/$PROJECT_ID/$REPOSITORY/wakesafe-ai:latest \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --port 8000 \
        --memory 4Gi \
        --cpu 2 \
        --max-instances 5 \
        --min-instances 0 \
        --concurrency 10 \
        --timeout 300 \
        --set-env-vars HOST=0.0.0.0 \
        --set-env-vars PORT=8000 \
        --set-env-vars PYTHONPATH=/app
    
    log_success "AI server service deployed successfully"
}

# Test deployments
test_deployments() {
    log_info "Testing deployments..."
    
    # Get service URLs
    BACKEND_URL=$(gcloud run services describe wakesafe-api --region=$REGION --format="value(status.url)")
    AI_URL=$(gcloud run services describe wakesafe-ai --region=$REGION --format="value(status.url)")
    
    log_info "Backend URL: $BACKEND_URL"
    log_info "AI Server URL: $AI_URL"
    
    # Test backend health
    if curl -f "$BACKEND_URL/healthz" > /dev/null 2>&1; then
        log_success "Backend health check passed"
    else
        log_error "Backend health check failed"
        exit 1
    fi
    
    # Test AI server health
    if curl -f "$AI_URL/health" > /dev/null 2>&1; then
        log_success "AI server health check passed"
    else
        log_error "AI server health check failed"
        exit 1
    fi
}

# Main deployment function
main() {
    log_info "Starting WakeSafe multi-service deployment..."
    
    # Check prerequisites
    check_gcloud
    check_docker
    
    # Authenticate
    authenticate
    
    # Deploy services
    deploy_backend
    deploy_ai_server
    
    # Test deployments
    test_deployments
    
    log_success "All services deployed successfully!"
    
    # Display service URLs
    BACKEND_URL=$(gcloud run services describe wakesafe-api --region=$REGION --format="value(status.url)")
    AI_URL=$(gcloud run services describe wakesafe-ai --region=$REGION --format="value(status.url)")
    
    echo ""
    echo "🎉 Deployment Complete!"
    echo "======================"
    echo "Backend API: $BACKEND_URL"
    echo "AI Server:   $AI_URL"
    echo ""
    echo "Update your mobile app configuration with these URLs."
}

# Handle command line arguments
case "${1:-}" in
    "backend")
        check_gcloud
        check_docker
        authenticate
        deploy_backend
        ;;
    "ai-server")
        check_gcloud
        check_docker
        authenticate
        deploy_ai_server
        ;;
    "test")
        test_deployments
        ;;
    *)
        main
        ;;
esac
