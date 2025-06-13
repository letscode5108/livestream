# RTSP Livestream with Overlay Management

A full-stack application that allows users to view RTSP livestreams with customizable overlays. Built with Flask backend, MongoDB for data storage, and designed to work with React frontend.

## Features

- **RTSP Stream Conversion**: Convert RTSP streams to HLS format for web playback
- **Real-time Streaming**: Low-latency video streaming with automatic cleanup
- **Overlay Management**: Create, read, update, and delete custom overlays
- **Overlay Types**: Support for text, logo, and image overlays
- **Positioning & Sizing**: Drag-and-drop positioning with resizable overlays
- **MongoDB Integration**: Persistent storage for overlay configurations
- **RESTful API**: Complete CRUD operations with proper error handling

## Tech Stack

- **Backend**: Python Flask
- **Database**: MongoDB
- **Video Processing**: FFmpeg
- **Streaming Protocol**: HLS (HTTP Live Streaming)
- **API**: RESTful endpoints with JSON responses

## Prerequisites

Before running the application, ensure you have the following installed:

- Python 3.7+
- FFmpeg
- MongoDB
- pip (Python package manager)

### Installing FFmpeg

**Windows:**
1. Download FFmpeg from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Extract and add to system PATH
3. Verify installation: `ffmpeg -version`

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

### Installing MongoDB

**Windows/macOS:**
Download and install from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

## Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd rtsp-streaming-app
```

2. **Create virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install Python dependencies:**
```bash
pip install flask flask-cors pymongo python-dotenv
```

4. **Create environment file:**
Create a `.env` file in the root directory:
```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=rtsp_streaming
```

5. **Start MongoDB:**
```bash
# Make sure MongoDB is running
sudo systemctl start mongodb  # Linux
brew services start mongodb   # macOS
# Or start MongoDB manually on Windows
```

## Usage

### Starting the Application

1. **Start the Flask server:**
```bash
python app.py
```

The server will start on `http://localhost:5000`

2. **Verify the application is running:**
```bash
curl http://localhost:5000/api/health
```

### Basic Workflow

1. **Start a Stream:**
   - Send RTSP URL to `/api/stream/start`
   - Get stream ID and playlist URL
   - Wait for stream to be ready

2. **Create Overlays:**
   - Use `/api/overlays` endpoint to create text, logo, or image overlays
   - Configure position, size, and styling

3. **View Stream:**
   - Access the HLS playlist at `/api/stream/{stream_id}/playlist.m3u8`
   - Use any HLS-compatible video player

4. **Manage Overlays:**
   - Update overlay positions and content
   - Toggle visibility
   - Delete unused overlays

### Example: Starting a Stream

```bash
curl -X POST http://localhost:5000/api/stream/start \
  -H "Content-Type: application/json" \
  -d '{"rtsp_url": "rtsp://your-rtsp-url-here"}'
```

Response:
```json
{
  "stream_id": "123e4567-e89b-12d3-a456-426614174000",
  "playlist_url": "/api/stream/123e4567-e89b-12d3-a456-426614174000/playlist.m3u8",
  "status": "starting",
  "message": "Stream is starting, please wait a few seconds..."
}
```

### Example: Creating an Overlay

```bash
curl -X POST http://localhost:5000/api/overlays \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Company Logo",
    "type": "logo",
    "content": "https://example.com/logo.png",
    "position": {"x": 10, "y": 10},
    "size": {"width": 100, "height": 50},
    "style": {"opacity": 0.8},
    "visible": true,
    "z_index": 2
  }'
```

## Testing with Sample RTSP Streams

You can test the application with these public RTSP streams:

```
rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov
rtsp://demo.beepeeth.com/rtsp_tunnel?channel=1&stream=0.sdp
```

**Note:** Public RTSP streams may have limited availability. For production testing, consider setting up your own RTSP server.

## API Endpoints

### Streaming Endpoints
- `POST /api/stream/start` - Start RTSP stream conversion
- `GET /api/stream/{stream_id}/playlist.m3u8` - Get HLS playlist
- `GET /api/stream/{stream_id}/{filename}` - Get HLS segments
- `POST /api/stream/{stream_id}/stop` - Stop stream
- `GET /api/stream/{stream_id}/status` - Get stream status
- `GET /api/streams` - List all active streams

### Overlay Management Endpoints
- `POST /api/overlays` - Create new overlay
- `GET /api/overlays` - Get all overlays
- `GET /api/overlays/{overlay_id}` - Get specific overlay
- `PUT /api/overlays/{overlay_id}` - Update overlay
- `DELETE /api/overlays/{overlay_id}` - Delete overlay
- `DELETE /api/overlays/bulk` - Delete multiple overlays
- `GET /api/overlays/stream/{stream_id}` - Get overlays for stream

### Utility Endpoints
- `GET /api/health` - Health check

## Directory Structure

```
rtsp-streaming-app/
├── app.py                 # Main Flask application
├── streams/              # Generated HLS files (auto-created)
├── .env                  # Environment variables
├── requirements.txt      # Python dependencies
├── README.md            # This file
└── API_DOCUMENTATION.md # Detailed API docs
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGO_DB` | Database name | `rtsp_streaming` |

### Stream Settings

The application uses the following FFmpeg settings for optimal streaming:
- **Video Codec**: H.264 (libx264)
- **Audio Codec**: AAC
- **HLS Segment Duration**: 2 seconds
- **Playlist Size**: 10 segments
- **Preset**: ultrafast (low latency)

## Troubleshooting

### Common Issues

1. **FFmpeg not found:**
   - Ensure FFmpeg is installed and in system PATH
   - Try using full path to ffmpeg binary

2. **MongoDB connection error:**
   - Verify MongoDB is running: `sudo systemctl status mongodb`
   - Check connection string in `.env` file

3. **Stream not starting:**
   - Verify RTSP URL is accessible
   - Check FFmpeg logs in console output
   - Ensure network connectivity to RTSP source

4. **CORS errors (when integrating with frontend):**
   - The Flask app includes CORS support
   - Ensure frontend is making requests to correct endpoints

### Debug Mode

The application runs in debug mode by default. For production:
```python
app.run(debug=False, host='0.0.0.0', port=5000)
```

### Logs

- FFmpeg output is logged to console
- MongoDB connection status available at `/api/health`
- Stream status can be checked via `/api/stream/{stream_id}/status`

## Security Considerations

⚠️ **Important**: This is a development setup. For production deployment:

1. **Disable debug mode**
2. **Use environment-specific MongoDB credentials**
3. **Implement authentication and authorization**
4. **Use HTTPS/SSL certificates**
5. **Validate and sanitize all inputs**
6. **Implement rate limiting**
7. **Use proper process management (gunicorn, etc.)**

