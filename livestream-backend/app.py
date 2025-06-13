from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import subprocess
import os
import threading
import time
import uuid
import signal
import json
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv


load_dotenv()
app = Flask(__name__)
CORS(app)

STREAM_DIR = "streams"
FFMPEG_PATH = "ffmpeg" 
active_streams = {}  

MONGO_URI = os.getenv('MONGO_URI')
MONGO_DB = os.getenv('MONGO_DB')  

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]
overlays_collection = db.overlays

os.makedirs(STREAM_DIR, exist_ok=True)

class StreamManager:
    def __init__(self, stream_id, rtsp_url):
        self.stream_id = stream_id
        self.rtsp_url = rtsp_url
        self.process = None
        self.output_dir = os.path.join(STREAM_DIR, stream_id)
        self.playlist_file = os.path.join(self.output_dir, "playlist.m3u8")
        self.is_running = False
        
    def start_stream(self):
        """Start FFmpeg process to convert RTSP to HLS"""
        os.makedirs(self.output_dir, exist_ok=True)
       
       
        cmd = [
            FFMPEG_PATH,
            "-i", self.rtsp_url,
            "-c:v", "libx264",         
            "-c:a", "aac",             
            "-preset", "ultrafast",    
            "-tune", "zerolatency",    
            "-f", "hls",               
            "-hls_time", "2",          
            "-hls_list_size", "10",    
            "-hls_flags", "delete_segments+append_list",
            "-hls_segment_filename", os.path.join(self.output_dir, "segment%03d.ts"),
            self.playlist_file,
            "-y"  
        ]
        
        try:
            print(f"Starting FFmpeg with command: {' '.join(cmd)}")
            print(f"Output directory: {self.output_dir}")
            print(f"Playlist file: {self.playlist_file}")
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )
            self.is_running = True
            
            # Start a thread to monitor FFmpeg output
            threading.Thread(target=self._monitor_ffmpeg, daemon=True).start()
            
            print(f"Started stream {self.stream_id} for URL: {self.rtsp_url}")
            return True
        except Exception as e:
            print(f"Error starting stream: {e}")
            return False
    
    def _monitor_ffmpeg(self):
        """Monitor FFmpeg process and log output"""
        if self.process:
            while self.is_running and self.process.poll() is None:
                # Read stderr line by line
                stderr_line = self.process.stderr.readline()
                if stderr_line:
                    print(f"FFmpeg [{self.stream_id}]: {stderr_line.decode().strip()}")
                time.sleep(0.1)
            
            # Get final output
            stdout, stderr = self.process.communicate()
            if stderr:
                print(f"FFmpeg final stderr [{self.stream_id}]: {stderr.decode()}")
            if stdout:
                print(f"FFmpeg final stdout [{self.stream_id}]: {stdout.decode()}")
    
    def stop_stream(self):
        """Stop FFmpeg process and cleanup"""
        if self.process and self.is_running:
            try:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                else:
                    self.process.terminate()
                self.process.wait(timeout=5)
            except:
                if os.name != 'nt':
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                else:
                    self.process.kill()
            
            self.is_running = False
            print(f"Stopped stream {self.stream_id}")
    
    def cleanup_files(self):
        """Remove stream files"""
        try:
            import shutil
            if os.path.exists(self.output_dir):
                shutil.rmtree(self.output_dir)
        except Exception as e:
            print(f"Error cleaning up files: {e}")

def serialize_overlay(overlay):
    """Convert MongoDB document to JSON-serializable format"""
    if overlay:
        overlay['_id'] = str(overlay['_id'])
        return overlay
    return None

