#!/bin/bash

# Setup Google Cloud Secrets for WakeSafe
# This script creates the necessary secrets in Google Secret Manager

set -e

PROJECT_ID=${GCP_PROJECT_ID:-"wakesafe-470816"}
REGION=${GCP_REGION:-"us-central1"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Enable required APIs
enable_apis() {
    log_info "Enabling required Google Cloud APIs..."
    
    gcloud services enable \
        run.googleapis.com \
        cloudbuild.googleapis.com \
        artifactregistry.googleapis.com \
        secretmanager.googleapis.com \
        --project=$PROJECT_ID
    
    log_success "APIs enabled successfully"
}

# Create Artifact Registry repository
create_artifact_registry() {
    log_info "Creating Artifact Registry repository..."
    
    gcloud artifacts repositories create wakesafe \
        --repository-format=docker \
        --location=$REGION \
        --description="WakeSafe Docker images" \
        --project=$PROJECT_ID || log_warning "Repository may already exist"
    
    log_success "Artifact Registry repository created"
}

# Create secrets
create_secrets() {
    log_info "Creating secrets in Secret Manager..."
    
    # MongoDB URL
    read -p "Enter MongoDB URL: " MONGODB_URL
    echo -n "$MONGODB_URL" | gcloud secrets create mongodb-url --data-file=- --project=$PROJECT_ID || \
    echo -n "$MONGODB_URL" | gcloud secrets versions add mongodb-url --data-file=- --project=$PROJECT_ID
    
    # Redis URL
    read -p "Enter Redis URL: " REDIS_URL
    echo -n "$REDIS_URL" | gcloud secrets create redis-url --data-file=- --project=$PROJECT_ID || \
    echo -n "$REDIS_URL" | gcloud secrets versions add redis-url --data-file=- --project=$PROJECT_ID
    
    # JWT Secret
    read -p "Enter JWT Secret: " JWT_SECRET
    echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret --data-file=- --project=$PROJECT_ID || \
    echo -n "$JWT_SECRET" | gcloud secrets versions add jwt-secret --data-file=- --project=$PROJECT_ID
    
    # GCS Bucket
    read -p "Enter GCS Bucket name: " GCS_BUCKET
    echo -n "$GCS_BUCKET" | gcloud secrets create gcs-bucket --data-file=- --project=$PROJECT_ID || \
    echo -n "$GCS_BUCKET" | gcloud secrets versions add gcs-bucket --data-file=- --project=$PROJECT_ID
    
    # WakeSafe API URL (will be set after backend deployment)
    read -p "Enter WakeSafe API URL (or press Enter to set later): " WAKESAFE_API_URL
    if [ ! -z "$WAKESAFE_API_URL" ]; then
        echo -n "$WAKESAFE_API_URL" | gcloud secrets create wakesafe-api-url --data-file=- --project=$PROJECT_ID || \
        echo -n "$WAKESAFE_API_URL" | gcloud secrets versions add wakesafe-api-url --data-file=- --project=$PROJECT_ID
    fi
    
    # WakeSafe API Token
    read -p "Enter WakeSafe API Token: " WAKESAFE_API_TOKEN
    echo -n "$WAKESAFE_API_TOKEN" | gcloud secrets create wakesafe-api-token --data-file=- --project=$PROJECT_ID || \
    echo -n "$WAKESAFE_API_TOKEN" | gcloud secrets versions add wakesafe-api-token --data-file=- --project=$PROJECT_ID
    
    # AI Server Secret Key
    read -p "Enter AI Server Secret Key: " AI_SERVER_SECRET_KEY
    echo -n "$AI_SERVER_SECRET_KEY" | gcloud secrets create ai-server-secret-key --data-file=- --project=$PROJECT_ID || \
    echo -n "$AI_SERVER_SECRET_KEY" | gcloud secrets versions add ai-server-secret-key --data-file=- --project=$PROJECT_ID
    
    log_success "Secrets created successfully"
}

# Grant Cloud Run access to secrets
grant_secret_access() {
    log_info "Granting Cloud Run access to secrets..."
    
    # Get the default compute service account
    COMPUTE_SA=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")-compute@developer.gserviceaccount.com
    
    # Grant access to secrets
    gcloud secrets add-iam-policy-binding mongodb-url \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding redis-url \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding jwt-secret \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding gcs-bucket \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding wakesafe-api-url \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding wakesafe-api-token \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    gcloud secrets add-iam-policy-binding ai-server-secret-key \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    log_success "Secret access granted successfully"
}

# Main setup function
main() {
    log_info "Setting up Google Cloud resources for WakeSafe..."
    
    # Enable APIs
    enable_apis
    
    # Create Artifact Registry
    create_artifact_registry
    
    # Create secrets
    create_secrets
    
    # Grant access
    grant_secret_access
    
    log_success "Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Run the deployment script: ./scripts/deploy.sh"
    echo "2. Update the WakeSafe API URL secret after backend deployment"
    echo "3. Test your services"
}

main "$@"
