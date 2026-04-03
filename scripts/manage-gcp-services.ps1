param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop", "status")]
  [string]$Action,

  [string]$ProjectId = "wakesafe-470816",
  [string]$Region = "us-central1",
  [string[]]$Services = @("wakesafe-api", "wakesafe-ml1-service", "wakesafe-ml2-service"),

  [int]$StartMinInstances = 1,
  [int]$StartMaxInstances = 3,
  [int]$StopMinInstances = 0,
  [int]$StopMaxInstances = 1
)

function Ensure-Gcloud {
  $null = Get-Command gcloud -ErrorAction Stop
}

function Run-Or-Throw {
  param([string]$Command)
  Write-Host ">> $Command" -ForegroundColor Cyan
  iex $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

try {
  Ensure-Gcloud
  Run-Or-Throw "gcloud config set project $ProjectId"

  switch ($Action) {
    "status" {
      foreach ($svc in $Services) {
        Write-Host ""
        Write-Host "Service: $svc" -ForegroundColor Yellow
        Run-Or-Throw "gcloud run services describe $svc --region $Region --format `"table(metadata.name,status.url,spec.template.metadata.annotations.'autoscaling.knative.dev/minScale',spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale',status.latestReadyRevisionName)`""
      }
    }

    "start" {
      foreach ($svc in $Services) {
        Write-Host ""
        Write-Host "Starting policy for: $svc" -ForegroundColor Green
        Run-Or-Throw "gcloud run services update $svc --region $Region --min-instances $StartMinInstances --max-instances $StartMaxInstances"
      }
      Write-Host ""
      Write-Host "Done. Services are configured for active usage." -ForegroundColor Green
    }

    "stop" {
      foreach ($svc in $Services) {
        Write-Host ""
        Write-Host "Stopping policy for: $svc" -ForegroundColor Magenta
        Run-Or-Throw "gcloud run services update $svc --region $Region --min-instances $StopMinInstances --max-instances $StopMaxInstances"
      }
      Write-Host ""
      Write-Host "Done. Services scaled for low-cost idle mode." -ForegroundColor Magenta
      Write-Host "Note: Cloud Run still serves requests, but with min-instances=0 it avoids always-on instances." -ForegroundColor DarkYellow
    }
  }
}
catch {
  Write-Error $_
  exit 1
}