def validate_overlay_data(data):
    """Validate overlay data structure"""
    required_fields = ['name', 'type', 'content', 'position', 'size']
    
    # Check required fields
    for field in required_fields:
        if field not in data:
            return False, f"Missing required field: {field}"
    
    # Validate overlay type
    if data['type'] not in ['text', 'logo', 'image']:
        return False, "Invalid overlay type. Must be 'text', 'logo', or 'image'"
    
    # Validate position structure
    position = data['position']
    if not isinstance(position, dict) or 'x' not in position or 'y' not in position:
        return False, "Position must be an object with 'x' and 'y' coordinates"
    
    # Validate size structure
    size = data['size']
    if not isinstance(size, dict) or 'width' not in size or 'height' not in size:
        return False, "Size must be an object with 'width' and 'height' dimensions"
    
    return True, "Valid"

# STREAMING ENDPOINTS (existing)
@app.route('/api/stream/start', methods=['POST'])
def start_stream():
    """Start a new RTSP stream conversion"""
    data = request.get_json()
    
    if not data or 'rtsp_url' not in data:
        return jsonify({'error': 'RTSP URL is required'}), 400
    
    rtsp_url = data['rtsp_url']
    
    # Validate RTSP URL format
    if not rtsp_url.startswith('rtsp://'):
        return jsonify({'error': 'Invalid RTSP URL format'}), 400
    
    # Generate unique stream ID
    stream_id = str(uuid.uuid4())
    
    # Create stream manager
    stream_manager = StreamManager(stream_id, rtsp_url)
    
    # Start the stream
    if stream_manager.start_stream():
        active_streams[stream_id] = stream_manager
        
        return jsonify({
            'stream_id': stream_id,
            'playlist_url': f'/api/stream/{stream_id}/playlist.m3u8',
            'status': 'starting',
            'message': 'Stream is starting, please wait a few seconds...'
        }), 200
    else:
        return jsonify({'error': 'Failed to start stream'}), 500

@app.route('/api/stream/<stream_id>/playlist.m3u8')
def get_playlist(stream_id):
    """Serve HLS playlist file"""
    if stream_id not in active_streams:
        return jsonify({'error': 'Stream not found'}), 404
    
    stream_manager = active_streams[stream_id]
    playlist_file = stream_manager.playlist_file
    
    if not os.path.exists(playlist_file):
        return jsonify({'error': 'Playlist not ready yet'}), 404
    
    return send_file(playlist_file, mimetype='application/vnd.apple.mpegurl')

