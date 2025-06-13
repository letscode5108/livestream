import subprocess
import threading
import os
import signal
from datetime import datetime

class FFmpegManager:
    def __init__(self):
        self.active_processes = {}
        self.lock = threading.Lock()
    
    def start_stream(self, stream_id, rtsp_url, output_dir, overlays=None):
        """Start FFmpeg process for RTSP streaming"""
        
        output_path = os.path.join(output_dir, f"{stream_id}.m3u8")
        
        # Base command
        cmd = [
            'ffmpeg',
            '-i', rtsp_url,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-c:a', 'aac',
            '-strict', 'experimental',
        ]
        
        # Add overlays if provided
        if overlays:
            filter_complex = self._build_overlay_filter(overlays)
            cmd.extend(['-filter_complex', filter_complex])
        
        # HLS output settings
        cmd.extend([
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments',
            '-y',
            output_path
        ])
        
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            with self.lock:
                self.active_processes[stream_id] = {
                    'process': process,
                    'output_path': output_path,
                    'started_at': datetime.now()
                }
            
            return True, f"Stream {stream_id} started successfully"
            
        except Exception as e:
            return False, f"Failed to start stream: {str(e)}"
    
    def stop_stream(self, stream_id):
        """Stop FFmpeg process"""
        with self.lock:
            if stream_id in self.active_processes:
                process = self.active_processes[stream_id]['process']
                process.terminate()
                del self.active_processes[stream_id]
                return True, f"Stream {stream_id} stopped"
            return False, f"Stream {stream_id} not found"
    
    def _build_overlay_filter(self, overlays):
        """Build FFmpeg filter_complex for overlays"""
        filters = []
        
        for i, overlay in enumerate(overlays):
            if overlay['type'] == 'text':
                text_filter = f"drawtext=text='{overlay['content']}':x={overlay['x']}:y={overlay['y']}:fontsize={overlay.get('size', 24)}:fontcolor={overlay.get('color', 'white')}"
                filters.append(text_filter)
            
            elif overlay['type'] == 'image':
                # For image overlays, you'd need to handle file paths
                image_filter = f"overlay=x={overlay['x']}:y={overlay['y']}"
                filters.append(image_filter)
        
        return ','.join(filters) if filters else None
    
    def get_active_streams(self):
        """Get list of active streams"""
        with self.lock:
            return list(self.active_processes.keys())

# Global instance
ffmpeg_manager = FFmpegManager()