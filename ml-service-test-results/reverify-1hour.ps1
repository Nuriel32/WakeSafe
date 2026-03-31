$ErrorActionPreference = "Stop"

$ml1Url = "http://127.0.0.1:8001"
$ml2Url = "http://127.0.0.1:8002"
$resultDir = "E:/WakeSafe/wakesafe/ml-service-test-results"

New-Item -ItemType Directory -Path $resultDir -Force | Out-Null

$sleepingPhotoUrls = @(
    "https://images.pexels.com/photos/935743/pexels-photo-935743.jpeg",
    "https://images.pexels.com/photos/3771069/pexels-photo-3771069.jpeg"
)

$ml1Responses = @()
for ($i = 0; $i -lt $sleepingPhotoUrls.Count; $i++) {
    $payload = @{
        image_url = $sleepingPhotoUrls[$i]
        image_id = "sleep-photo-$($i+1)"
        session_id = "scheduled-recheck"
    } | ConvertTo-Json -Depth 4

    $resp = Invoke-RestMethod -Method Post -Uri "$ml1Url/predict" -ContentType "application/json" -Body $payload
    $ml1Responses += @{
        image_url = $sleepingPhotoUrls[$i]
        response = $resp
    }
}

$ml2Payload = @{
    user_id = "scheduled-user"
    session_id = "scheduled-recheck"
    sequence = @(
        @{ timestamp = "2026-03-31T20:00:00Z"; eye_state = "OPEN"; confidence = 0.94; ear = 0.29; head_pose = @{ pitch = 1.1; yaw = -2.1; roll = 0.2 } },
        @{ timestamp = "2026-03-31T20:00:01Z"; eye_state = "CLOSED"; confidence = 0.95; ear = 0.14; head_pose = @{ pitch = 0.7; yaw = -1.8; roll = 0.1 } },
        @{ timestamp = "2026-03-31T20:00:02Z"; eye_state = "CLOSED"; confidence = 0.96; ear = 0.13; head_pose = @{ pitch = 0.6; yaw = -1.7; roll = 0.1 } },
        @{ timestamp = "2026-03-31T20:00:03Z"; eye_state = "PARTIAL"; confidence = 0.91; ear = 0.21; head_pose = @{ pitch = 0.9; yaw = -1.9; roll = 0.2 } },
        @{ timestamp = "2026-03-31T20:00:04Z"; eye_state = "OPEN"; confidence = 0.93; ear = 0.28; head_pose = @{ pitch = 1.0; yaw = -2.0; roll = 0.2 } }
    )
} | ConvertTo-Json -Depth 8

$ml2Response = Invoke-RestMethod -Method Post -Uri "$ml2Url/analyze" -ContentType "application/json" -Body $ml2Payload

$result = [ordered]@{
    executed_at = (Get-Date).ToString("o")
    ml1_health = (Invoke-RestMethod -Method Get -Uri "$ml1Url/health")
    ml2_health = (Invoke-RestMethod -Method Get -Uri "$ml2Url/health")
    ml1_internet_photo_requests = $ml1Responses
    ml2_analysis = $ml2Response
}

$outputPath = Join-Path $resultDir "reverify-1hour-results.json"
$result | ConvertTo-Json -Depth 12 | Out-File -FilePath $outputPath -Encoding utf8

Write-Output "Saved: $outputPath"
