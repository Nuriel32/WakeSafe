"""
Metrics collection for WakeSafe AI Server
"""

import time
from datetime import datetime, timedelta
from typing import Dict, Any
from collections import defaultdict, deque
from loguru import logger


class MetricsCollector:
    """Collects and tracks performance metrics"""
    
    def __init__(self):
        self.start_time = time.time()
        self.total_analyses = 0
        self.successful_analyses = 0
        self.failed_analyses = 0
        self.predictions_distribution = defaultdict(int)
        self.processing_times = deque(maxlen=1000)  # Keep last 1000 times
        self.errors = deque(maxlen=100)  # Keep last 100 errors
        self.recent_analyses = deque(maxlen=100)  # Keep last 100 analyses
        
        # Performance tracking
        self.haarcascade_times = deque(maxlen=100)
        self.dlib_times = deque(maxlen=100)
        self.mobilenet_times = deque(maxlen=100)
        
        # Model performance
        self.model_accuracy = {
            "haarcascade": {"correct": 0, "total": 0},
            "dlib": {"correct": 0, "total": 0},
            "mobilenet": {"correct": 0, "total": 0}
        }
    
    def start_timer(self) -> float:
        """Start a performance timer"""
        return time.time()
    
    def end_timer(self, start_time: float) -> float:
        """End a performance timer and return duration in milliseconds"""
        return (time.time() - start_time) * 1000
    
    def record_analysis(self, prediction: str, confidence: float, processing_time: float):
        """Record analysis results"""
        self.total_analyses += 1
        self.successful_analyses += 1
        self.predictions_distribution[prediction] += 1
        self.processing_times.append(processing_time)
        
        # Record recent analysis
        self.recent_analyses.append({
            "timestamp": datetime.utcnow(),
            "prediction": prediction,
            "confidence": confidence,
            "processing_time": processing_time
        })
        
        logger.debug(f"📊 Recorded analysis: {prediction} (confidence: {confidence:.2f}, time: {processing_time:.2f}ms)")
    
    def record_error(self, error: str):
        """Record an error"""
        self.total_analyses += 1
        self.failed_analyses += 1
        self.errors.append({
            "timestamp": datetime.utcnow(),
            "error": error
        })
        
        logger.error(f"📊 Recorded error: {error}")
    
    def record_model_performance(self, model: str, processing_time: float, correct: bool = None):
        """Record individual model performance"""
        if model == "haarcascade":
            self.haarcascade_times.append(processing_time)
        elif model == "dlib":
            self.dlib_times.append(processing_time)
        elif model == "mobilenet":
            self.mobilenet_times.append(processing_time)
        
        if correct is not None:
            self.model_accuracy[model]["total"] += 1
            if correct:
                self.model_accuracy[model]["correct"] += 1
    
    def get_uptime(self) -> float:
        """Get server uptime in seconds"""
        return time.time() - self.start_time
    
    def get_average_processing_time(self) -> float:
        """Get average processing time in milliseconds"""
        if not self.processing_times:
            return 0.0
        return sum(self.processing_times) / len(self.processing_times)
    
    def get_error_rate(self) -> float:
        """Get error rate as percentage"""
        if self.total_analyses == 0:
            return 0.0
        return (self.failed_analyses / self.total_analyses) * 100
    
    def get_model_accuracy(self, model: str) -> float:
        """Get accuracy for a specific model"""
        stats = self.model_accuracy.get(model, {"correct": 0, "total": 0})
        if stats["total"] == 0:
            return 0.0
        return (stats["correct"] / stats["total"]) * 100
    
    def get_recent_activity(self, minutes: int = 5) -> list:
        """Get recent analysis activity"""
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes)
        return [
            analysis for analysis in self.recent_analyses
            if analysis["timestamp"] > cutoff_time
        ]
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get comprehensive performance summary"""
        return {
            "uptime_seconds": self.get_uptime(),
            "total_analyses": self.total_analyses,
            "successful_analyses": self.successful_analyses,
            "failed_analyses": self.failed_analyses,
            "success_rate": ((self.successful_analyses / self.total_analyses) * 100) if self.total_analyses > 0 else 0,
            "error_rate": self.get_error_rate(),
            "average_processing_time_ms": self.get_average_processing_time(),
            "predictions_distribution": dict(self.predictions_distribution),
            "recent_activity_count": len(self.get_recent_activity()),
            "model_performance": {
                model: {
                    "accuracy": self.get_model_accuracy(model),
                    "avg_processing_time": self._get_model_avg_time(model)
                }
                for model in ["haarcascade", "dlib", "mobilenet"]
            }
        }
    
    def _get_model_avg_time(self, model: str) -> float:
        """Get average processing time for a specific model"""
        times = []
        if model == "haarcascade":
            times = self.haarcascade_times
        elif model == "dlib":
            times = self.dlib_times
        elif model == "mobilenet":
            times = self.mobilenet_times
        
        if not times:
            return 0.0
        return sum(times) / len(times)
    
    async def get_all_metrics(self) -> Dict[str, Any]:
        """Get all metrics for API endpoint"""
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "performance": self.get_performance_summary(),
            "recent_errors": list(self.errors)[-10:],  # Last 10 errors
            "recent_analyses": list(self.recent_analyses)[-10:]  # Last 10 analyses
        }
    
    def reset_metrics(self):
        """Reset all metrics (useful for testing)"""
        self.total_analyses = 0
        self.successful_analyses = 0
        self.failed_analyses = 0
        self.predictions_distribution.clear()
        self.processing_times.clear()
        self.errors.clear()
        self.recent_analyses.clear()
        self.haarcascade_times.clear()
        self.dlib_times.clear()
        self.mobilenet_times.clear()
        
        for model in self.model_accuracy:
            self.model_accuracy[model] = {"correct": 0, "total": 0}
        
        logger.info("📊 Metrics reset")

