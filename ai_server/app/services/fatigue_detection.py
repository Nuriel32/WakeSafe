"""
Fatigue Detection Service
Combines HaarCascade, Dlib, and MobileNet for comprehensive fatigue analysis
"""

import asyncio
import cv2
import dlib
import numpy as np
import tensorflow as tf
from typing import Dict, Any, Optional, Tuple
from loguru import logger

from app.config import settings
from app.models.schemas import FatigueAnalysisDetails, HeadPose


class FatigueDetectionService:
    """Main fatigue detection service combining multiple AI approaches"""
    
    def __init__(self):
        self.face_cascade = None
        self.eye_cascade = None
        self.dlib_detector = None
        self.shape_predictor = None
        self.mobilenet_model = None
        self.models_loaded = False
        
        # EAR threshold for eye closure detection
        self.EAR_THRESHOLD = 0.2
        
        # Head pose thresholds
        self.HEAD_POSE_THRESHOLD = 15.0
        
        # Model confidence weights
        self.HAARCASCADE_WEIGHT = 0.3
        self.DLIB_WEIGHT = 0.5
        self.MOBILENET_WEIGHT = 0.2
        
    async def initialize_models(self):
        """Initialize all AI models asynchronously"""
        try:
            logger.info("🔄 Initializing AI models...")
            
            # Load models in parallel
            tasks = [
                self._load_haarcascade_models(),
                self._load_dlib_models(),
                self._load_mobilenet_model()
            ]
            
            await asyncio.gather(*tasks)
            
            self.models_loaded = True
            logger.info("✅ All AI models loaded successfully!")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize models: {e}")
            raise
    
    async def _load_haarcascade_models(self):
        """Load HaarCascade models for face and eye detection"""
        try:
            # Load face detection model
            self.face_cascade = cv2.CascadeClassifier(settings.HAAR_CASCADE_FACE)
            if self.face_cascade.empty():
                raise ValueError("Failed to load HaarCascade face model")
            
            # Load eye detection model
            self.eye_cascade = cv2.CascadeClassifier(settings.HAAR_CASCADE_EYE)
            if self.eye_cascade.empty():
                raise ValueError("Failed to load HaarCascade eye model")
            
            logger.info("✅ HaarCascade models loaded")
            
        except Exception as e:
            logger.error(f"❌ Failed to load HaarCascade models: {e}")
            raise
    
    async def _load_dlib_models(self):
        """Load Dlib models for facial landmarks and pose estimation"""
        try:
            # Load face detector
            self.dlib_detector = dlib.get_frontal_face_detector()
            
            # Load shape predictor for 68 facial landmarks
            self.shape_predictor = dlib.shape_predictor(settings.DLIB_SHAPE_PREDICTOR)
            
            logger.info("✅ Dlib models loaded")
            
        except Exception as e:
            logger.error(f"❌ Failed to load Dlib models: {e}")
            raise
    
    async def _load_mobilenet_model(self):
        """Load MobileNet model for fatigue classification"""
        try:
            # Load TensorFlow Lite model
            self.mobilenet_model = tf.lite.Interpreter(model_path=settings.MOBILENET_MODEL)
            self.mobilenet_model.allocate_tensors()
            
            logger.info("✅ MobileNet model loaded")
            
        except Exception as e:
            logger.error(f"❌ Failed to load MobileNet model: {e}")
            raise
    
    async def analyze_fatigue(self, image_data: bytes) -> FatigueAnalysisDetails:
        """Main fatigue analysis method combining all approaches"""
        try:
            # Convert bytes to OpenCV image
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
            
            # Resize image for processing
            image = cv2.resize(image, (settings.IMAGE_RESIZE_WIDTH, settings.IMAGE_RESIZE_HEIGHT))
            
            # Run all analysis methods in parallel
            tasks = [
                self._haarcascade_analysis(image),
                self._dlib_analysis(image),
                self._mobilenet_analysis(image)
            ]
            
            haarcascade_results, dlib_results, mobilenet_results = await asyncio.gather(*tasks)
            
            # Combine results for final prediction
            final_prediction, confidence = self._combine_predictions(
                haarcascade_results, dlib_results, mobilenet_results
            )
            
            # Extract key metrics
            ear = dlib_results.get('ear', 0.0)
            head_pose = dlib_results.get('head_pose', HeadPose(pitch=0, yaw=0, roll=0))
            face_detected = haarcascade_results.get('face_detected', False)
            eyes_detected = haarcascade_results.get('eyes_detected', False)
            
            return FatigueAnalysisDetails(
                ear=ear,
                head_pose=head_pose,
                face_detected=face_detected,
                eyes_detected=eyes_detected,
                confidence=confidence,
                haarcascade_results=haarcascade_results,
                dlib_results=dlib_results,
                mobilenet_results=mobilenet_results
            )
            
        except Exception as e:
            logger.error(f"❌ Fatigue analysis failed: {e}")
            raise
    
    async def _haarcascade_analysis(self, image: np.ndarray) -> Dict[str, Any]:
        """HaarCascade-based face and eye detection"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Detect faces
            faces = self.face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.1, 
                minNeighbors=5, 
                minSize=(30, 30)
            )
            
            face_detected = len(faces) > 0
            eyes_detected = False
            eye_count = 0
            
            if face_detected:
                # Detect eyes in the largest face
                largest_face = max(faces, key=lambda x: x[2] * x[3])
                x, y, w, h = largest_face
                face_roi = gray[y:y+h, x:x+w]
                
                eyes = self.eye_cascade.detectMultiScale(
                    face_roi,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(20, 20)
                )
                
                eye_count = len(eyes)
                eyes_detected = eye_count >= 2
            
            # Determine prediction based on eye detection
            if not face_detected:
                prediction = "unknown"
                confidence = 0.0
            elif not eyes_detected:
                prediction = "sleeping"
                confidence = 0.8
            else:
                prediction = "alert"
                confidence = 0.7
            
            return {
                "face_detected": face_detected,
                "eyes_detected": eyes_detected,
                "eye_count": eye_count,
                "prediction": prediction,
                "confidence": confidence,
                "faces_detected": len(faces)
            }
            
        except Exception as e:
            logger.error(f"❌ HaarCascade analysis failed: {e}")
            return {
                "face_detected": False,
                "eyes_detected": False,
                "prediction": "unknown",
                "confidence": 0.0,
                "error": str(e)
            }
    
    async def _dlib_analysis(self, image: np.ndarray) -> Dict[str, Any]:
        """Dlib-based facial landmarks and pose estimation"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Detect faces using Dlib
            faces = self.dlib_detector(gray)
            
            if len(faces) == 0:
                return {
                    "face_detected": False,
                    "ear": 0.0,
                    "head_pose": HeadPose(pitch=0, yaw=0, roll=0),
                    "prediction": "unknown",
                    "confidence": 0.0
                }
            
            # Use the largest face
            face = max(faces, key=lambda rect: rect.area())
            
            # Get facial landmarks
            landmarks = self.shape_predictor(gray, face)
            landmarks = np.array([[p.x, p.y] for p in landmarks.parts()])
            
            # Calculate Eye Aspect Ratio (EAR)
            ear = self._calculate_ear(landmarks)
            
            # Calculate head pose
            head_pose = self._calculate_head_pose(landmarks, image.shape)
            
            # Determine prediction based on EAR and head pose
            prediction, confidence = self._analyze_dlib_metrics(ear, head_pose)
            
            return {
                "face_detected": True,
                "ear": ear,
                "head_pose": head_pose,
                "prediction": prediction,
                "confidence": confidence,
                "landmarks_count": len(landmarks)
            }
            
        except Exception as e:
            logger.error(f"❌ Dlib analysis failed: {e}")
            return {
                "face_detected": False,
                "ear": 0.0,
                "head_pose": HeadPose(pitch=0, yaw=0, roll=0),
                "prediction": "unknown",
                "confidence": 0.0,
                "error": str(e)
            }
    
    async def _mobilenet_analysis(self, image: np.ndarray) -> Dict[str, Any]:
        """MobileNet-based fatigue classification"""
        try:
            # Preprocess image for MobileNet
            processed_image = self._preprocess_for_mobilenet(image)
            
            # Run inference
            self.mobilenet_model.set_tensor(
                self.mobilenet_model.get_input_details()[0]['index'], 
                processed_image
            )
            self.mobilenet_model.invoke()
            
            # Get output
            output = self.mobilenet_model.get_tensor(
                self.mobilenet_model.get_output_details()[0]['index']
            )
            
            # Interpret results
            predictions = output[0]
            class_index = np.argmax(predictions)
            confidence = float(predictions[class_index])
            
            # Map class index to prediction
            class_mapping = {0: "alert", 1: "drowsy", 2: "sleeping"}
            prediction = class_mapping.get(class_index, "unknown")
            
            return {
                "prediction": prediction,
                "confidence": confidence,
                "class_index": int(class_index),
                "all_predictions": predictions.tolist()
            }
            
        except Exception as e:
            logger.error(f"❌ MobileNet analysis failed: {e}")
            return {
                "prediction": "unknown",
                "confidence": 0.0,
                "error": str(e)
            }
    
    def _calculate_ear(self, landmarks: np.ndarray) -> float:
        """Calculate Eye Aspect Ratio (EAR)"""
        try:
            # Left eye landmarks (36-41)
            left_eye = landmarks[36:42]
            
            # Right eye landmarks (42-47)
            right_eye = landmarks[42:48]
            
            # Calculate EAR for both eyes
            left_ear = self._eye_aspect_ratio(left_eye)
            right_ear = self._eye_aspect_ratio(right_eye)
            
            # Return average EAR
            return (left_ear + right_ear) / 2.0
            
        except Exception as e:
            logger.error(f"❌ EAR calculation failed: {e}")
            return 0.0
    
    def _eye_aspect_ratio(self, eye_landmarks: np.ndarray) -> float:
        """Calculate EAR for a single eye"""
        # Vertical distances
        A = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
        B = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
        
        # Horizontal distance
        C = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
        
        # EAR formula
        ear = (A + B) / (2.0 * C)
        return ear
    
    def _calculate_head_pose(self, landmarks: np.ndarray, image_shape: Tuple[int, int, int]) -> HeadPose:
        """Calculate head pose from facial landmarks"""
        try:
            # 3D model points for head pose estimation
            model_points = np.array([
                (0.0, 0.0, 0.0),             # Nose tip
                (0.0, -330.0, -65.0),        # Chin
                (-225.0, 170.0, -135.0),     # Left eye left corner
                (225.0, 170.0, -135.0),      # Right eye right corner
                (-150.0, -150.0, -125.0),    # Left mouth corner
                (150.0, -150.0, -125.0)      # Right mouth corner
            ])
            
            # 2D image points
            image_points = np.array([
                landmarks[30],  # Nose tip
                landmarks[8],   # Chin
                landmarks[36],  # Left eye left corner
                landmarks[45],  # Right eye right corner
                landmarks[48],  # Left mouth corner
                landmarks[54]   # Right mouth corner
            ], dtype="double")
            
            # Camera matrix
            size = image_shape
            focal_length = size[1]
            center = (size[1]/2, size[0]/2)
            camera_matrix = np.array(
                [[focal_length, 0, center[0]],
                 [0, focal_length, center[1]],
                 [0, 0, 1]], dtype="double"
            )
            
            # Distortion coefficients
            dist_coeffs = np.zeros((4,1))
            
            # Solve PnP
            (success, rotation_vec, translation_vec) = cv2.solvePnP(
                model_points, image_points, camera_matrix, dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            
            if success:
                # Convert rotation vector to rotation matrix
                rotation_mat, _ = cv2.Rodrigues(rotation_vec)
                
                # Extract Euler angles
                pose_mat = cv2.hconcat((rotation_mat, translation_vec))
                _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(pose_mat)
                
                pitch = float(euler_angles[0])
                yaw = float(euler_angles[1])
                roll = float(euler_angles[2])
                
                return HeadPose(pitch=pitch, yaw=yaw, roll=roll)
            else:
                return HeadPose(pitch=0, yaw=0, roll=0)
                
        except Exception as e:
            logger.error(f"❌ Head pose calculation failed: {e}")
            return HeadPose(pitch=0, yaw=0, roll=0)
    
    def _preprocess_for_mobilenet(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for MobileNet input"""
        # Resize to MobileNet input size (224x224)
        resized = cv2.resize(image, (224, 224))
        
        # Convert BGR to RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        # Normalize to [0, 1]
        normalized = rgb.astype(np.float32) / 255.0
        
        # Add batch dimension
        batched = np.expand_dims(normalized, axis=0)
        
        return batched
    
    def _analyze_dlib_metrics(self, ear: float, head_pose: HeadPose) -> Tuple[str, float]:
        """Analyze Dlib metrics to determine fatigue prediction"""
        # EAR-based analysis
        if ear < self.EAR_THRESHOLD:
            ear_prediction = "sleeping"
            ear_confidence = 0.9
        elif ear < 0.25:
            ear_prediction = "drowsy"
            ear_confidence = 0.7
        else:
            ear_prediction = "alert"
            ear_confidence = 0.8
        
        # Head pose analysis
        head_tilt = abs(head_pose.pitch) + abs(head_pose.roll)
        if head_tilt > self.HEAD_POSE_THRESHOLD:
            pose_prediction = "drowsy"
            pose_confidence = 0.8
        else:
            pose_prediction = "alert"
            pose_confidence = 0.6
        
        # Combine predictions
        if ear_prediction == "sleeping":
            return "sleeping", ear_confidence
        elif ear_prediction == "drowsy" or pose_prediction == "drowsy":
            return "drowsy", max(ear_confidence, pose_confidence)
        else:
            return "alert", max(ear_confidence, pose_confidence)
    
    def _combine_predictions(self, haarcascade: Dict, dlib: Dict, mobilenet: Dict) -> Tuple[str, float]:
        """Combine predictions from all models using weighted voting"""
        predictions = []
        confidences = []
        weights = []
        
        # Collect predictions and confidences
        if haarcascade.get('prediction') != 'unknown':
            predictions.append(haarcascade['prediction'])
            confidences.append(haarcascade['confidence'])
            weights.append(self.HAARCASCADE_WEIGHT)
        
        if dlib.get('prediction') != 'unknown':
            predictions.append(dlib['prediction'])
            confidences.append(dlib['confidence'])
            weights.append(self.DLIB_WEIGHT)
        
        if mobilenet.get('prediction') != 'unknown':
            predictions.append(mobilenet['prediction'])
            confidences.append(mobilenet['confidence'])
            weights.append(self.MOBILENET_WEIGHT)
        
        if not predictions:
            return "unknown", 0.0
        
        # Weighted voting
        prediction_scores = {"alert": 0.0, "drowsy": 0.0, "sleeping": 0.0}
        
        for pred, conf, weight in zip(predictions, confidences, weights):
            prediction_scores[pred] += conf * weight
        
        # Get final prediction
        final_prediction = max(prediction_scores, key=prediction_scores.get)
        final_confidence = prediction_scores[final_prediction]
        
        return final_prediction, final_confidence
    
    def check_models_status(self) -> Dict[str, bool]:
        """Check status of loaded models"""
        return {
            "haarcascade_loaded": self.face_cascade is not None and self.eye_cascade is not None,
            "dlib_loaded": self.dlib_detector is not None and self.shape_predictor is not None,
            "mobilenet_loaded": self.mobilenet_model is not None,
            "all_models_loaded": self.models_loaded
        }
    
    async def check_database_connection(self) -> bool:
        """Check database connection"""
        # This would check MongoDB connection
        return True
    
    async def check_redis_connection(self) -> bool:
        """Check Redis connection"""
        # This would check Redis connection
        return True

