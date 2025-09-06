# WakeSafe Mobile App

A React Native mobile application for the WakeSafe driver safety system. This app provides real-time fatigue detection, photo upload capabilities, and session management for drivers.

## Features

### 🔐 Authentication
- User registration and login
- JWT token-based authentication
- Secure session management
- Form validation with real-time feedback

### 📸 Smart Photo Upload
- Camera integration for taking photos
- Gallery selection for multiple photos
- Real-time upload progress tracking
- Presigned URL uploads for direct cloud storage
- File validation and error handling

### 📊 Dashboard & Session Management
- Start/stop driving sessions
- Real-time session duration tracking
- Fatigue detection display
- Session statistics and history
- Quick action buttons

### 🖼️ Photo Gallery
- View uploaded photos with AI processing status
- Real-time status updates
- Location information display
- Pull-to-refresh functionality

### 👤 Profile Management
- View and edit user profile
- Driving statistics
- Account management
- App information

## Prerequisites

- Node.js 16+ 
- npm or yarn
- Expo CLI
- Expo Go app (for testing on device)
- WakeSafe server running

## Installation

### 1. Clone and Setup
```bash
# Navigate to the mobile app directory
cd WakeSafeMobile

# Run the setup script
chmod +x setup-mobile.sh
./setup-mobile.sh
```

### 2. Manual Setup (Alternative)
```bash
# Install dependencies
npm install

# Install Expo CLI globally (if not already installed)
npm install -g @expo/cli
```

## Configuration

### 1. Update API Endpoints
Edit `src/config/index.ts` to match your server configuration:

```typescript
export const CONFIG = {
  API_BASE_URL: 'http://YOUR_SERVER_IP:8080/api',
  WS_URL: 'http://YOUR_SERVER_IP:8080',
  // ... other config
};
```

### 2. Update Server IP
Make sure your WakeSafe server is accessible from your mobile device:
- Update the IP address in the config file
- Ensure both devices are on the same network
- Check firewall settings if needed

## Running the App

### Development Server
```bash
npm start
```

This will start the Expo development server and display a QR code.

### On Mobile Device
1. Install **Expo Go** app from App Store/Google Play
2. Scan the QR code displayed in the terminal
3. The app will load on your device

### On Simulator/Emulator
```bash
# Android (requires Android Studio)
npm run android

# iOS (requires Xcode on macOS)
npm run ios

# Web browser
npm run web
```

## Project Structure

```
WakeSafeMobile/
├── App.tsx                 # Main app component with navigation
├── src/
│   ├── config/
│   │   └── index.ts       # App configuration
│   ├── types/
│   │   └── index.ts       # TypeScript type definitions
│   ├── hooks/
│   │   ├── useAuth.ts     # Authentication hook
│   │   └── useSession.ts  # Session management hook
│   └── screens/
│       ├── auth/
│       │   ├── LoginScreen.tsx
│       │   └── RegisterScreen.tsx
│       └── main/
│           ├── DashboardScreen.tsx
│           ├── UploadScreen.tsx
│           ├── GalleryScreen.tsx
│           └── ProfileScreen.tsx
├── assets/                # Images and static assets
└── package.json
```

## Key Components

### Authentication System
- **LoginScreen**: User login with email/password
- **RegisterScreen**: User registration with validation
- **useAuth Hook**: Manages authentication state and API calls

### Main App Features
- **DashboardScreen**: Session management and statistics
- **UploadScreen**: Photo capture and upload functionality
- **GalleryScreen**: View uploaded photos and AI results
- **ProfileScreen**: User profile and account management

### Navigation
- **Stack Navigation**: For authentication flow
- **Tab Navigation**: For main app screens
- **Conditional Rendering**: Based on authentication state

## API Integration

The app communicates with the WakeSafe server through:

### REST API Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration
- `POST /api/sessions` - Start new session
- `PUT /api/sessions/:id` - End session
- `GET /api/sessions/current` - Get current session
- `POST /api/upload` - Upload photos
- `GET /api/photos/session/:id` - Get session photos
- `PUT /api/users/profile` - Update user profile

### Authentication
- JWT token stored in AsyncStorage
- Automatic token refresh
- Secure API calls with Bearer token

## Features in Detail

### Photo Upload
- **Camera Integration**: Take photos directly in the app
- **Gallery Selection**: Choose multiple photos from device
- **Progress Tracking**: Real-time upload progress
- **Error Handling**: Comprehensive error management
- **Location Data**: Optional GPS location with photos

### Session Management
- **Start/Stop Sessions**: Easy session control
- **Duration Tracking**: Real-time session timer
- **Statistics**: Session history and totals
- **Status Updates**: Live session status

### User Experience
- **Responsive Design**: Works on all screen sizes
- **Loading States**: Visual feedback during operations
- **Error Messages**: Clear error communication
- **Pull-to-Refresh**: Update data with gestures

## Troubleshooting

### Common Issues

**App won't connect to server**
- Check server IP address in config
- Ensure both devices are on same network
- Verify server is running and accessible

**Photos not uploading**
- Check camera/gallery permissions
- Verify session is active
- Check network connection

**Authentication issues**
- Verify server is running
- Check API endpoints in config
- Clear app data and try again

### Debug Mode
Enable debug mode in Expo Go app:
1. Shake device or press Cmd+D (iOS) / Cmd+M (Android)
2. Select "Debug Remote JS"
3. Check console for error messages

## Development

### Adding New Features
1. Create new screen in `src/screens/`
2. Add navigation route in `App.tsx`
3. Create hooks in `src/hooks/` if needed
4. Update types in `src/types/index.ts`

### Code Style
- Use TypeScript for type safety
- Follow React Native best practices
- Use functional components with hooks
- Implement proper error handling

## Building for Production

### Android APK
```bash
# Build APK
expo build:android

# Or use EAS Build
eas build --platform android
```

### iOS App
```bash
# Build for iOS (requires Apple Developer account)
expo build:ios

# Or use EAS Build
eas build --platform ios
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is part of the WakeSafe driver safety system.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs
3. Check network connectivity
4. Verify configuration settings

---

**Happy Driving! 🚗💨**