@app.route('/api/stream/<stream_id>/<filename>')
def get_segment(stream_id, filename):
    """Serve HLS segment files"""
    if stream_id not in active_streams:
        return jsonify({'error': 'Stream not found'}), 404
    
    stream_manager = active_streams[stream_id]
    file_path = os.path.join(stream_manager.output_dir, filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Segment not found'}), 404
    
    return send_file(file_path, mimetype='video/mp2t')

@app.route('/api/stream/<stream_id>/stop', methods=['POST'])
def stop_stream(stream_id):
    """Stop a running stream"""
    if stream_id not in active_streams:
        return jsonify({'error': 'Stream not found'}), 404
    
    stream_manager = active_streams[stream_id]
    stream_manager.stop_stream()
    stream_manager.cleanup_files()
    
    del active_streams[stream_id]
    
    return jsonify({'message': 'Stream stopped successfully'})

@app.route('/api/stream/<stream_id>/status')
def get_stream_status(stream_id):
    """Get stream status"""
    if stream_id not in active_streams:
        return jsonify({'error': 'Stream not found'}), 404
    
    stream_manager = active_streams[stream_id]
    
    # Check if playlist exists (stream is ready)
    playlist_exists = os.path.exists(stream_manager.playlist_file)
    
    return jsonify({
        'stream_id': stream_id,
        'is_running': stream_manager.is_running,
        'playlist_ready': playlist_exists,
        'playlist_url': f'/api/stream/{stream_id}/playlist.m3u8' if playlist_exists else None
    })

@app.route('/api/streams')
def list_streams():
    """List all active streams"""
    streams = []
    for stream_id, manager in active_streams.items():
        streams.append({
            'stream_id': stream_id,
            'rtsp_url': manager.rtsp_url,
            'is_running': manager.is_running,
            'playlist_ready': os.path.exists(manager.playlist_file)
        })
    
    return jsonify({'streams': streams})

# OVERLAY CRUD ENDPOINTS

@app.route('/api/overlays', methods=['POST'])
def create_overlay():
    """Create a new overlay"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate overlay data
        is_valid, message = validate_overlay_data(data)
        if not is_valid:
            return jsonify({'error': message}), 400
        
        # Add metadata
        overlay_data = {
            'name': data['name'],
            'type': data['type'],  # text, logo, image
            'content': data['content'],  # text content or image URL/path
            'position': {
                'x': data['position']['x'],
                'y': data['position']['y']
            },
            'size': {
                'width': data['size']['width'],
                'height': data['size']['height']
            },
            'style': data.get('style', {}),  # Optional styling (color, font, etc.)
            'visible': data.get('visible', True),
            'z_index': data.get('z_index', 1),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Insert into MongoDB
        result = overlays_collection.insert_one(overlay_data)
        
        # Return created overlay
        created_overlay = overlays_collection.find_one({'_id': result.inserted_id})
        
        return jsonify({
            'message': 'Overlay created successfully',
            'overlay': serialize_overlay(created_overlay)
        }), 201
        
    except Exception as e:
        return jsonify({'error': f'Failed to create overlay: {str(e)}'}), 500

@app.route('/api/overlays', methods=['GET'])
def get_overlays():
    """Get all overlays with optional filtering"""
    try:
        # Get query parameters for filtering
        overlay_type = request.args.get('type')
        visible_only = request.args.get('visible_only', 'false').lower() == 'true'
        
        # Build query
        query = {}
        if overlay_type:
            query['type'] = overlay_type
        if visible_only:
            query['visible'] = True
        
        # Get overlays from MongoDB
        overlays = list(overlays_collection.find(query).sort('created_at', -1))
        
        # Serialize overlays
        serialized_overlays = [serialize_overlay(overlay) for overlay in overlays]
        
        return jsonify({
            'overlays': serialized_overlays,
            'count': len(serialized_overlays)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve overlays: {str(e)}'}), 500

@app.route('/api/overlays/<overlay_id>', methods=['GET'])
def get_overlay(overlay_id):
    """Get a specific overlay by ID"""
    try:
        # Validate ObjectId
        try:
            obj_id = ObjectId(overlay_id)
        except InvalidId:
            return jsonify({'error': 'Invalid overlay ID format'}), 400
        
        # Find overlay
        overlay = overlays_collection.find_one({'_id': obj_id})
        
        if not overlay:
            return jsonify({'error': 'Overlay not found'}), 404
        
        return jsonify({
            'overlay': serialize_overlay(overlay)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve overlay: {str(e)}'}), 500

@app.route('/api/overlays/<overlay_id>', methods=['PUT'])
def update_overlay(overlay_id):
    """Update an existing overlay"""
    try:
        # Validate ObjectId
        try:
            obj_id = ObjectId(overlay_id)
        except InvalidId:
            return jsonify({'error': 'Invalid overlay ID format'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Check if overlay exists
        existing_overlay = overlays_collection.find_one({'_id': obj_id})
        if not existing_overlay:
            return jsonify({'error': 'Overlay not found'}), 404
        
        # Validate updated data if provided
        if any(field in data for field in ['name', 'type', 'content', 'position', 'size']):
            # Merge with existing data for validation
            merged_data = existing_overlay.copy()
            merged_data.update(data)
            is_valid, message = validate_overlay_data(merged_data)
            if not is_valid:
                return jsonify({'error': message}), 400
        
        # Prepare update data
        update_data = {}
        allowed_fields = ['name', 'type', 'content', 'position', 'size', 'style', 'visible', 'z_index']
        
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        # Add updated timestamp
        update_data['updated_at'] = datetime.utcnow()
        
        # Update in MongoDB
        result = overlays_collection.update_one(
            {'_id': obj_id},
            {'$set': update_data}
        )
        
        if result.modified_count == 0:
            return jsonify({'error': 'No changes made to overlay'}), 400
        
        # Return updated overlay
        updated_overlay = overlays_collection.find_one({'_id': obj_id})
        
        return jsonify({
            'message': 'Overlay updated successfully',
            'overlay': serialize_overlay(updated_overlay)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to update overlay: {str(e)}'}), 500

@app.route('/api/overlays/<overlay_id>', methods=['DELETE'])
def delete_overlay(overlay_id):
    """Delete an overlay"""
    try:
       
        try:
            obj_id = ObjectId(overlay_id)
        except InvalidId:
            return jsonify({'error': 'Invalid overlay ID format'}), 400
       
       
        existing_overlay = overlays_collection.find_one({'_id': obj_id})
        if not existing_overlay:
            return jsonify({'error': 'Overlay not found'}), 404
        
     
        result = overlays_collection.delete_one({'_id': obj_id})
        
        if result.deleted_count == 0:
            return jsonify({'error': 'Failed to delete overlay'}), 500
        
        return jsonify({
            'message': 'Overlay deleted successfully',
            'deleted_overlay_id': overlay_id
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to delete overlay: {str(e)}'}), 500

@app.route('/api/overlays/bulk', methods=['DELETE'])
def delete_overlays_bulk():
    """Delete multiple overlays"""
    try:
        data = request.get_json()
        if not data or 'overlay_ids' not in data:
            return jsonify({'error': 'overlay_ids array is required'}), 400
        
        overlay_ids = data['overlay_ids']
        if not isinstance(overlay_ids, list) or len(overlay_ids) == 0:
            return jsonify({'error': 'overlay_ids must be a non-empty array'}), 400
     
     
        try:
            obj_ids = [ObjectId(id_str) for id_str in overlay_ids]
        except InvalidId:
            return jsonify({'error': 'One or more overlay IDs have invalid format'}), 400
      
      
        result = overlays_collection.delete_many({'_id': {'$in': obj_ids}})
        
        return jsonify({
            'message': f'Successfully deleted {result.deleted_count} overlays',
            'deleted_count': result.deleted_count,
            'requested_count': len(overlay_ids)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to delete overlays: {str(e)}'}), 500

@app.route('/api/overlays/stream/<stream_id>', methods=['GET'])
def get_stream_overlays(stream_id):
    """Get overlays associated with a specific stream"""
    try:
       
        if stream_id not in active_streams:
            return jsonify({'error': 'Stream not found'}), 404
        
       
       
        overlays = list(overlays_collection.find({'visible': True}).sort('z_index', 1))
       
       
        serialized_overlays = [serialize_overlay(overlay) for overlay in overlays]
        
        return jsonify({
            'stream_id': stream_id,
            'overlays': serialized_overlays,
            'count': len(serialized_overlays)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve stream overlays: {str(e)}'}), 500

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    try:
        
        db.command('ping')
        mongo_status = 'connected'
    except Exception as e:
        mongo_status = f'error: {str(e)}'
    
    return jsonify({
        'status': 'healthy',
        'mongodb': mongo_status,
        'active_streams': len(active_streams),
        'timestamp': datetime.utcnow().isoformat()
    }), 200



def cleanup_on_exit():
    """Cleanup function to stop all streams on exit"""
    print("Cleaning up streams...")
    for stream_id, manager in active_streams.items():
        manager.stop_stream()
        manager.cleanup_files()

if __name__ == '__main__':
    import atexit
    atexit.register(cleanup_on_exit)
    
    print("Starting Flask app with overlay management...")
    print("Make sure MongoDB is running on localhost:27017")
    app.run(debug=True, host='0.0.0.0', port=5000)