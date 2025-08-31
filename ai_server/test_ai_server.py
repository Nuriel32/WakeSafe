#!/usr/bin/env python3
"""
Test script for WakeSafe AI Server
Demonstrates basic functionality and API usage
"""

import asyncio
import httpx
import json
from pathlib import Path

# Configuration
AI_SERVER_URL = "http://localhost:8000"
AI_TOKEN = "your_ai_server_secret_key_here"  # Update this with your actual token

async def test_health_check():
    """Test health check endpoint"""
    print("🔍 Testing health check...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AI_SERVER_URL}/health")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed: {data['status']}")
            print(f"   Services: {data['services']}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False

async def test_single_analysis():
    """Test single photo analysis"""
    print("\n📸 Testing single photo analysis...")
    
    # Sample request (you'll need a real GCS URL)
    request_data = {
        "photo_id": "test_photo_123",
        "gcs_url": "https://storage.googleapis.com/wakesafe-bucket/test/photo.jpg"
    }
    
    headers = {
        "Authorization": f"Bearer {AI_TOKEN}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{AI_SERVER_URL}/analyze",
                json=request_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Analysis completed:")
                print(f"   Photo ID: {data['photo_id']}")
                print(f"   Prediction: {data['prediction']}")
                print(f"   Confidence: {data['confidence']:.2f}")
                print(f"   Processing Time: {data['processing_time']:.2f}ms")
                return True
            else:
                print(f"❌ Analysis failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return False

async def test_batch_analysis():
    """Test batch photo analysis"""
    print("\n📸 Testing batch analysis...")
    
    # Sample batch request
    request_data = {
        "photos": [
            {
                "photo_id": "test_photo_1",
                "gcs_url": "https://storage.googleapis.com/wakesafe-bucket/test/photo1.jpg"
            },
            {
                "photo_id": "test_photo_2",
                "gcs_url": "https://storage.googleapis.com/wakesafe-bucket/test/photo2.jpg"
            }
        ]
    }
    
    headers = {
        "Authorization": f"Bearer {AI_TOKEN}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{AI_SERVER_URL}/analyze/batch",
                json=request_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Batch analysis completed:")
                print(f"   Total Photos: {data['total_photos']}")
                print(f"   Successful: {data['successful']}")
                print(f"   Failed: {data['failed']}")
                return True
            else:
                print(f"❌ Batch analysis failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return False

async def test_metrics():
    """Test metrics endpoint"""
    print("\n📊 Testing metrics...")
    
    headers = {
        "Authorization": f"Bearer {AI_TOKEN}"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{AI_SERVER_URL}/metrics",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                performance = data.get('performance', {})
                print(f"✅ Metrics retrieved:")
                print(f"   Total Analyses: {performance.get('total_analyses', 0)}")
                print(f"   Success Rate: {performance.get('success_rate', 0):.1f}%")
                print(f"   Average Processing Time: {performance.get('average_processing_time_ms', 0):.1f}ms")
                print(f"   Predictions: {performance.get('predictions_distribution', {})}")
                return True
            else:
                print(f"❌ Metrics failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return False

async def test_process_queue():
    """Test queue processing"""
    print("\n🔄 Testing queue processing...")
    
    headers = {
        "Authorization": f"Bearer {AI_TOKEN}"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{AI_SERVER_URL}/process-queue?limit=10",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Queue processing completed:")
                print(f"   Message: {data.get('message', 'N/A')}")
                print(f"   Count: {data.get('count', 0)}")
                return True
            else:
                print(f"❌ Queue processing failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return False

async def main():
    """Run all tests"""
    print("🚀 WakeSafe AI Server Test Suite")
    print("=" * 50)
    
    # Check if server is running
    print("🔍 Checking if AI server is running...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{AI_SERVER_URL}/health", timeout=5.0)
            if response.status_code != 200:
                print("❌ AI server is not running or not accessible")
                print("   Please start the server with: python start.py")
                return
    except Exception as e:
        print(f"❌ Cannot connect to AI server: {e}")
        print("   Please start the server with: python start.py")
        return
    
    print("✅ AI server is running!")
    
    # Run tests
    tests = [
        ("Health Check", test_health_check),
        ("Single Analysis", test_single_analysis),
        ("Batch Analysis", test_batch_analysis),
        ("Metrics", test_metrics),
        ("Queue Processing", test_process_queue)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 50)
    print("📋 Test Results Summary:")
    print("=" * 50)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n   Overall: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed! AI server is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the server logs for details.")

if __name__ == "__main__":
    asyncio.run(main())

