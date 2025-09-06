# WakeSafe Client

A modern, responsive web client for the WakeSafe driver safety application. This client provides real-time fatigue detection, photo upload capabilities, and session management through WebSocket connections.

## Features

### 🔐 Authentication
- User registration and login
- JWT token-based authentication
- Secure session management
- Automatic token refresh

### 📸 Smart Photo Upload
- Drag & drop file upload
- Presigned URL uploads for direct cloud storage
- Real-time upload progress tracking
- Batch upload support
- File validation and error handling

### 🔌 Real-time Communication
- WebSocket connection for live updates
- Real-time fatigue detection results
- Session status updates
- AI processing notifications

### 📊 Dashboard
- Session management (start/stop)
- Real-time fatigue monitoring
- Photo gallery with AI results
- Activity log
- Connection status indicator

### 🎨 Modern UI/UX
- Responsive design for all devices
- Dark/light theme support
- Smooth animations and transitions
- Accessibility features
- Mobile-first approach

## File Structure

```
client/
├── index.html              # Main HTML file
├── styles/
│   ├── main.css           # Base styles and utilities
│   ├── auth.css           # Authentication page styles
│   ├── dashboard.css      # Dashboard and main app styles
│   └── upload.css         # Upload component styles
├── js/
│   ├── config.js          # Configuration and constants
│   ├── auth.js            # Authentication manager
│   ├── api.js             # API communication layer
│   ├── websocket.js       # WebSocket connection manager
│   ├── upload.js          # File upload manager
│   ├── dashboard.js       # Dashboard functionality
│   └── app.js             # Main application controller
└── README.md              # This file
```

## Getting Started

### Prerequisites
- Modern web browser with JavaScript enabled
- WakeSafe server running on `http://localhost:8080`
- WebSocket support

### Installation
1. Clone the repository
2. Open `index.html` in a web browser
3. Or serve the files using a local web server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

### Configuration
Edit `js/config.js` to modify:
- API endpoints
- Upload limits
- WebSocket settings
- UI preferences

## Usage

### Authentication
1. Register a new account with your details
2. Login with your credentials
3. The app will automatically connect to the server

### Starting a Session
1. Click "Start Session" on the dashboard
2. The session timer will begin
3. Upload photos to monitor fatigue levels

### Photo Upload
1. Drag and drop photos onto the upload area
2. Or click the upload area to select files
3. Monitor upload progress in real-time
4. View processed photos in the gallery

### Monitoring
- Watch real-time fatigue detection results
- Check session duration and statistics
- Review activity logs
- Monitor connection status

## API Integration

The client communicates with the WakeSafe server through:

### REST API Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration
- `POST /api/upload` - Direct photo upload
- `POST /api/upload/presigned` - Get presigned URL
- `GET /api/sessions/current` - Get current session
- `POST /api/sessions` - Start new session

### WebSocket Events
- `photo_upload_start` - Upload initiated
- `photo_upload_progress` - Upload progress update
- `photo_upload_complete` - Upload completed
- `fatigue_detection` - Fatigue analysis results
- `session_update` - Session status changes
- `ai_processing_complete` - AI analysis completed

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Security Features

- JWT token authentication
- HTTPS/WSS support
- Input validation and sanitization
- XSS protection
- CSRF protection through tokens

## Performance

- Lazy loading of components
- Efficient WebSocket reconnection
- Optimized image handling
- Minimal bundle size
- Responsive design

## Development

### Adding New Features
1. Create new modules in `js/` directory
2. Update `app.js` to initialize new modules
3. Add corresponding styles in `styles/`
4. Update this README

### Debugging
- Open browser developer tools
- Check console for error messages
- Monitor network requests
- Use WebSocket debugging tools

## Troubleshooting

### Common Issues

**Connection Failed**
- Check server is running
- Verify API endpoints in config
- Check network connectivity

**Upload Errors**
- Verify file size limits
- Check supported file formats
- Ensure session is active

**WebSocket Issues**
- Check browser WebSocket support
- Verify authentication token
- Monitor connection status indicator

### Error Codes
- `401` - Authentication required
- `403` - Access forbidden
- `413` - File too large
- `415` - Unsupported file type
- `500` - Server error

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is part of the WakeSafe driver safety system.
