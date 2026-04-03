#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
PROJECT_ID="${PROJECT_ID:-wakesafe-470816}"
REGION="${REGION:-us-central1}"
SERVICES=("${@:2}")

if [[ -z "$ACTION" ]]; then
  echo "Usage: ./scripts/manage-gcp-services.sh <start|stop|status> [service1 service2 ...]"
  exit 1
fi

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("wakesafe-api" "wakesafe-ml1-service" "wakesafe-ml2-service")
fi

START_MIN_INSTANCES="${START_MIN_INSTANCES:-1}"
START_MAX_INSTANCES="${START_MAX_INSTANCES:-3}"
STOP_MIN_INSTANCES="${STOP_MIN_INSTANCES:-0}"
STOP_MAX_INSTANCES="${STOP_MAX_INSTANCES:-1}"

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud CLI is required."
  exit 1
}

gcloud config set project "$PROJECT_ID" >/dev/null

for svc in "${SERVICES[@]}"; do
  case "$ACTION" in
    status)
      echo ""
      echo "Service: $svc"
      gcloud run services describe "$svc" \
        --region "$REGION" \
        --format="table(metadata.name,status.url,spec.template.metadata.annotations.'autoscaling.knative.dev/minScale',spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale',status.latestReadyRevisionName)"
      ;;
    start)
      echo ""
      echo "Starting policy for: $svc"
      gcloud run services update "$svc" \
        --region "$REGION" \
        --min-instances "$START_MIN_INSTANCES" \
        --max-instances "$START_MAX_INSTANCES"
      ;;
    stop)
      echo ""
      echo "Stopping policy for: $svc"
      gcloud run services update "$svc" \
        --region "$REGION" \
        --min-instances "$STOP_MIN_INSTANCES" \
        --max-instances "$STOP_MAX_INSTANCES"
      ;;
    *)
      echo "Invalid action: $ACTION"
      echo "Usage: ./scripts/manage-gcp-services.sh <start|stop|status> [service1 service2 ...]"
      exit 1
      ;;
  esac
done

if [[ "$ACTION" == "stop" ]]; then
  echo ""
  echo "Done. Services are now in low-cost idle mode (min-instances=0)."
fi
