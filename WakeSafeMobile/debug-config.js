// Debug configuration for WakeSafe Mobile App
// Run this file to check your current configuration

console.log('=== WakeSafe Mobile Configuration Debug ===');
console.log('__DEV__:', __DEV__);
console.log('Current API_BASE_URL:', __DEV__ ? 'http://192.168.1.133:8080/api' : 'https://wakesafe-api-227831302277.us-central1.run.app/api');
console.log('Current WS_URL:', __DEV__ ? 'http://192.168.1.133:8080' : 'https://wakesafe-api-227831302277.us-central1.run.app');

// Test network connectivity
const testEndpoint = __DEV__ ? 'http://192.168.1.133:8080/api/auth/register' : 'https://wakesafe-api-227831302277.us-central1.run.app/api/auth/register';

console.log('Testing endpoint:', testEndpoint);

fetch(testEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: 'password123',
    phone: '0501234567',
    carNumber: '1234567'
  })
})
.then(response => {
  console.log('Response status:', response.status);
  console.log('Response headers:', response.headers);
  return response.text();
})
.then(data => {
  console.log('Response data:', data);
})
.catch(error => {
  console.error('Network error:', error);
  console.error('Error details:', error.message);
});
