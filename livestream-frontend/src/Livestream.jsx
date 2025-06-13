import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, Monitor, Eye, EyeOff, Trash2, Plus, Edit3, Settings, AlertCircle, CheckCircle, Loader, Heart, Star, Trophy, Camera, Zap, Shield, Music, Bell } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

const RTSPStreamingApp = () => {
  // Stream state
  const [rtspUrl, setRtspUrl] = useState('');
  const [streams, setStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('');
  
  // Overlay state
  const [overlays, setOverlays] = useState([]);
  const [showOverlayForm, setShowOverlayForm] = useState(false);
  const [editingOverlay, setEditingOverlay] = useState(null);
  const [overlayForm, setOverlayForm] = useState({
    name: '',
    type: 'text', // 'text' or 'icon'
    content: '',
    icon: 'Heart',
    position: { x: 50, y: 50 },
    size: { width: 200, height: 50 },
    style: { color: '#ffffff', fontSize: '16px', fontWeight: 'normal' },
    visible: true,
    z_index: 1
  });
  
  // Drag state
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loadingOverlays, setLoadingOverlays] = useState(false);
  
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const overlayContainerRef = useRef(null);

  // Available icons
  const iconOptions = [
    { name: 'Heart', component: Heart },
    { name: 'Star', component: Star },
    { name: 'Trophy', component: Trophy },
    { name: 'Camera', component: Camera },
    { name: 'Zap', component: Zap },
    { name: 'Shield', component: Shield },
    { name: 'Music', component: Music },
    { name: 'Bell', component: Bell }
  ];

  // Load HLS.js dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
    script.onload = () => setHlsLoaded(true);
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const [hlsLoaded, setHlsLoaded] = useState(false);

  // Fetch streams and overlays on mount
  useEffect(() => {
    fetchStreams();
    fetchOverlays();
  }, []);

  const fetchStreams = async () => {
    try {
      const response = await fetch(`${API_BASE}/streams`);
      const data = await response.json();
      setStreams(data.streams || []);
    } catch (err) {
      setError('Failed to fetch streams');
    }
  };

  const fetchOverlays = async () => {
    setLoadingOverlays(true);
    try {
      const response = await fetch(`${API_BASE}/overlays`);
      const data = await response.json();
      setOverlays(data.overlays || []);
    } catch (err) {
      console.error('Error fetching overlays:', err);
      // For demo purposes, use mock data
      setOverlays([
        {
          _id: '1',
          name: 'Sample Text',
          type: 'text',
          content: 'LIVE',
          position: { x: 10, y: 10 },
          size: { width: 100, height: 40 },
          style: { color: '#ff0000', fontSize: '18px', fontWeight: 'bold' },
          visible: true,
          z_index: 1
        },
        {
          _id: '2', 
          name: 'Heart Icon',
          type: 'icon',
          icon: 'Heart',
          position: { x: 80, y: 80 },
          size: { width: 40, height: 40 },
          style: { color: '#ff69b4', fontSize: '24px' },
          visible: true,
          z_index: 2
        }
      ]);
    }
    setLoadingOverlays(false);
  };

  const startStream = async () => {
    if (!rtspUrl.trim()) {
      setError('Please enter an RTSP URL');
      return;
    }

    setLoading(true);
    setError('');
    setStreamStatus('Starting stream...');

    try {
      const response = await fetch(`${API_BASE}/stream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: rtspUrl })
      });

      const data = await response.json();
      
      if (response.ok) {
        setActiveStream(data);
        setStreamStatus('Stream starting, waiting for playlist...');
        await fetchStreams();
        
        // Wait for stream to be ready
        setTimeout(() => checkStreamStatus(data.stream_id), 3000);
      } else {
        setError(data.error || 'Failed to start stream');
      }
    } catch (err) {
      setError('Network error starting stream');
    } finally {
      setLoading(false);
    }
  };

  const checkStreamStatus = async (streamId) => {
    try {
      const response = await fetch(`${API_BASE}/stream/${streamId}/status`);
      const data = await response.json();
      
      if (data.playlist_ready) {
        setStreamStatus('Stream ready!');
        loadHLSStream(streamId);
      } else {
        setStreamStatus('Waiting for stream to be ready...');
        setTimeout(() => checkStreamStatus(streamId), 2000);
      }
    } catch (err) {
      setError('Failed to check stream status');
    }
  };

  const loadHLSStream = (streamId) => {
    if (!hlsLoaded || !window.Hls) return;

    const video = videoRef.current;
    const playlistUrl = `${API_BASE}/stream/${streamId}/playlist.m3u8`;

    if (window.Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new window.Hls();
      hlsRef.current = hls;
      
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);
      
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(console.error);
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          setError('Video playback error');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(console.error);
      });
    }
  };

  const stopStream = async (streamId) => {
    try {
      const response = await fetch(`${API_BASE}/stream/${streamId}/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        setActiveStream(null);
        setStreamStatus('Stream stopped');
        await fetchStreams();
      }
    } catch (err) {
      setError('Failed to stop stream');
    }
  };

  // Enhanced overlay functions from Live.jsx
  const createOverlay = async () => {
    try {
      const overlayData = { ...overlayForm };

      const response = await fetch(`${API_BASE}/overlays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlayData)
      });

      if (response.ok) {
        await fetchOverlays();
        resetOverlayForm();
        setShowOverlayForm(false);
      } else {
        // For demo, add to local state
        const newOverlay = {
          ...overlayData,
          _id: Date.now().toString()
        };
        setOverlays(prev => [...prev, newOverlay]);
        resetOverlayForm();
        setShowOverlayForm(false);
      }
    } catch (error) {
      // For demo, add to local state
      const newOverlay = {
        ...overlayForm,
        _id: Date.now().toString()
      };
      setOverlays(prev => [...prev, newOverlay]);
      resetOverlayForm();
      setShowOverlayForm(false);
    }
  };

  const updateOverlay = async () => {
    try {
      const response = await fetch(`${API_BASE}/overlays/${editingOverlay._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlayForm)
      });

      if (response.ok) {
        await fetchOverlays();
        resetOverlayForm();
        setEditingOverlay(null);
        setShowOverlayForm(false);
      } else {
        // For demo, update local state
        setOverlays(prev => prev.map(o => 
          o._id === editingOverlay._id ? { ...overlayForm, _id: editingOverlay._id } : o
        ));
        resetOverlayForm();
        setEditingOverlay(null);
        setShowOverlayForm(false);
      }
    } catch (error) {
      // For demo, update local state
      setOverlays(prev => prev.map(o => 
        o._id === editingOverlay._id ? { ...overlayForm, _id: editingOverlay._id } : o
      ));
      resetOverlayForm();
      setEditingOverlay(null);
      setShowOverlayForm(false);
    }
  };

  const deleteOverlay = async (overlayId) => {
    if (window.confirm('Are you sure you want to delete this overlay?')) {
      try {
        const response = await fetch(`${API_BASE}/overlays/${overlayId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          await fetchOverlays();
        } else {
          setOverlays(prev => prev.filter(o => o._id !== overlayId));
        }
      } catch (error) {
        setOverlays(prev => prev.filter(o => o._id !== overlayId));
      }
    }
  };

  const toggleOverlayVisibility = async (overlay) => {
    try {
      const response = await fetch(`${API_BASE}/overlays/${overlay._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !overlay.visible })
      });

      if (response.ok) {
        await fetchOverlays();
      } else {
        setOverlays(prev => prev.map(o => 
          o._id === overlay._id ? { ...o, visible: !o.visible } : o
        ));
      }
    } catch (error) {
      setOverlays(prev => prev.map(o => 
        o._id === overlay._id ? { ...o, visible: !o.visible } : o
      ));
    }
  };

  // Drag handlers
  const handleMouseDown = (e, overlay) => {
    e.preventDefault();
    const rect = overlayContainerRef.current.getBoundingClientRect();
    const overlayRect = e.currentTarget.getBoundingClientRect();
    
    setDragging(overlay._id);
    setDragOffset({
      x: e.clientX - overlayRect.left,
      y: e.clientY - overlayRect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!dragging || !overlayContainerRef.current) return;
    
    e.preventDefault();
    const rect = overlayContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - dragOffset.x - rect.left) / rect.width) * 100;
    const y = ((e.clientY - dragOffset.y - rect.top) / rect.height) * 100;
    
    const clampedX = Math.max(0, Math.min(95, x));
    const clampedY = Math.max(0, Math.min(95, y));
    
    setOverlays(prev => prev.map(overlay => 
      overlay._id === dragging 
        ? { ...overlay, position: { x: clampedX, y: clampedY } }
        : overlay
    ));
  };

  const handleMouseUp = () => {
    setDragging(null);
    setDragOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, dragOffset]);

  const resetOverlayForm = () => {
    setOverlayForm({
      name: '',
      type: 'text',
      content: '',
      icon: 'Heart',
      position: { x: 50, y: 50 },
      size: { width: 200, height: 50 },
      style: { color: '#ffffff', fontSize: '16px', fontWeight: 'normal' },
      visible: true,
      z_index: 1
    });
  };

  const startEditing = (overlay) => {
    setEditingOverlay(overlay);
    setOverlayForm({
      name: overlay.name,
      type: overlay.type || 'text',
      content: overlay.content || '',
      icon: overlay.icon || 'Heart',
      position: overlay.position,
      size: overlay.size,
      style: overlay.style || { color: '#ffffff', fontSize: '16px', fontWeight: 'normal' },
      visible: overlay.visible,
      z_index: overlay.z_index
    });
    setShowOverlayForm(true);
  };

  const handleOverlaySubmit = (e) => {
    e.preventDefault();
    if (editingOverlay) {
      updateOverlay();
    } else {
      createOverlay();
    }
  };

  const renderOverlayContent = (overlay) => {
    if (overlay.type === 'icon') {
      const IconComponent = iconOptions.find(i => i.name === overlay.icon)?.component || Heart;
      return (
        <IconComponent 
          size={parseInt(overlay.style?.fontSize) || 24}
          style={{ color: overlay.style?.color || '#ffffff' }}
        />
      );
    }
    return overlay.content;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <h1 className="text-2xl font-bold text-center">RTSP Live Streaming Dashboard</h1>
      </header>

      <div className="container mx-auto p-6">
        {error && (
          <div className="bg-red-600 text-white p-4 rounded-lg mb-6 flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="mr-2 h-4 w-4" />
              {error}
            </div>
            <button 
              onClick={() => setError('')}
              className="text-red-200 hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Panel - Stream Controls & Video */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Stream Control */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Settings className="mr-2" />
                Stream Control
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">RTSP URL</label>
                  <input
                    type="text"
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    placeholder="rtsp://your-rtsp-stream-url"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={activeStream}
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={startStream}
                    disabled={activeStream || loading}
                    className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-md transition-colors"
                  >
                    {loading ? <Loader className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                    Start Stream
                  </button>
                  
                  {activeStream && (
                    <button
                      onClick={() => stopStream(activeStream.stream_id)}
                      className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop Stream
                    </button>
                  )}
                  
                  <button
                    onClick={fetchStreams}
                    className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </button>
                </div>
                
                {/* Status Display */}
                {streamStatus && (
                  <div className="flex items-center text-sm">
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    {streamStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Video Player with Overlays */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Live Stream - Drag overlays to reposition</h2>
              
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  muted
                  playsInline
                >
                  Your browser does not support video playback.
                </video>
                
                {/* Overlay Container */}
                <div 
                  ref={overlayContainerRef}
                  className="absolute inset-0"
                >
                  {overlays
                    .filter(overlay => overlay.visible)
                    .sort((a, b) => a.z_index - b.z_index)
                    .map(overlay => (
                      <div
                        key={overlay._id}
                        className={`absolute text-white font-medium shadow-lg cursor-move select-none ${
                          dragging === overlay._id ? 'z-50' : ''
                        }`}
                        style={{
                          left: `${overlay.position.x}%`,
                          top: `${overlay.position.y}%`,
                          width: overlay.type === 'icon' ? 'auto' : `${overlay.size.width}px`,
                          height: overlay.type === 'icon' ? 'auto' : `${overlay.size.height}px`,
                          color: overlay.style?.color || '#ffffff',
                          fontSize: overlay.style?.fontSize || '16px',
                          fontWeight: overlay.style?.fontWeight || 'normal',
                          zIndex: overlay.z_index,
                          textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: overlay.type === 'text' ? 'rgba(0,0,0,0.3)' : 'transparent',
                          borderRadius: '4px',
                          padding: overlay.type === 'text' ? '4px 8px' : '4px',
                          border: dragging === overlay._id ? '2px dashed #3b82f6' : 'none'
                        }}
                        onMouseDown={(e) => handleMouseDown(e, overlay)}
                      >
                        {renderOverlayContent(overlay)}
                      </div>
                    ))}
                </div>
                
                {!activeStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
                    <p className="text-gray-400">No stream active - Demo overlays visible</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Stream & Overlay Management */}
          <div className="space-y-6">
            
            {/* Active Streams */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Active Streams</h3>
                <button
                  onClick={fetchStreams}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              
              <div className="space-y-2">
                {streams.length === 0 ? (
                  <p className="text-gray-400 text-sm">No active streams</p>
                ) : (
                  streams.map((stream) => (
                    <div
                      key={stream.stream_id}
                      className="bg-gray-700 p-3 rounded-lg text-sm"
                    >
                      <p className="font-mono text-xs text-gray-300 mb-1">
                        {stream.stream_id.slice(0, 8)}...
                      </p>
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-1 rounded text-xs ${
                          stream.playlist_ready 
                            ? 'bg-green-600 text-green-100' 
                            : 'bg-yellow-600 text-yellow-100'
                        }`}>
                          {stream.playlist_ready ? 'Ready' : 'Starting'}
                        </span>
                        <button
                          onClick={() => stopStream(stream.stream_id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Square size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Overlay Controls */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Overlays</h2>
                <button
                  onClick={() => {
                    resetOverlayForm();
                    setEditingOverlay(null);
                    setShowOverlayForm(true);
                  }}
                  className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Overlay
                </button>
              </div>

              {/* Overlay List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {loadingOverlays ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="animate-spin h-6 w-6" />
                  </div>
                ) : overlays.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No overlays created yet</p>
                ) : (
                  overlays.map(overlay => (
                    <div
                      key={overlay._id}
                      className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{overlay.name}</h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleOverlayVisibility(overlay)}
                            className={`p-1 rounded ${overlay.visible ? 'text-green-400 hover:bg-green-900' : 'text-gray-400 hover:bg-gray-600'}`}
                          >
                            {overlay.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => startEditing(overlay)}
                            className="p-1 text-blue-400 hover:bg-blue-900 rounded"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteOverlay(overlay._id)}
                            className="p-1 text-red-400 hover:bg-red-900 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-300 mb-2">
                        {overlay.type === 'icon' ? `Icon: ${overlay.icon}` : `"${overlay.content}"`}
                      </p>
                      
                      <div className="text-xs text-gray-400 grid grid-cols-2 gap-2">
                        <span>Position: {Math.round(overlay.position.x)}%, {Math.round(overlay.position.y)}%</span>
                        <span>Type: {overlay.type}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Overlay Form Modal */}
        {showOverlayForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">
                {editingOverlay ? 'Edit Overlay' : 'Create New Overlay'}
              </h3>
              
              <form onSubmit={handleOverlaySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  <input
                    type="text"
                    value={overlayForm.name}
                    onChange={(e) => setOverlayForm({...overlayForm, name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <select
                    value={overlayForm.type}
                    onChange={(e) => setOverlayForm({...overlayForm, type: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="text">Text</option>
                    <option value="icon">Icon</option>
                  </select>
                </div>
                
                {overlayForm.type === 'text' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">Text Content</label>
                    <textarea
                      value={overlayForm.content}
                      onChange={(e) => setOverlayForm({...overlayForm, content: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">Icon</label>
                    <select
                      value={overlayForm.icon}
                      onChange={(e) => setOverlayForm({...overlayForm, icon: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      {iconOptions.map(icon => (
                        <option key={icon.name} value={icon.name}>{icon.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">X Position (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(overlayForm.position.x)}
                      onChange={(e) => setOverlayForm({
                        ...overlayForm, 
                        position: {...overlayForm.position, x: parseInt(e.target.value)}
                      })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Y Position (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(overlayForm.position.y)}
                      onChange={(e) => setOverlayForm({
                        ...overlayForm, 
                        position: {...overlayForm.position, y: parseInt(e.target.value)}
                      })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                {overlayForm.type === 'text' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Width (px)</label>
                      <input
                        type="number"
                        min="50"
                        max="800"
                        value={overlayForm.size.width}
                        onChange={(e) => setOverlayForm({
                          ...overlayForm, 
                          size: {...overlayForm.size, width: parseInt(e.target.value)}
                        })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Height (px)</label>
                      <input
                        type="number"
                        min="20"
                        max="200"
                        value={overlayForm.size.height}
                        onChange={(e) => setOverlayForm({
                          ...overlayForm, 
                          size: {...overlayForm.size, height: parseInt(e.target.value)}
                        })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <input
                    type="color"
                    value={overlayForm.style.color}
                    onChange={(e) => setOverlayForm({
                      ...overlayForm, 
                      style: {...overlayForm.style, color: e.target.value}
                    })}
                            className="w-full h-10 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Font Size (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="48"
                    value={parseInt(overlayForm.style.fontSize)}
                    onChange={(e) => setOverlayForm({
                      ...overlayForm, 
                      style: {...overlayForm.style, fontSize: e.target.value + 'px'}
                    })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="visible"
                    checked={overlayForm.visible}
                    onChange={(e) => setOverlayForm({...overlayForm, visible: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="visible" className="text-sm">Visible</label>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    {editingOverlay ? 'Update' : 'Create'} Overlay
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverlayForm(false);
                      setEditingOverlay(null);
                      resetOverlayForm();
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RTSPStreamingApp;
              
              