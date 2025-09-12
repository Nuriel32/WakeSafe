# WakeSafe Mobile Environment Configuration

This guide explains how to configure the WakeSafe mobile app for different environments (local development, staging, production).

## 🚀 Quick Start

### For Local Development
```bash
# Switch to local development mode
node switch-env.js development

# Start your local server (in server directory)
cd ../server
npm start

# Run the mobile app
npm start
```

### For Production Testing
```bash
# Switch to production mode
node switch-env.js production

# Run the mobile app
npm start
```

## 📁 Environment Files

### `src/config/environment.ts`
Contains environment-specific configurations:
- **Development**: `http://localhost:5000` (local server)
- **Staging**: `https://wakesafe-api-staging-...` (staging server)
- **Production**: `https://wakesafe-api-227831302277.us-central1.run.app` (GCP)

### `env.local`
Contains environment variables (for future use with react-native-config).

## 🔧 Configuration Details

### Development Environment
- **API URL**: `http://localhost:5000/api`
- **WebSocket URL**: `http://localhost:5000`
- **Debug Mode**: Enabled
- **Log Level**: Debug

### Production Environment
- **API URL**: `https://wakesafe-api-227831302277.us-central1.run.app/api`
- **WebSocket URL**: `https://wakesafe-api-227831302277.us-central1.run.app`
- **Debug Mode**: Disabled
- **Log Level**: Error only

## 🛠️ Manual Configuration

If you need to manually edit the environment:

1. Open `src/config/environment.ts`
2. Modify the `getCurrentEnvironment()` function:
   ```typescript
   export const getCurrentEnvironment = (): Environment => {
     return 'development'; // or 'production'
   };
   ```

## 📱 Testing on Physical Device

If testing on a physical device (not simulator):

1. Find your computer's IP address:
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```

2. Update the development configuration in `src/config/environment.ts`:
   ```typescript
   development: {
     API_BASE_URL: 'http://192.168.1.100:5000/api', // Your IP
     WS_URL: 'http://192.168.1.100:5000',
     DEBUG: true,
     LOG_LEVEL: 'debug',
   },
   ```

## 🔍 Troubleshooting

### "Network Error" or "Connection Refused"
- Make sure your local server is running on port 5000
- Check that the IP address is correct (if using physical device)
- Verify firewall settings allow connections on port 5000

### "JSON Parse Error"
- Check server logs for errors
- Ensure the server is responding with JSON, not HTML
- Verify the API endpoints are working

### WebSocket Connection Issues
- Make sure WebSocket is enabled on your server
- Check that the WS_URL matches your server configuration
- Verify CORS settings allow mobile app connections

## 📋 Environment Checklist

### Before Local Testing:
- [ ] Local server is running (`npm start` in server directory)
- [ ] Environment set to development (`node switch-env.js development`)
- [ ] Mobile app can reach the server (test with browser: `http://localhost:5000/healthz`)

### Before Production Testing:
- [ ] Environment set to production (`node switch-env.js production`)
- [ ] GCP services are deployed and running
- [ ] Mobile app can reach GCP endpoints

## 🎯 Current Status

The mobile app is now configured to automatically switch between local and production environments based on the `__DEV__` flag. When running in development mode (Expo dev server), it will connect to your local server. When building for production, it will connect to the GCP deployment.
